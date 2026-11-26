import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const produtos = await db.produto.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        descricao: true,
        preco: true,
        foto: true,
        ordem: true,
        controlaEstoque: true,
        estoque: true,
      },
    });

    return NextResponse.json(
      { produtos },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro ao carregar cardápio:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o cardápio." },
      { status: 500 }
    );
  }
}
