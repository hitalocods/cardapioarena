"use client";

import * as React from "react";
import type { PedidoStatus } from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Clock,
  DollarSign,
  Minus,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TableProperties,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  formatDateTimeBR,
  PEDIDO_STATUS_LABELS,
  PEDIDO_STATUS_STYLES,
} from "@/lib/format";

type Periodo = "hoje" | "7d" | "30d" | "mes" | "tudo";

const PERIODOS: Array<{ value: Periodo; label: string }> = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mes", label: "Mês atual" },
  { value: "tudo", label: "Tudo" },
];

interface EstoqueProdutoItem {
  id: string;
  nome: string;
  ativo: boolean;
  estoque: number;
  estoqueMinimo: number;
  vendidosPeriodo: number;
  status: "ESGOTADO" | "BAIXO" | "OK";
}

interface ResumoData {
  periodo: Periodo;
  totalPedidos: number;
  totalValor: number;
  ticketMedio: number;
  totalUnidadesVendidas: number;
  cancelados: number;
  valorCancelado: number;
  porStatus: Record<PedidoStatus, number>;
  serie: Array<{
    label: string;
    pedidos: number;
    faturamento: number;
  }>;
  maisVendidos: Array<{
    nome: string;
    quantidade: number;
    faturamento: number;
    controlaEstoque: boolean;
    estoqueAtual: number | null;
    estoqueMinimo: number | null;
  }>;
  porMesa: Array<{
    mesaNumero: number;
    pedidos: number;
    faturamento: number;
    ticketMedio: number;
  }>;
  estoqueProdutos: EstoqueProdutoItem[];
  resumoEstoque: {
    controlados: number;
    esgotados: number;
    estoqueBaixo: number;
    totalUnidadesEmEstoque: number;
  };
  pedidosRecentes: Array<{
    id: string;
    numero: number;
    mesaNumero: number;
    nomeCliente: string;
    status: PedidoStatus;
    total: number;
    createdAt: string;
    itens: Array<{ nomeSnapshot: string; quantidade: number }>;
  }>;
}

export function ResumoTab({
  onOpenProdutos,
  onStockAlertsChange,
}: {
  onOpenProdutos?: () => void;
  onStockAlertsChange?: (count: number) => void;
}) {
  const [periodo, setPeriodo] = React.useState<Periodo>("hoje");
  const [data, setData] = React.useState<ResumoData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [stockBusyId, setStockBusyId] = React.useState<string | null>(null);

  const fetchResumo = React.useCallback(
    async (targetPeriodo: Periodo) => {
      try {
        const res = await fetch(`/api/admin/resumo?periodo=${targetPeriodo}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError("Não foi possível carregar o dashboard.");
          return;
        }
        const json = (await res.json()) as ResumoData;
        setData(json);
        onStockAlertsChange?.(
          json.resumoEstoque.esgotados + json.resumoEstoque.estoqueBaixo
        );
        setError(null);
      } catch {
        setError("Erro de conexão ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    },
    [onStockAlertsChange]
  );

  React.useEffect(() => {
    let active = true;
    fetch(`/api/admin/resumo?periodo=${periodo}`, { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setError("Não foi possível carregar o dashboard.");
          return;
        }
        const json = (await res.json()) as ResumoData;
        if (active) {
          setData(json);
          onStockAlertsChange?.(
            json.resumoEstoque.esgotados + json.resumoEstoque.estoqueBaixo
          );
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Erro de conexão ao carregar dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [periodo, onStockAlertsChange]);

  const handleSelectPeriodo = (next: Periodo) => {
    setLoading(true);
    setPeriodo(next);
  };

  const handleManualRefresh = () => {
    setLoading(true);
    void fetchResumo(periodo);
  };

  const handleQuickStockDelta = async (
    item: EstoqueProdutoItem,
    delta: number
  ) => {
    if (stockBusyId) return;
    setStockBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/produtos/${item.id}/estoque`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (res.ok) {
        await fetchResumo(periodo);
      }
    } finally {
      setStockBusyId(null);
    }
  };

  const maxSerieValor = React.useMemo(() => {
    if (!data?.serie.length) return 1;
    return Math.max(1, ...data.serie.map((s) => s.faturamento));
  }, [data]);

  const maxItemQty = React.useMemo(() => {
    if (!data?.maisVendidos.length) return 1;
    return Math.max(1, ...data.maisVendidos.map((i) => i.quantidade));
  }, [data]);

  return (
    <section className="flex flex-col gap-4">
      {/* Cabeçalho e filtro de período */}
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--foreground)]">
            Dashboard de Vendas &amp; Estoque
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Acompanhe faturamento, saídas de estoque por pedido e desempenho por
            mesa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-2xl bg-[var(--surface-subtle)] p-1 border border-[var(--border)]">
            {PERIODOS.map((item) => {
              const active = periodo === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleSelectPeriodo(item.value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-medium text-[var(--status-cancelado-fg)]">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* 4 KPIs principais */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Faturamento
                </p>
                <DollarSign className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              </div>
              <p className="mt-2 text-2xl font-black text-[var(--brand-primary-strong)] sm:text-3xl">
                {formatCurrency(data.totalValor)}
              </p>
              {data.cancelados > 0 && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {formatCurrency(data.valorCancelado)} cancelados
                </p>
              )}
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Pedidos válidos
                </p>
                <Receipt className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              </div>
              <p className="mt-2 text-2xl font-black text-[var(--foreground)] sm:text-3xl">
                {data.totalPedidos}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {data.porStatus.ENTREGUE} entregues · {data.cancelados} cancel.
              </p>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Ticket médio
                </p>
                <BarChart3 className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              </div>
              <p className="mt-2 text-2xl font-black text-[var(--foreground)] sm:text-3xl">
                {formatCurrency(data.ticketMedio)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Média por pedido válido
              </p>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Itens vendidos
                </p>
                <ShoppingBag className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              </div>
              <p className="mt-2 text-2xl font-black text-[var(--foreground)] sm:text-3xl">
                {data.totalUnidadesVendidas}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {data.resumoEstoque.totalUnidadesEmEstoque} un. em estoque
              </p>
            </div>
          </div>

          {/* Status dos pedidos no período */}
          <div className="glass-card p-4">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Distribuição por status no período
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  "RECEBIDO",
                  "PREPARANDO",
                  "PRONTO",
                  "ENTREGUE",
                  "CANCELADO",
                ] as PedidoStatus[]
              ).map((st) => {
                const style = PEDIDO_STATUS_STYLES[st];
                return (
                  <div
                    key={st}
                    className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                    style={{ backgroundColor: style.bg, color: style.fg }}
                  >
                    <span className="text-xs font-bold">
                      {PEDIDO_STATUS_LABELS[st]}
                    </span>
                    <span className="text-base font-black">
                      {data.porStatus[st]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gráfico de movimento + Estoque conectado aos pedidos */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Série temporal */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[var(--brand-primary-strong)]" />
                  <h3 className="text-lg font-bold text-[var(--foreground)]">
                    {periodo === "hoje"
                      ? "Movimento por hora"
                      : "Faturamento por dia"}
                  </h3>
                </div>
              </div>

              {data.serie.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                  Sem pedidos válidos registrados neste período.
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-2.5">
                  {data.serie.map((point) => {
                    const widthPct = Math.max(
                      point.faturamento > 0 ? 6 : 0,
                      Math.round((point.faturamento / maxSerieValor) * 100)
                    );
                    return (
                      <div key={point.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--foreground)]">
                            {point.label}
                          </span>
                          <span className="text-[var(--muted-foreground)]">
                            {point.pedidos}{" "}
                            {point.pedidos === 1 ? "pedido" : "pedidos"} ·{" "}
                            <strong className="text-[var(--foreground)]">
                              {formatCurrency(point.faturamento)}
                            </strong>
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                          <div
                            className="h-full rounded-full bg-[var(--brand-primary-strong)] transition-all"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Estoque conectado aos pedidos */}
            <div className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-[var(--brand-primary-strong)]" />
                  <h3 className="text-lg font-bold text-[var(--foreground)]">
                    Estoque conectado aos pedidos
                  </h3>
                </div>
                {onOpenProdutos && (
                  <button
                    type="button"
                    onClick={onOpenProdutos}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary-strong)] hover:underline cursor-pointer"
                  >
                    Gerenciar produtos
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Cada pedido desconta automaticamente na hora da compra e devolve
                o estoque se for cancelado.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">
                  {data.resumoEstoque.controlados} controlados
                </Badge>
                {data.resumoEstoque.esgotados > 0 && (
                  <Badge variant="destructive">
                    {data.resumoEstoque.esgotados} esgotado(s)
                  </Badge>
                )}
                {data.resumoEstoque.estoqueBaixo > 0 && (
                  <Badge variant="warning">
                    {data.resumoEstoque.estoqueBaixo} estoque baixo
                  </Badge>
                )}
              </div>

              {data.estoqueProdutos.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                  Nenhum produto com controle de estoque ativo no momento.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.estoqueProdutos.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-[var(--foreground)]">
                            {item.nome}
                          </span>
                          {item.status === "ESGOTADO" && (
                            <Badge variant="destructive">Esgotado</Badge>
                          )}
                          {item.status === "BAIXO" && (
                            <Badge variant="warning">Baixo</Badge>
                          )}
                          {!item.ativo && <Badge variant="outline">Inativo</Badge>}
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Saída no período:{" "}
                          <strong className="text-[var(--foreground)]">
                            {item.vendidosPeriodo} un.
                          </strong>{" "}
                          · Mínimo: {item.estoqueMinimo}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={
                            stockBusyId === item.id || item.estoque <= 0
                          }
                          onClick={() => void handleQuickStockDelta(item, -1)}
                          aria-label={`Diminuir estoque de ${item.nome}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-10 text-center text-sm font-black text-[var(--foreground)]">
                          {item.estoque}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          disabled={stockBusyId === item.id}
                          onClick={() => void handleQuickStockDelta(item, 1)}
                          aria-label={`Aumentar estoque de ${item.nome}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Mais vendidos + Pedidos por mesa */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[var(--brand-primary-strong)]" />
                <h3 className="text-lg font-bold text-[var(--foreground)]">
                  Itens mais vendidos
                </h3>
              </div>

              {data.maisVendidos.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  Nenhuma venda registrada neste período.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {data.maisVendidos.map((item, idx) => {
                    const barPct = Math.max(
                      8,
                      Math.round((item.quantidade / maxItemQty) * 100)
                    );
                    const isLowOrOut =
                      item.controlaEstoque &&
                      item.estoqueAtual !== null &&
                      item.estoqueMinimo !== null &&
                      item.estoqueAtual <= item.estoqueMinimo;

                    return (
                      <li
                        key={item.nome}
                        className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--foreground)]">
                            {idx + 1}. {item.nome}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--brand-primary-foreground)]">
                              {item.quantidade} un.
                            </span>
                            <span className="font-extrabold text-[var(--foreground)]">
                              {formatCurrency(item.faturamento)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/80">
                            <div
                              className="h-full rounded-full bg-[var(--brand-primary-strong)]"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          {item.controlaEstoque &&
                            item.estoqueAtual !== null && (
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                  isLowOrOut
                                    ? "text-[var(--destructive)]"
                                    : "text-[var(--muted-foreground)]"
                                }`}
                              >
                                {isLowOrOut && (
                                  <AlertTriangle className="h-3 w-3" />
                                )}
                                Restam {item.estoqueAtual}
                              </span>
                            )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-2">
                <TableProperties className="h-5 w-5 text-[var(--brand-primary-strong)]" />
                <h3 className="text-lg font-bold text-[var(--foreground)]">
                  Pedidos por mesa
                </h3>
              </div>

              {data.porMesa.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  Nenhum pedido por mesa neste período.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.porMesa.map((mesa) => (
                    <li
                      key={mesa.mesaNumero}
                      className="flex items-center justify-between rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-sm"
                    >
                      <div>
                        <span className="font-bold text-[var(--foreground)]">
                          Mesa {mesa.mesaNumero}
                        </span>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Ticket médio: {formatCurrency(mesa.ticketMedio)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--brand-primary-foreground)]">
                          {mesa.pedidos}{" "}
                          {mesa.pedidos === 1 ? "pedido" : "pedidos"}
                        </span>
                        <span className="font-extrabold text-[var(--foreground)]">
                          {formatCurrency(mesa.faturamento)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Histórico recente do período */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[var(--brand-primary-strong)]" />
              <h3 className="text-lg font-bold text-[var(--foreground)]">
                Últimos pedidos do período
              </h3>
            </div>

            {data.pedidosRecentes.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                Nenhum pedido encontrado neste período.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {data.pedidosRecentes.map((pedido) => {
                  const stStyle = PEDIDO_STATUS_STYLES[pedido.status];
                  const resumoItens = pedido.itens
                    .map((i) => `${i.quantidade}x ${i.nomeSnapshot}`)
                    .join(", ");
                  return (
                    <li
                      key={pedido.id}
                      className="flex flex-col gap-1.5 rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-[var(--foreground)]">
                            Mesa {pedido.mesaNumero}
                          </span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {pedido.nomeCliente}
                          </span>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            #{pedido.numero} ·{" "}
                            {formatDateTimeBR(pedido.createdAt)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          <Package className="mr-1 inline h-3 w-3" />
                          {resumoItens}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor: stStyle.bg,
                            color: stStyle.fg,
                          }}
                        >
                          {PEDIDO_STATUS_LABELS[pedido.status]}
                        </span>
                        <span className="font-extrabold text-[var(--foreground)]">
                          {formatCurrency(pedido.total)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
