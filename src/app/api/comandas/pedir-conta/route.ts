import { NextResponse, after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendBillRequestPush } from "@/lib/push";

const pedirContaSchema = z.object({
  mesaNumero: z.number().int("Mesa inválida.").min(1).max(9999),
  escopo: z.enum(["INDIVIDUAL", "MESA"]),
  nomeCliente: z.string().trim().max(80).optional().nullable(),
});

const COOLDOWN_SECONDS = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados da solicitação inválidos." },
      { status: 400 }
    );
  }

  const parsed = pedirContaSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const { mesaNumero, escopo } = parsed.data;
  const nomeClean = parsed.data.nomeCliente?.trim() ?? "";

  if (escopo === "INDIVIDUAL" && nomeClean.length < 2) {
    return NextResponse.json(
      { error: "Informe seu nome para pedir só a sua conta." },
      { status: 400 }
    );
  }

  try {
    const mesa = await db.mesa.findFirst({
      where: { numero: mesaNumero, ativa: true },
      select: { id: true },
    });
    if (!mesa) {
      return NextResponse.json(
        { error: "Mesa não encontrada ou indisponível." },
        { status: 404 }
      );
    }

    const detalhes =
      escopo === "INDIVIDUAL" ? `Só ${nomeClean}` : "Mesa toda";

    // Atualização atômica com limite de 1 pedido a cada 2 minutos por mesa
    const affected = await db.$executeRaw`
      UPDATE "Comanda"
      SET
        "pediuConta" = true,
        "pediuContaEm" = NOW(),
        "pediuContaDetalhes" = ${detalhes},
        "updatedAt" = NOW()
      WHERE "mesaAberta" = ${mesaNumero}
        AND "tipo" = 'MESA'::"ComandaTipo"
        AND "status" = 'ABERTA'::"ComandaStatus"
        AND (
          "pediuContaEm" IS NULL
          OR "pediuContaEm" <= NOW() - INTERVAL '2 minutes'
        )
    `;

    if (affected === 0) {
      const comanda = await db.comanda.findUnique({
        where: { mesaAberta: mesaNumero },
        select: { id: true, pediuContaEm: true },
      });

      if (!comanda) {
        return NextResponse.json(
          {
            error:
              "Ainda não há comanda aberta nesta mesa. Envie um pedido primeiro.",
          },
          { status: 404 }
        );
      }

      const elapsedSeconds = comanda.pediuContaEm
        ? Math.floor((Date.now() - comanda.pediuContaEm.getTime()) / 1000)
        : 0;
      const retryAfterSeconds = Math.max(1, COOLDOWN_SECONDS - elapsedSeconds);

      return NextResponse.json(
        {
          error: `A conta desta mesa já foi solicitada há pouco. Aguarde ${retryAfterSeconds}s para chamar novamente.`,
          retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    after(async () => {
      await sendBillRequestPush({
        mesaNumero,
        escopo,
        nomeCliente: nomeClean,
      });
    });

    return NextResponse.json({
      ok: true,
      detalhes,
      message:
        escopo === "INDIVIDUAL"
          ? `Conta solicitada (só ${nomeClean})! Já avisamos a equipe.`
          : "Conta da mesa solicitada! Já avisamos a equipe.",
    });
  } catch (error) {
    console.error("Erro ao solicitar a conta:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar o pedido de conta. Tente novamente." },
      { status: 500 }
    );
  }
}
