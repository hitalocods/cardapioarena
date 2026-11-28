import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { loadComandaDetail } from "@/lib/comandas";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;

  const { id } = await context.params;

  try {
    const comanda = await loadComandaDetail(id);
    if (!comanda) {
      return NextResponse.json(
        { error: "Comanda não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { comanda },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao buscar detalhe da comanda:", error);
    return NextResponse.json(
      { error: "Erro ao carregar comanda." },
      { status: 500 }
    );
  }
}
