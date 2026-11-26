import { NextResponse } from "next/server";
import { PedidoStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { ALLOWED_STATUS_TRANSITIONS } from "@/lib/format";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

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

      const allowed = ALLOWED_STATUS_TRANSITIONS[current.status];
      if (!allowed.includes(nextStatus)) {
        throw new InvalidTransitionError(
          `Transição inválida de ${current.status} para ${nextStatus}.`
        );
      }

      // Update condicional para impedir que dois cliques/funcionários executem a transição duas vezes
      const result = await tx.pedido.updateMany({
        where: {
          id,
          status: current.status,
        },
        data: {
          status: nextStatus,
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new ConcurrentUpdateError();
      }

      // Cancelar devolve estoque uma única vez, ordenado por produtoId para evitar deadlocks
      if (nextStatus === PedidoStatus.CANCELADO) {
        const restockMap = new Map<string, number>();
        for (const item of current.itens) {
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
