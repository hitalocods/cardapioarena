import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { loadComandaDetail, lockComandaForUpdate } from "@/lib/comandas";

const estornarSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, "Informe o motivo do estorno (mínimo 3 caracteres).")
    .max(300, "Motivo muito longo."),
});

class EstornoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; pagamentoId: string }> }
) {
  const auth = await requireRole("DONO");
  if (auth.response) return auth.response;
  const executorRole = auth.role;

  const { id: comandaId, pagamentoId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = estornarSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Motivo inválido.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const comanda = await db.$transaction(
      async (tx) => {
        const locked = await lockComandaForUpdate(tx, comandaId);
        if (!locked) {
          throw new EstornoError(404, "Comanda não encontrada.");
        }
        if (locked.status !== "ABERTA") {
          throw new EstornoError(
            409,
            "Só é possível estornar pagamentos de uma comanda aberta."
          );
        }

        const affectedPag = await tx.$executeRaw`
          UPDATE "Pagamento"
          SET
            "status" = 'ESTORNADO'::"PagamentoStatus",
            "motivoEstorno" = ${parsed.data.motivo},
            "estornadoPorPerfil" = ${executorRole}::"AdminPerfil",
            "updatedAt" = NOW()
          WHERE "id" = ${pagamentoId}
            AND "comandaId" = ${comandaId}
            AND "status" = 'ATIVO'::"PagamentoStatus"
        `;

        if (affectedPag === 0) {
          throw new EstornoError(
            409,
            "Pagamento não encontrado ou já estornado."
          );
        }

        await tx.$executeRaw`
          UPDATE "ItemPedido"
          SET "pagamentoId" = NULL
          WHERE "pagamentoId" = ${pagamentoId}
        `;

        return loadComandaDetail(comandaId, tx);
      },
      { maxWait: 20000, timeout: 20000 }
    );

    return NextResponse.json({ comanda });
  } catch (error) {
    if (error instanceof EstornoError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("Erro ao estornar pagamento:", error);
    return NextResponse.json(
      { error: "Não foi possível estornar o pagamento." },
      { status: 500 }
    );
  }
}
