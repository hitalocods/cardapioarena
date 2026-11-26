import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { OPEN_ORDER_STATUSES } from "@/lib/format";

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const onlyOpen = searchParams.get("abertos") !== "false";

  try {
    const pedidos = await db.pedido.findMany({
      where: onlyOpen ? { status: { in: OPEN_ORDER_STATUSES } } : undefined,
      orderBy: { createdAt: "desc" },
      take: onlyOpen ? 100 : 150,
      include: {
        itens: {
          orderBy: { id: "asc" },
        },
      },
    });

    return NextResponse.json(
      { pedidos },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao listar pedidos no admin:", error);
    return NextResponse.json(
      { error: "Erro ao buscar pedidos." },
      { status: 500 }
    );
  }
}
