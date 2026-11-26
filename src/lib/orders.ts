import type { ItemPedido, Pedido, PedidoStatus } from "@prisma/client";

export interface PublicPedidoDTO {
  id: string;
  numero: number;
  nomeCliente: string;
  mesaNumero: number;
  observacao: string | null;
  status: PedidoStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
  itens: Array<{
    id: string;
    produtoId: string | null;
    nomeSnapshot: string;
    precoSnapshot: number;
    quantidade: number;
  }>;
}

export type PedidoWithItens = Pedido & { itens: ItemPedido[] };

/**
 * Converte um pedido para o formato público (sem telefone e sem IP).
 */
export function toPublicPedidoDTO(pedido: PedidoWithItens): PublicPedidoDTO {
  return {
    id: pedido.id,
    numero: pedido.numero,
    nomeCliente: pedido.nomeCliente,
    mesaNumero: pedido.mesaNumero,
    observacao: pedido.observacao,
    status: pedido.status,
    total: pedido.total,
    createdAt: pedido.createdAt.toISOString(),
    updatedAt: pedido.updatedAt.toISOString(),
    itens: pedido.itens.map((item) => ({
      id: item.id,
      produtoId: item.produtoId,
      nomeSnapshot: item.nomeSnapshot,
      precoSnapshot: item.precoSnapshot,
      quantidade: item.quantidade,
    })),
  };
}
