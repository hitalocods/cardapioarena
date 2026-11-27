import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { lockComandaForUpdate } from "@/lib/comandas";

const cancelarBalcaoSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, "Informe o motivo do cancelamento (mínimo 3 caracteres).")
    .max(300, "Motivo muito longo."),
});

class CancelarBalcaoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ comandaId: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { comandaId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = cancelarBalcaoSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Motivo inválido.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const motivo = parsed.data.motivo;

  try {
    const result = await db.$transaction(
      async (tx) => {
        const locked = await lockComandaForUpdate(tx, comandaId);
        if (!locked) {
          throw new CancelarBalcaoError(404, "Venda de balcão não encontrada.");
        }
        if (locked.tipo !== "BALCAO") {
          throw new CancelarBalcaoError(
            400,
            "Esta operação é exclusiva para vendas de balcão."
          );
        }

        const pedido = await tx.pedido.findFirst({
          where: { comandaId },
          include: { itens: true },
        });
        if (!pedido) {
          throw new CancelarBalcaoError(
            404,
            "Pedido da venda de balcão não encontrado."
          );
        }

        // Update condicional atômico: garante devolução única de estoque mesmo com cliques simultâneos
        const affectedPedido = await tx.$executeRaw`
          UPDATE "Pedido"
          SET
            "status" = 'CANCELADO'::"PedidoStatus",
            "motivoCancelamento" = ${motivo},
            "updatedAt" = NOW()
          WHERE "id" = ${pedido.id}
            AND "status" <> 'CANCELADO'::"PedidoStatus"
        `;

        if (affectedPedido === 0) {
          throw new CancelarBalcaoError(
            409,
            "Esta venda de balcão já foi cancelada."
          );
        }

        await tx.$executeRaw`
          UPDATE "Pagamento"
          SET
            "status" = 'ESTORNADO'::"PagamentoStatus",
            "motivoEstorno" = ${motivo},
            "updatedAt" = NOW()
          WHERE "comandaId" = ${comandaId}
            AND "status" = 'ATIVO'::"PagamentoStatus"
        `;

        await tx.itemPedido.updateMany({
          where: { pedidoId: pedido.id },
          data: { pagamentoId: null },
        });

        const restockMap = new Map<string, number>();
        for (const item of pedido.itens) {
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

        return {
          comandaId,
          pedidoId: pedido.id,
          motivo,
        };
      },
      { maxWait: 20000, timeout: 20000 }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CancelarBalcaoError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Erro ao cancelar venda de balcão:", error);
    return NextResponse.json(
      { error: "Não foi possível cancelar a venda de balcão." },
      { status: 500 }
    );
  }
}
