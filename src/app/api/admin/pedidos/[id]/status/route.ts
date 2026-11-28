import { NextResponse } from "next/server";
import { PedidoStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/format";
import { computeComandaTotals, lockComandaForUpdate } from "@/lib/comandas";

const statusSchema = z.object({
  status: z.nativeEnum(PedidoStatus),
});

class NotFoundError extends Error {}
class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
  }
}
class ConcurrentUpdateError extends Error {}
class ComandaConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;
  const executorRole = auth.role;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const nextStatus = parsed.data.status;

  try {
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.pedido.findUnique({
        where: { id },
        include: { itens: true },
      });

      if (!current) {
        throw new NotFoundError();
      }

      if (current.status === nextStatus) {
        return current;
      }

      const allowed = ALLOWED_STATUS_TRANSITIONS[current.status];
      if (!allowed.includes(nextStatus)) {
        throw new InvalidTransitionError(
          `Transição inválida de ${current.status} para ${nextStatus}.`
        );
      }

      if (
        nextStatus === PedidoStatus.CANCELADO &&
        current.origem === "BALCAO"
      ) {
        throw new ComandaConflictError(
          "Para cancelar uma venda de balcão, acesse a aba Balcão e informe o motivo do cancelamento."
        );
      }

      let itensParaEstorno = current.itens;

      if (nextStatus === PedidoStatus.CANCELADO && current.comandaId) {
        const lockedComanda = await lockComandaForUpdate(tx, current.comandaId);
        if (lockedComanda && lockedComanda.status !== "ABERTA") {
          throw new ComandaConflictError(
            "Não é possível cancelar um pedido de uma comanda já fechada."
          );
        }

        const [itensAtualizados, pedidosComanda, pagamentosAtivos] =
          await Promise.all([
            tx.itemPedido.findMany({ where: { pedidoId: id } }),
            tx.pedido.findMany({
              where: {
                comandaId: current.comandaId,
                status: { not: "CANCELADO" },
                id: { not: id },
              },
              include: { itens: true },
            }),
            tx.pagamento.findMany({
              where: { comandaId: current.comandaId, status: "ATIVO" },
            }),
          ]);

        itensParaEstorno = itensAtualizados;

        if (itensAtualizados.some((item) => item.pagamentoId !== null)) {
          throw new ComandaConflictError(
            "Não é possível cancelar este pedido porque um ou mais itens já foram pagos. Estorne o pagamento na comanda antes de cancelar."
          );
        }

        const { saldo } = computeComandaTotals(pedidosComanda, pagamentosAtivos);
        if (saldo < 0) {
          throw new ComandaConflictError(
            "Não é possível cancelar este pedido porque os pagamentos já registrados na comanda superam o novo total. Estorne o pagamento antes."
          );
        }
      }

      // Update condicional para impedir que dois cliques/funcionários executem a transição duas vezes
      const result = await tx.pedido.updateMany({
        where: {
          id,
          status: current.status,
        },
        data: {
          status: nextStatus,
          ...(nextStatus === PedidoStatus.CANCELADO
            ? { canceladoPorPerfil: executorRole }
            : {}),
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new ConcurrentUpdateError();
      }

      // Cancelar devolve estoque uma única vez, ordenado por produtoId para evitar deadlocks
      if (nextStatus === PedidoStatus.CANCELADO) {
        const restockMap = new Map<string, number>();
        for (const item of itensParaEstorno) {
          if (item.produtoId) {
            restockMap.set(
              item.produtoId,
              (restockMap.get(item.produtoId) ?? 0) + item.quantidade
            );
          }
        }

        const sortedRestock = Array.from(restockMap.entries()).sort((a, b) =>
          a[0].localeCompare(b[0])
        );

        for (const [produtoId, qty] of sortedRestock) {
          await tx.$executeRaw`
            UPDATE "Produto"
            SET "estoque" = "estoque" + ${qty}, "updatedAt" = NOW()
            WHERE "id" = ${produtoId}
              AND "controlaEstoque" = true
          `;
        }
      }

      return tx.pedido.findUnique({
        where: { id },
        include: { itens: true },
      });
    });

    return NextResponse.json({ pedido: updated });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 }
      );
    }
    if (error instanceof InvalidTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ComandaConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ConcurrentUpdateError) {
      return NextResponse.json(
        {
          error:
            "Este pedido já foi atualizado por outro atendimento. Atualize a lista.",
        },
        { status: 409 }
      );
    }
    console.error("Erro ao atualizar status do pedido:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar o pedido." },
      { status: 500 }
    );
  }
}
