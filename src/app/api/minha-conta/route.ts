import { NextResponse } from "next/server";
import type { ComandaStatus, PedidoStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const minhaContaSchema = z.object({
  pedidoIds: z
    .array(z.string().trim().min(10).max(64))
    .max(50, "Limite de pedidos excedido."),
  mesaNumero: z.number().int().min(1).max(9999).optional(),
});

export interface MinhaContaPedidoDTO {
  id: string;
  numero: number;
  status: PedidoStatus;
  observacao: string | null;
  total: number;
  createdAt: string;
  comandaStatus: ComandaStatus | null;
  itens: Array<{
    id: string;
    nomeSnapshot: string;
    precoSnapshot: number;
    quantidade: number;
    subtotal: number;
    pago: boolean;
  }>;
}

export interface MinhaContaResponseDTO {
  pedidos: MinhaContaPedidoDTO[];
  totalConsumido: number;
  totalPago: number;
  totalPendente: number;
  temComandaAberta: boolean;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados da consulta inválidos." },
      { status: 400 }
    );
  }

  const parsed = minhaContaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Lista de pedidos inválida." },
      { status: 400 }
    );
  }

  const uniqueIds = Array.from(new Set(parsed.data.pedidoIds));
  const mesaNumero = parsed.data.mesaNumero;

  try {
    if (uniqueIds.length === 0) {
      const empty: MinhaContaResponseDTO = {
        pedidos: [],
        totalConsumido: 0,
        totalPago: 0,
        totalPendente: 0,
        temComandaAberta: false,
      };
      return NextResponse.json(empty, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Busca estritamente pelos IDs (cuid aleatórios) salvos no aparelho deste cliente.
    // Nunca retorna telefone, IP ou pedidos de outras pessoas.
    const dbPedidos = await db.pedido.findMany({
      where: {
        id: { in: uniqueIds },
        ...(typeof mesaNumero === "number" ? { mesaNumero } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        numero: true,
        status: true,
        observacao: true,
        total: true,
        createdAt: true,
        comanda: {
          select: {
            status: true,
          },
        },
        itens: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            nomeSnapshot: true,
            precoSnapshot: true,
            quantidade: true,
            pagamentoId: true,
          },
        },
      },
    });

    // Prioriza pedidos de comandas ainda abertas (ou sem comanda); só cai para histórico se não houver comanda aberta
    const hasOpenComandaPedido = dbPedidos.some(
      (p) => p.comanda?.status === "ABERTA" || p.comanda === null
    );
    const activeScopePedidos = hasOpenComandaPedido
      ? dbPedidos.filter((p) => p.comanda?.status !== "FECHADA")
      : dbPedidos;

    let totalConsumido = 0;
    let totalPago = 0;
    let totalPendente = 0;

    const pedidos: MinhaContaPedidoDTO[] = activeScopePedidos.map((p) => {
      const isCancelled = p.status === "CANCELADO";
      const itens = p.itens.map((i) => {
        const subtotal = i.precoSnapshot * i.quantidade;
        const pago = i.pagamentoId !== null;
        if (!isCancelled) {
          totalConsumido += subtotal;
          if (pago) {
            totalPago += subtotal;
          } else {
            totalPendente += subtotal;
          }
        }
        return {
          id: i.id,
          nomeSnapshot: i.nomeSnapshot,
          precoSnapshot: i.precoSnapshot,
          quantidade: i.quantidade,
          subtotal,
          pago,
        };
      });

      return {
        id: p.id,
        numero: p.numero,
        status: p.status,
        observacao: p.observacao,
        total: p.total,
        createdAt: p.createdAt.toISOString(),
        comandaStatus: p.comanda?.status ?? null,
        itens,
      };
    });

    const response: MinhaContaResponseDTO = {
      pedidos,
      totalConsumido,
      totalPago,
      totalPendente,
      temComandaAberta: dbPedidos.some((p) => p.comanda?.status === "ABERTA"),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Erro ao consultar minha conta:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar sua conta agora." },
      { status: 500 }
    );
  }
}
