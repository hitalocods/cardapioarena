import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;

  try {
    const [mesas, produtos] = await Promise.all([
      db.mesa.findMany({
        where: { ativa: true },
        orderBy: { numero: "asc" },
        select: { id: true, numero: true, ativa: true },
      }),
      db.produto.findMany({
        where: { ativo: true },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        select: {
          id: true,
          nome: true,
          categoria: true,
          preco: true,
          ativo: true,
          controlaEstoque: true,
          estoque: true,
        },
      }),
    ]);

    return NextResponse.json(
      { mesas, produtos },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao carregar catálogo operacional:", error);
    return NextResponse.json(
      { error: "Erro ao carregar catálogo operacional." },
      { status: 500 }
    );
  }
}
