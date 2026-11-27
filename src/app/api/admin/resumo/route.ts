import { NextResponse } from "next/server";
import { ComandaTipo, FormaPagamento, PedidoStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";

export type ResumoPeriodo = "hoje" | "7d" | "30d" | "mes" | "tudo";

const VALID_PERIODOS = new Set<ResumoPeriodo>([
  "hoje",
  "7d",
  "30d",
  "mes",
  "tudo",
]);

function getSaoPauloDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function getSaoPauloHour(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  })
    .format(date)
    .padStart(2, "0");
}

function formatDayLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

function getPeriodStart(periodo: ResumoPeriodo): Date | null {
  const todayKey = getSaoPauloDateKey(new Date());
  const startOfToday = new Date(`${todayKey}T00:00:00-03:00`);

  if (periodo === "hoje") {
    return startOfToday;
  }
  if (periodo === "7d") {
    return new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  }
  if (periodo === "30d") {
    return new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);
  }
  if (periodo === "mes") {
    const [year, month] = todayKey.split("-");
    return new Date(`${year}-${month}-01T00:00:00-03:00`);
  }
  return null;
}

function emptyFormaRecord(): Record<FormaPagamento, number> {
  return {
    PIX: 0,
    CARTAO_CREDITO: 0,
    CARTAO_DEBITO: 0,
    DINHEIRO: 0,
  };
}

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const rawPeriodo = (searchParams.get("periodo") ?? "hoje") as ResumoPeriodo;
  const periodo: ResumoPeriodo = VALID_PERIODOS.has(rawPeriodo)
    ? rawPeriodo
    : "hoje";

  try {
    const inicioPeriodo = getPeriodStart(periodo);

    const [
      pedidosPeriodo,
      todosProdutos,
      pagamentosPeriodo,
      comandasFechadas,
      comandasAbertas,
    ] = await Promise.all([
      db.pedido.findMany({
        where: inicioPeriodo ? { createdAt: { gte: inicioPeriodo } } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          itens: {
            orderBy: { id: "asc" },
          },
        },
      }),
      db.produto.findMany({
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
      db.pagamento.findMany({
        where: inicioPeriodo ? { createdAt: { gte: inicioPeriodo } } : undefined,
        orderBy: { updatedAt: "desc" },
        include: {
          comanda: {
            select: {
              id: true,
              tipo: true,
              mesaNumero: true,
            },
          },
        },
      }),
      db.comanda.count({
        where: {
          tipo: "MESA",
          status: "FECHADA",
          ...(inicioPeriodo ? { fechadaEm: { gte: inicioPeriodo } } : {}),
        },
      }),
      db.comanda.count({
        where: {
          tipo: "MESA",
          status: "ABERTA",
        },
      }),
    ]);

    const produtoMap = new Map(todosProdutos.map((p) => [p.id, p]));

    const porStatus: Record<PedidoStatus, number> = {
      RECEBIDO: 0,
      PREPARANDO: 0,
      PRONTO: 0,
      ENTREGUE: 0,
      CANCELADO: 0,
    };

    let totalPedidosValidos = 0;
    let totalValor = 0;
    let totalUnidadesVendidas = 0;
    let valorCancelado = 0;
    let vendasBalcaoCount = 0;
    let totalBalcaoCancelado = 0;

    const vendasBalcaoCanceladas: Array<{
      comandaId: string | null;
      pedidoId: string;
      numero: number;
      nomeCliente: string;
      total: number;
      motivoCancelamento: string | null;
      createdAt: string;
      itens: Array<{ nomeSnapshot: string; quantidade: number }>;
    }> = [];

    const itemAggregate = new Map<
      string,
      {
        produtoId: string | null;
        nome: string;
        quantidade: number;
        faturamento: number;
      }
    >();

    const soldByProductId = new Map<string, number>();

    const mesaAggregate = new Map<
      number,
      { mesaNumero: number; pedidos: number; faturamento: number }
    >();

    const serieMap = new Map<
      string,
      { label: string; pedidos: number; faturamento: number }
    >();

    if (periodo === "7d" && inicioPeriodo) {
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(inicioPeriodo.getTime() + i * 24 * 60 * 60 * 1000);
        const key = getSaoPauloDateKey(d);
        serieMap.set(key, {
          label: formatDayLabel(key),
          pedidos: 0,
          faturamento: 0,
        });
      }
    }

    for (const pedido of pedidosPeriodo) {
      porStatus[pedido.status] += 1;

      if (pedido.status === PedidoStatus.CANCELADO) {
        valorCancelado += pedido.total;
        if (pedido.origem === "BALCAO") {
          totalBalcaoCancelado += pedido.total;
          vendasBalcaoCanceladas.push({
            comandaId: pedido.comandaId,
            pedidoId: pedido.id,
            numero: pedido.numero,
            nomeCliente: pedido.nomeCliente,
            total: pedido.total,
            motivoCancelamento: pedido.motivoCancelamento,
            createdAt: pedido.createdAt.toISOString(),
            itens: pedido.itens.map((i) => ({
              nomeSnapshot: i.nomeSnapshot,
              quantidade: i.quantidade,
            })),
          });
        }
        continue;
      }

      totalPedidosValidos += 1;
      totalValor += pedido.total;
      if (pedido.origem === "BALCAO") {
        vendasBalcaoCount += 1;
      }

      if (pedido.mesaNumero !== null) {
        const mesaStats = mesaAggregate.get(pedido.mesaNumero) ?? {
          mesaNumero: pedido.mesaNumero,
          pedidos: 0,
          faturamento: 0,
        };
        mesaStats.pedidos += 1;
        mesaStats.faturamento += pedido.total;
        mesaAggregate.set(pedido.mesaNumero, mesaStats);
      }

      const bucketKey =
        periodo === "hoje"
          ? getSaoPauloHour(pedido.createdAt)
          : getSaoPauloDateKey(pedido.createdAt);
      const bucketLabel =
        periodo === "hoje" ? `${bucketKey}h` : formatDayLabel(bucketKey);

      const bucket = serieMap.get(bucketKey) ?? {
        label: bucketLabel,
        pedidos: 0,
        faturamento: 0,
      };
      bucket.pedidos += 1;
      bucket.faturamento += pedido.total;
      serieMap.set(bucketKey, bucket);

      for (const item of pedido.itens) {
        totalUnidadesVendidas += item.quantidade;

        if (item.produtoId) {
          soldByProductId.set(
            item.produtoId,
            (soldByProductId.get(item.produtoId) ?? 0) + item.quantidade
          );
        }

        const key = item.produtoId ?? `snap:${item.nomeSnapshot}`;
        const existing = itemAggregate.get(key) ?? {
          produtoId: item.produtoId,
          nome: item.nomeSnapshot,
          quantidade: 0,
          faturamento: 0,
        };
        existing.quantidade += item.quantidade;
        existing.faturamento += item.precoSnapshot * item.quantidade;
        itemAggregate.set(key, existing);
      }
    }

    const ticketMedio =
      totalPedidosValidos > 0
        ? Math.round(totalValor / totalPedidosValidos)
        : 0;

    const serie = Array.from(serieMap.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([, val]) => val);

    const maisVendidos = Array.from(itemAggregate.values())
      .sort((a, b) => b.quantidade - a.quantidade || b.faturamento - a.faturamento)
      .slice(0, 10)
      .map((entry) => {
        const prod = entry.produtoId ? produtoMap.get(entry.produtoId) : null;
        return {
          nome: entry.nome,
          quantidade: entry.quantidade,
          faturamento: entry.faturamento,
          controlaEstoque: prod?.controlaEstoque ?? false,
          estoqueAtual: prod?.controlaEstoque ? prod.estoque : null,
          estoqueMinimo: prod?.controlaEstoque ? prod.estoqueMinimo : null,
        };
      });

    const porMesa = Array.from(mesaAggregate.values())
      .map((m) => ({
        ...m,
        ticketMedio: m.pedidos > 0 ? Math.round(m.faturamento / m.pedidos) : 0,
      }))
      .sort(
        (a, b) =>
          b.pedidos - a.pedidos ||
          b.faturamento - a.faturamento ||
          a.mesaNumero - b.mesaNumero
      );

    const estoqueProdutos = todosProdutos
      .filter((p) => p.controlaEstoque)
      .map((p) => {
        const status: "ESGOTADO" | "BAIXO" | "OK" =
          p.estoque <= 0
            ? "ESGOTADO"
            : p.estoque <= p.estoqueMinimo
            ? "BAIXO"
            : "OK";
        return {
          id: p.id,
          nome: p.nome,
          ativo: p.ativo,
          ordem: p.ordem,
          estoque: p.estoque,
          estoqueMinimo: p.estoqueMinimo,
          vendidosPeriodo: soldByProductId.get(p.id) ?? 0,
          status,
        };
      })
      .sort((a, b) => {
        const rank = { ESGOTADO: 0, BAIXO: 1, OK: 2 };
        return rank[a.status] - rank[b.status] || a.ordem - b.ordem;
      });

    const resumoEstoque = {
      controlados: estoqueProdutos.length,
      esgotados: estoqueProdutos.filter((p) => p.status === "ESGOTADO").length,
      estoqueBaixo: estoqueProdutos.filter((p) => p.status === "BAIXO").length,
      totalUnidadesEmEstoque: estoqueProdutos.reduce(
        (sum, p) => sum + p.estoque,
        0
      ),
    };

    const recebidoMesasPorForma = emptyFormaRecord();
    const recebidoBalcaoPorForma = emptyFormaRecord();
    const recebidoPorForma = emptyFormaRecord();
    let totalRecebidoMesas = 0;
    let totalRecebidoBalcao = 0;
    let totalRecebido = 0;
    let totalEstornado = 0;

    const estornos: Array<{
      id: string;
      comandaId: string;
      tipo: ComandaTipo;
      mesaNumero: number | null;
      forma: FormaPagamento;
      valor: number;
      pagador: string | null;
      recebidoPor: string | null;
      motivoEstorno: string | null;
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (const pag of pagamentosPeriodo) {
      if (pag.status === "ESTORNADO") {
        totalEstornado += pag.valor;
        estornos.push({
          id: pag.id,
          comandaId: pag.comandaId,
          tipo: pag.comanda.tipo,
          mesaNumero: pag.comanda.mesaNumero,
          forma: pag.forma,
          valor: pag.valor,
          pagador: pag.pagador,
          recebidoPor: pag.recebidoPor,
          motivoEstorno: pag.motivoEstorno,
          createdAt: pag.createdAt.toISOString(),
          updatedAt: pag.updatedAt.toISOString(),
        });
        continue;
      }

      recebidoPorForma[pag.forma] += pag.valor;
      totalRecebido += pag.valor;

      if (pag.comanda.tipo === "BALCAO") {
        recebidoBalcaoPorForma[pag.forma] += pag.valor;
        totalRecebidoBalcao += pag.valor;
      } else {
        recebidoMesasPorForma[pag.forma] += pag.valor;
        totalRecebidoMesas += pag.valor;
      }
    }

    const pedidosRecentes = pedidosPeriodo.slice(0, 15).map((p) => ({
      id: p.id,
      numero: p.numero,
      origem: p.origem,
      mesaNumero: p.mesaNumero,
      nomeCliente: p.nomeCliente,
      status: p.status,
      total: p.total,
      createdAt: p.createdAt.toISOString(),
      itens: p.itens.map((i) => ({
        nomeSnapshot: i.nomeSnapshot,
        quantidade: i.quantidade,
      })),
    }));

    return NextResponse.json(
      {
        periodo,
        inicioPeriodo: inicioPeriodo ? inicioPeriodo.toISOString() : null,
        totalPedidos: totalPedidosValidos,
        totalValor,
        ticketMedio,
        totalUnidadesVendidas,
        cancelados: porStatus.CANCELADO,
        valorCancelado,
        porStatus,
        recebidoMesasPorForma,
        totalRecebidoMesas,
        recebidoBalcaoPorForma,
        totalRecebidoBalcao,
        recebidoPorForma,
        totalRecebido,
        dinheiroEsperadoCaixa: recebidoPorForma.DINHEIRO,
        vendasBalcaoCount,
        comandasFechadas,
        comandasAbertas,
        estornos,
        totalEstornado,
        qtdEstornos: estornos.length,
        vendasBalcaoCanceladas,
        totalBalcaoCancelado,
        serie,
        maisVendidos,
        porMesa,
        estoqueProdutos,
        resumoEstoque,
        pedidosRecentes,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao gerar resumo do dashboard:", error);
    return NextResponse.json(
      { error: "Erro ao carregar dashboard." },
      { status: 500 }
    );
  }
}
