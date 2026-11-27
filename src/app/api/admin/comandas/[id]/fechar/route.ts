import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import {
  computeComandaTotals,
  loadComandaDetail,
  lockComandaForUpdate,
} from "@/lib/comandas";

const fecharSchema = z
  .object({
    forcarComSaldo: z.boolean().optional(),
    motivo: z.string().trim().max(300, "Motivo muito longo.").optional(),
  })
  .optional();

class FecharComandaError extends Error {
  status: number;
  saldo?: number;
  constructor(status: number, message: string, saldo?: number) {
    super(message);
    this.status = status;
    this.saldo = saldo;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id: comandaId } = await context.params;

  let body: unknown = {};
  const rawText = await request.text();
  if (rawText.trim().length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }
  }

  const parsed = fecharSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const forcarComSaldo = parsed.data?.forcarComSaldo === true;
  const motivo = parsed.data?.motivo?.trim() ?? "";

  try {
    const comanda = await db.$transaction(
      async (tx) => {
        const locked = await lockComandaForUpdate(tx, comandaId);
        if (!locked) {
          throw new FecharComandaError(404, "Comanda não encontrada.");
        }
        if (locked.status !== "ABERTA") {
          throw new FecharComandaError(409, "Esta comanda já foi fechada.");
        }

        const [pedidos, pagamentosAtivos] = await Promise.all([
          tx.pedido.findMany({
            where: { comandaId, status: { not: "CANCELADO" } },
            include: { itens: true },
          }),
          tx.pagamento.findMany({
            where: { comandaId, status: "ATIVO" },
          }),
        ]);

        const { saldo } = computeComandaTotals(pedidos, pagamentosAtivos);

        if (saldo > 0) {
          if (!forcarComSaldo || motivo.length < 3) {
            throw new FecharComandaError(
              409,
              "A comanda ainda possui saldo pendente. Quite o saldo ou confirme o fechamento informando o motivo.",
              saldo
            );
          }
        }

        await tx.comanda.update({
          where: { id: comandaId },
          data: {
            status: "FECHADA",
            mesaAberta: null,
            fechadaEm: new Date(),
            pediuConta: false,
            pediuContaDetalhes: null,
            motivoFechamentoPendente: saldo > 0 ? motivo : null,
          },
        });

        return loadComandaDetail(comandaId, tx);
      },
      { maxWait: 20000, timeout: 20000 }
    );

    return NextResponse.json({ comanda });
  } catch (error) {
    if (error instanceof FecharComandaError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(typeof error.saldo === "number" ? { saldo: error.saldo } : {}),
        },
        { status: error.status }
      );
    }
    console.error("Erro ao fechar comanda:", error);
    return NextResponse.json(
      { error: "Não foi possível fechar a comanda." },
      { status: 500 }
    );
  }
}
