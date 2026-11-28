import crypto from "node:crypto";
import type {
  AdminPerfil,
  ComandaStatus,
  ComandaTipo,
  FormaPagamento,
  ItemPedido,
  Pagamento,
  PagamentoStatus,
  Pedido,
  PedidoStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { db } from "@/lib/db";
import { isOpenOrderStatus, splitEquallyCentavos } from "@/lib/format";

export { splitEquallyCentavos };

export type DbOrTx = PrismaClient | Prisma.TransactionClient;

export interface LockedComandaRow {
  id: string;
  tipo: ComandaTipo;
  mesaNumero: number | null;
  status: ComandaStatus;
  mesaAberta: number | null;
  abertaEm: Date;
  fechadaEm: Date | null;
  pediuConta: boolean;
  pediuContaEm: Date | null;
  pediuContaDetalhes: string | null;
  motivoFechamentoPendente: string | null;
}

export interface ComandaItemDTO {
  id: string;
  pedidoId: string;
  pedidoNumero: number;
  pedidoStatus: PedidoStatus;
  nomeSnapshot: string;
  precoSnapshot: number;
  quantidade: number;
  subtotal: number;
  pagamentoId: string | null;
  pago: boolean;
  createdAt: string;
}

export interface ComandaPessoaDTO {
  telefone: string;
  nome: string;
  itens: ComandaItemDTO[];
  subtotal: number;
  valorPago: number;
  valorPendente: number;
  tudoPago: boolean;
}

export interface ComandaPedidoDTO {
  id: string;
  numero: number;
  nomeCliente: string;
  telefone: string;
  status: PedidoStatus;
  observacao: string | null;
  total: number;
  createdAt: string;
  itens: Array<{
    id: string;
    nomeSnapshot: string;
    precoSnapshot: number;
    quantidade: number;
    pagamentoId: string | null;
  }>;
}

export interface ComandaPagamentoDTO {
  id: string;
  valor: number;
  forma: FormaPagamento;
  pagador: string | null;
  recebidoPor: string | null;
  executadoPorPerfil: AdminPerfil | null;
  status: PagamentoStatus;
  motivoEstorno: string | null;
  estornadoPorPerfil: AdminPerfil | null;
  createdAt: string;
  itensCount: number;
}

export interface ComandaSummaryDTO {
  id: string;
  tipo: ComandaTipo;
  mesaNumero: number | null;
  status: ComandaStatus;
  abertaEm: string;
  fechadaEm: string | null;
  pediuConta: boolean;
  pediuContaEm: string | null;
  pediuContaDetalhes: string | null;
  qtdPessoas: number;
  total: number;
  pago: number;
  saldo: number;
  qtdPedidosAbertosCozinha: number;
}

export interface ComandaDetailDTO extends ComandaSummaryDTO {
  motivoFechamentoPendente: string | null;
  pessoas: ComandaPessoaDTO[];
  pedidos: ComandaPedidoDTO[];
  pagamentos: ComandaPagamentoDTO[];
}

export type ComandaWithRelations = {
  id: string;
  tipo: ComandaTipo;
  mesaNumero: number | null;
  status: ComandaStatus;
  mesaAberta: number | null;
  abertaEm: Date;
  fechadaEm: Date | null;
  pediuConta: boolean;
  pediuContaEm: Date | null;
  pediuContaDetalhes: string | null;
  motivoFechamentoPendente: string | null;
  pedidos: Array<Pedido & { itens: ItemPedido[] }>;
  pagamentos: Array<
    Pagamento & {
      _count?: { itens: number };
      itens?: Array<{ id: string }>;
    }
  >;
};

/**
 * Garante exatamente 1 comanda ABERTA por mesa em cenários concorrentes.
 * Usa FOR SHARE na leitura (bloqueia contra fechamento simultâneo) e
 * ON CONFLICT ("mesaAberta") DO NOTHING na criação.
 */
export async function ensureOpenComandaForMesa(
  tx: Prisma.TransactionClient,
  mesaNumero: number
): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Comanda"
      WHERE "mesaAberta" = ${mesaNumero}
        AND "tipo" = 'MESA'::"ComandaTipo"
        AND "status" = 'ABERTA'::"ComandaStatus"
      FOR SHARE
    `;

    if (existing[0]?.id) {
      return { id: existing[0].id };
    }

    const candidateId = `cmd_${crypto.randomBytes(12).toString("hex")}`;
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Comanda" (
        "id",
        "tipo",
        "mesaNumero",
        "status",
        "mesaAberta",
        "abertaEm",
        "pediuConta",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${candidateId},
        'MESA'::"ComandaTipo",
        ${mesaNumero},
        'ABERTA'::"ComandaStatus",
        ${mesaNumero},
        NOW(),
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT ("mesaAberta") DO NOTHING
      RETURNING "id"
    `;

    if (inserted[0]?.id) {
      return { id: inserted[0].id };
    }
  }

  throw new Error(`Não foi possível obter comanda aberta para a mesa ${mesaNumero}.`);
}

export async function lockComandaForUpdate(
  tx: Prisma.TransactionClient,
  comandaId: string
): Promise<LockedComandaRow | null> {
  const rows = await tx.$queryRaw<LockedComandaRow[]>`
    SELECT
      "id",
      "tipo",
      "mesaNumero",
      "status",
      "mesaAberta",
      "abertaEm",
      "fechadaEm",
      "pediuConta",
      "pediuContaEm",
      "pediuContaDetalhes",
      "motivoFechamentoPendente"
    FROM "Comanda"
    WHERE "id" = ${comandaId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export function computeComandaTotals(
  pedidos: Array<Pick<Pedido, "status"> & { itens: Array<Pick<ItemPedido, "precoSnapshot" | "quantidade">> }>,
  pagamentos: Array<Pick<Pagamento, "status" | "valor">>
): { total: number; pago: number; saldo: number } {
  let total = 0;
  for (const pedido of pedidos) {
    if (pedido.status === "CANCELADO") continue;
    for (const item of pedido.itens) {
      total += item.precoSnapshot * item.quantidade;
    }
  }

  let pago = 0;
  for (const pagamento of pagamentos) {
    if (pagamento.status === "ATIVO") {
      pago += pagamento.valor;
    }
  }

  return {
    total,
    pago,
    saldo: total - pago,
  };
}

export function buildComandaSummaryDTO(
  comanda: ComandaWithRelations
): ComandaSummaryDTO {
  const { total, pago, saldo } = computeComandaTotals(
    comanda.pedidos,
    comanda.pagamentos
  );

  const pessoasTelefones = new Set<string>();
  let qtdPedidosAbertosCozinha = 0;

  for (const pedido of comanda.pedidos) {
    if (pedido.status !== "CANCELADO") {
      pessoasTelefones.add(pedido.telefone);
    }
    if (isOpenOrderStatus(pedido.status)) {
      qtdPedidosAbertosCozinha += 1;
    }
  }

  return {
    id: comanda.id,
    tipo: comanda.tipo,
    mesaNumero: comanda.mesaNumero,
    status: comanda.status,
    abertaEm: comanda.abertaEm.toISOString(),
    fechadaEm: comanda.fechadaEm ? comanda.fechadaEm.toISOString() : null,
    pediuConta: comanda.pediuConta,
    pediuContaEm: comanda.pediuContaEm ? comanda.pediuContaEm.toISOString() : null,
    pediuContaDetalhes: comanda.pediuContaDetalhes,
    qtdPessoas: pessoasTelefones.size,
    total,
    pago,
    saldo,
    qtdPedidosAbertosCozinha,
  };
}

export function buildComandaDetailDTO(
  comanda: ComandaWithRelations
): ComandaDetailDTO {
  const summary = buildComandaSummaryDTO(comanda);

  // Agrupar pedidos não cancelados por TELEFONE para manter homônimos separados
  const pessoasMap = new Map<
    string,
    {
      telefone: string;
      nome: string;
      latestCreatedAt: number;
      itens: ComandaItemDTO[];
      subtotal: number;
      valorPago: number;
      valorPendente: number;
    }
  >();

  const pedidosOrdenados = [...comanda.pedidos].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  for (const pedido of pedidosOrdenados) {
    if (pedido.status === "CANCELADO") continue;

    const existing = pessoasMap.get(pedido.telefone);
    const entry = existing ?? {
      telefone: pedido.telefone,
      nome: pedido.nomeCliente,
      latestCreatedAt: pedido.createdAt.getTime(),
      itens: [],
      subtotal: 0,
      valorPago: 0,
      valorPendente: 0,
    };

    if (pedido.createdAt.getTime() >= entry.latestCreatedAt) {
      entry.nome = pedido.nomeCliente;
      entry.latestCreatedAt = pedido.createdAt.getTime();
    }

    for (const item of pedido.itens) {
      const subtotal = item.precoSnapshot * item.quantidade;
      const isPaid = item.pagamentoId !== null;

      entry.itens.push({
        id: item.id,
        pedidoId: pedido.id,
        pedidoNumero: pedido.numero,
        pedidoStatus: pedido.status,
        nomeSnapshot: item.nomeSnapshot,
        precoSnapshot: item.precoSnapshot,
        quantidade: item.quantidade,
        subtotal,
        pagamentoId: item.pagamentoId,
        pago: isPaid,
        createdAt: pedido.createdAt.toISOString(),
      });

      entry.subtotal += subtotal;
      if (isPaid) {
        entry.valorPago += subtotal;
      } else {
        entry.valorPendente += subtotal;
      }
    }

    pessoasMap.set(pedido.telefone, entry);
  }

  const pessoas: ComandaPessoaDTO[] = Array.from(pessoasMap.values())
    .sort((a, b) => b.valorPendente - a.valorPendente || a.nome.localeCompare(b.nome))
    .map((p) => ({
      telefone: p.telefone,
      nome: p.nome,
      itens: p.itens,
      subtotal: p.subtotal,
      valorPago: p.valorPago,
      valorPendente: p.valorPendente,
      tudoPago: p.valorPendente === 0,
    }));

  const pedidos: ComandaPedidoDTO[] = [...comanda.pedidos]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      nomeCliente: p.nomeCliente,
      telefone: p.telefone,
      status: p.status,
      observacao: p.observacao,
      total: p.total,
      createdAt: p.createdAt.toISOString(),
      itens: p.itens.map((i) => ({
        id: i.id,
        nomeSnapshot: i.nomeSnapshot,
        precoSnapshot: i.precoSnapshot,
        quantidade: i.quantidade,
        pagamentoId: i.pagamentoId,
      })),
    }));

  const pagamentos: ComandaPagamentoDTO[] = [...comanda.pagamentos]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((pag) => ({
      id: pag.id,
      valor: pag.valor,
      forma: pag.forma,
      pagador: pag.pagador,
      recebidoPor: pag.recebidoPor,
      executadoPorPerfil: pag.executadoPorPerfil,
      status: pag.status,
      motivoEstorno: pag.motivoEstorno,
      estornadoPorPerfil: pag.estornadoPorPerfil,
      createdAt: pag.createdAt.toISOString(),
      itensCount: pag._count?.itens ?? pag.itens?.length ?? 0,
    }));

  return {
    ...summary,
    motivoFechamentoPendente: comanda.motivoFechamentoPendente,
    pessoas,
    pedidos,
    pagamentos,
  };
}

export async function loadComandaDetail(
  comandaId: string,
  client: DbOrTx = db
): Promise<ComandaDetailDTO | null> {
  const comanda = await client.comanda.findUnique({
    where: { id: comandaId },
    include: {
      pedidos: {
        orderBy: { createdAt: "asc" },
        include: {
          itens: {
            orderBy: { id: "asc" },
          },
        },
      },
      pagamentos: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { itens: true } },
        },
      },
    },
  });

  if (!comanda) return null;
  return buildComandaDetailDTO(comanda);
}
