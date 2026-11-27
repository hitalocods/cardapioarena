import { NextResponse } from "next/server";
import { ComandaStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { buildComandaSummaryDTO } from "@/lib/comandas";

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const status: ComandaStatus =
    rawStatus === ComandaStatus.FECHADA
      ? ComandaStatus.FECHADA
      : ComandaStatus.ABERTA;

  try {
    const comandas = await db.comanda.findMany({
      where: { status, tipo: "MESA" },
      orderBy:
        status === ComandaStatus.ABERTA
          ? [{ pediuConta: "desc" }, { abertaEm: "asc" }]
          : [{ fechadaEm: "desc" }],
      take: status === ComandaStatus.ABERTA ? 100 : 50,
      include: {
        pedidos: {
          include: {
            itens: true,
          },
        },
        pagamentos: true,
      },
    });

    return NextResponse.json(
      { comandas: comandas.map(buildComandaSummaryDTO) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao listar comandas:", error);
    return NextResponse.json(
      { error: "Erro ao buscar comandas." },
      { status: 500 }
    );
  }
}
