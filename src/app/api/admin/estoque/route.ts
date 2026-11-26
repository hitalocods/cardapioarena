import { NextResponse } from "next/server";
import { PedidoStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { OPEN_ORDER_STATUSES } from "@/lib/format";

function getStartOfTodaySaoPaulo(): Date {
  const spDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return new Date(`${spDate}T00:00:00-03:00`);
}

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const inicioHoje = getStartOfTodaySaoPaulo();

    const [produtos, pedidosHoje] = await Promise.all([
      db.produto.findMany({
        orderBy: [{ categoria: "asc" }, { ordem: "asc" }, { nome: "asc" }],
      }),
      db.pedido.findMany({
        where: {
          createdAt: { gte: inicioHoje },
          status: { not: PedidoStatus.CANCELADO },
        },
        select: {
          status: true,
          itens: {
            select: {
              produtoId: true,
              quantidade: true,
            },
          },
        },
      }),
    ]);

    const openSet = new Set<PedidoStatus>(OPEN_ORDER_STATUSES);
    const emAbertoMap = new Map<string, number>();
    const entreguesMap = new Map<string, number>();

    for (const pedido of pedidosHoje) {
      const targetMap = openSet.has(pedido.status) ? emAbertoMap : entreguesMap;
      for (const item of pedido.itens) {
        if (!item.produtoId) continue;
        targetMap.set(
          item.produtoId,
          (targetMap.get(item.produtoId) ?? 0) + item.quantidade
        );
      }
    }

    const enriched = produtos.map((p) => {
      const emAbertoHoje = emAbertoMap.get(p.id) ?? 0;
      const entreguesHoje = entreguesMap.get(p.id) ?? 0;
      return {
        ...p,
        emAbertoHoje,
        entreguesHoje,
        vendidosHoje: emAbertoHoje + entreguesHoje,
      };
    });

    return NextResponse.json(
      { produtos: enriched },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao carregar estoque:", error);
    return NextResponse.json(
      { error: "Erro ao carregar controle de estoque." },
      { status: 500 }
    );
  }
}
