import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPublicPedidoDTO } from "@/lib/orders";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id || id.length > 64) {
    return NextResponse.json(
      { error: "Pedido não encontrado." },
      { status: 404 }
    );
  }

  try {
    const pedido = await db.pedido.findUnique({
      where: { id },
      include: { itens: true },
    });

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { pedido: toPublicPedidoDTO(pedido) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao consultar pedido:", error);
    return NextResponse.json(
      { error: "Erro ao consultar o pedido." },
      { status: 500 }
    );
  }
}
