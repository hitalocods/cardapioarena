"use client";

import * as React from "react";
import Link from "next/link";
import type { ComandaStatus, FormaPagamento } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  Lock,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Split,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminRole } from "@/lib/auth";
import type { ComandaDetailDTO, ComandaSummaryDTO } from "@/lib/comandas";
import { LiveStatusBar } from "@/components/admin/live-status-bar";
import { useWakeLock } from "@/hooks/use-wake-lock";
import {
  FORMA_PAGAMENTO_LABELS,
  FORMAS_PAGAMENTO_ORDEM,
  formatCentavosInput,
  formatCurrency,
  formatDateTimeBR,
  formatDurationSince,
  formatTimeBR,
  parseCurrencyToCentavos,
  PEDIDO_STATUS_LABELS,
  splitEquallyCentavos,
} from "@/lib/format";
import { formatPessoaContato } from "@/lib/phone";

const RECEBIDO_POR_STORAGE_KEY = "ahb_recebido_por_v1";

type PayMode =
  | { type: "PESSOA"; telefone: string; nome: string; valor: number }
  | { type: "ITENS"; itemIds: string[]; label: string; valor: number }
  | { type: "VALOR_LIVRE" }
  | { type: "SALDO_TOTAL"; valor: number }
  | { type: "DIVISAO_IGUAL" };

interface DivisaoCotaDraft {
  forma: FormaPagamento | null;
  pagador: string;
  valorRecebidoInput: string;
}

function FormaIcon({ forma }: { forma: FormaPagamento }) {
  if (forma === "PIX") return <QrCode className="h-4 w-4" />;
  if (forma === "DINHEIRO") return <Banknote className="h-4 w-4" />;
  return <CreditCard className="h-4 w-4" />;
}

export function ComandasTab({
  onOpenCountChange,
  onMobileDetailOpenChange,
  role = "DONO",
}: {
  onOpenCountChange?: (count: number) => void;
  onMobileDetailOpenChange?: (open: boolean) => void;
  role?: AdminRole;
}) {
  const [statusFilter, setStatusFilter] =
    React.useState<ComandaStatus>("ABERTA");
  const [comandas, setComandas] = React.useState<ComandaSummaryDTO[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ComandaDetailDTO | null>(null);
  const [loadingList, setLoadingList] = React.useState(true);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<number | null>(null);
  const { supported: wakeLockSupported, active: wakeLockActive } =
    useWakeLock(true);

  // Seleção de itens avulsos no detalhe da comanda
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);

  // Nome de quem cobrou (persistido no localStorage)
  const [recebidoPor, setRecebidoPor] = React.useState("");

  // Modal de pagamento
  const [payMode, setPayMode] = React.useState<PayMode | null>(null);
  const [payForma, setPayForma] = React.useState<FormaPagamento | null>(null);
  const [payPagador, setPayPagador] = React.useState("");
  const [payValorLivreInput, setPayValorLivreInput] = React.useState("");
  const [payDinheiroRecebidoInput, setPayDinheiroRecebidoInput] =
    React.useState("");
  const [divisaoCountInput, setDivisaoCountInput] = React.useState("2");
  const [divisaoCotas, setDivisaoCotas] = React.useState<DivisaoCotaDraft[]>([
    { forma: null, pagador: "", valorRecebidoInput: "" },
    { forma: null, pagador: "", valorRecebidoInput: "" },
  ]);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [submittingPay, setSubmittingPay] = React.useState(false);
  const payIdempotencyKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    onMobileDetailOpenChange?.(Boolean(selectedId));
    return () => {
      onMobileDetailOpenChange?.(false);
    };
  }, [selectedId, onMobileDetailOpenChange]);

  // Modal de estorno
  const [estornoTarget, setEstornoTarget] = React.useState<{
    id: string;
    valor: number;
    forma: FormaPagamento;
    pagador: string | null;
  } | null>(null);
  const [estornoMotivo, setEstornoMotivo] = React.useState("");
  const [estornoError, setEstornoError] = React.useState<string | null>(null);
  const [submittingEstorno, setSubmittingEstorno] = React.useState(false);

  // Modal de fechar mesa
  const [fecharOpen, setFecharOpen] = React.useState(false);
  const [forcarSaldoConfirmado, setForcarSaldoConfirmado] =
    React.useState(false);
  const [motivoFecharPendente, setMotivoFecharPendente] = React.useState("");
  const [fecharError, setFecharError] = React.useState<string | null>(null);
  const [submittingFechar, setSubmittingFechar] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
      try {
        const saved = localStorage.getItem(RECEBIDO_POR_STORAGE_KEY);
        if (saved) setRecebidoPor(saved);
      } catch {
        // Ignora erro de localStorage
      }
    }, 0);

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);

  const handleRecebidoPorChange = (value: string) => {
    setRecebidoPor(value);
    try {
      if (value.trim()) {
        localStorage.setItem(RECEBIDO_POR_STORAGE_KEY, value.trim());
      } else {
        localStorage.removeItem(RECEBIDO_POR_STORAGE_KEY);
      }
    } catch {
      // Ignora erro de localStorage
    }
  };

  const fetchList = React.useCallback(
    async (targetStatus: ComandaStatus = statusFilter, manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const res = await fetch(`/api/admin/comandas?status=${targetStatus}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Erro ao carregar comandas.");
          return;
        }
        const data = (await res.json()) as { comandas: ComandaSummaryDTO[] };
        setError(null);
        setLastUpdatedAt(Date.now());
        setComandas(data.comandas);
        if (targetStatus === "ABERTA") {
          onOpenCountChange?.(data.comandas.length);
        }
      } catch {
        setError("Falha de conexão ao buscar comandas.");
      } finally {
        setLoadingList(false);
        setRefreshing(false);
      }
    },
    [onOpenCountChange, statusFilter]
  );

  const fetchDetail = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/comandas/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao carregar detalhes da comanda.");
        return;
      }
      const data = (await res.json()) as { comanda: ComandaDetailDTO };
      setLastUpdatedAt(Date.now());
      setDetail(data.comanda);
      // Remove da seleção itens que já tenham sido pagos
      const validUnpaid = new Set(
        data.comanda.pessoas.flatMap((p) =>
          p.itens.filter((i) => !i.pago).map((i) => i.id)
        )
      );
      setSelectedItemIds((prev) => prev.filter((itemId) => validUnpaid.has(itemId)));
      setError(null);
    } catch {
      setError("Falha de conexão ao atualizar comanda.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const runRefresh = () => {
      if (cancelled) return;
      void fetchList(statusFilter, false);
      if (selectedId) {
        void fetchDetail(selectedId);
      }
    };

    const initTimer = window.setTimeout(runRefresh, 0);
    const interval = window.setInterval(() => {
      if (!document.hidden) runRefresh();
    }, 10000);
    const onVis = () => {
      if (!document.hidden) runRefresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchDetail, fetchList, selectedId, statusFilter]);

  const handleOpenDetail = (id: string) => {
    setSelectedId(id);
    setSelectedItemIds([]);
    setFeedback(null);
    setError(null);
    setLoadingDetail(true);
    void fetchDetail(id);
  };

  const handleBackToList = () => {
    setSelectedId(null);
    setDetail(null);
    setSelectedItemIds([]);
    void fetchList(statusFilter, true);
  };

  const handleStatusTab = (next: ComandaStatus) => {
    setStatusFilter(next);
    setSelectedId(null);
    setDetail(null);
    setLoadingList(true);
    void fetchList(next, false);
  };

  const openPayModal = (mode: PayMode) => {
    payIdempotencyKeyRef.current = null;
    setPayError(null);
    setPayForma(null); // Nunca pré-selecionar forma de pagamento
    setPayDinheiroRecebidoInput("");

    if (mode.type === "PESSOA") {
      setPayPagador(mode.nome);
    } else if (mode.type === "SALDO_TOTAL") {
      setPayPagador("Saldo total da mesa");
    } else {
      setPayPagador("");
    }

    if (mode.type === "VALOR_LIVRE") {
      setPayValorLivreInput(
        detail && detail.saldo > 0 ? formatCentavosInput(detail.saldo) : ""
      );
    } else {
      setPayValorLivreInput("");
    }

    if (mode.type === "DIVISAO_IGUAL") {
      setDivisaoCountInput("2");
      setDivisaoCotas([
        { forma: null, pagador: "", valorRecebidoInput: "" },
        { forma: null, pagador: "", valorRecebidoInput: "" },
      ]);
    }

    setPayMode(mode);
  };

  const resetIdempotency = () => {
    payIdempotencyKeyRef.current = null;
  };

  const handleDivisaoCountChange = (raw: string) => {
    setDivisaoCountInput(raw);
    resetIdempotency();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 2 || parsed > 50) return;

    setDivisaoCotas((prev) =>
      Array.from({ length: parsed }, (_, idx) =>
        prev[idx] ?? { forma: null, pagador: "", valorRecebidoInput: "" }
      )
    );
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectedItemsTotal = React.useMemo(() => {
    if (!detail || selectedItemIds.length === 0) return 0;
    const picked = new Set(selectedItemIds);
    let sum = 0;
    for (const pessoa of detail.pessoas) {
      for (const item of pessoa.itens) {
        if (picked.has(item.id) && !item.pago) {
          sum += item.subtotal;
        }
      }
    }
    return sum;
  }, [detail, selectedItemIds]);

  const divisaoCount = React.useMemo(() => {
    const n = Number.parseInt(divisaoCountInput, 10);
    return Number.isFinite(n) && n >= 2 && n <= 50 ? n : null;
  }, [divisaoCountInput]);

  const divisaoValores = React.useMemo(() => {
    if (!detail || !divisaoCount || detail.saldo < divisaoCount) return [];
    return splitEquallyCentavos(detail.saldo, divisaoCount);
  }, [detail, divisaoCount]);

  const currentPayDueCentavos = React.useMemo(() => {
    if (!payMode || !detail) return 0;
    if (payMode.type === "PESSOA") return payMode.valor;
    if (payMode.type === "ITENS") return payMode.valor;
    if (payMode.type === "SALDO_TOTAL") return detail.saldo;
    if (payMode.type === "VALOR_LIVRE") {
      return parseCurrencyToCentavos(payValorLivreInput) ?? 0;
    }
    return detail.saldo;
  }, [detail, payMode, payValorLivreInput]);

  const dinheiroRecebidoCentavos = React.useMemo(
    () => parseCurrencyToCentavos(payDinheiroRecebidoInput),
    [payDinheiroRecebidoInput]
  );

  const canSubmitPayment = React.useMemo(() => {
    if (!payMode || !detail || submittingPay) return false;
    if (detail.saldo <= 0 || detail.status !== "ABERTA") return false;

    if (payMode.type === "DIVISAO_IGUAL") {
      if (!divisaoCount || divisaoValores.length !== divisaoCount) return false;
      if (divisaoCotas.length !== divisaoCount) return false;
      return divisaoCotas.every((c) => c.forma !== null);
    }

    if (!payForma) return false;

    if (payMode.type === "VALOR_LIVRE") {
      const val = parseCurrencyToCentavos(payValorLivreInput);
      return val !== null && val > 0 && val <= detail.saldo;
    }

    return currentPayDueCentavos > 0 && currentPayDueCentavos <= detail.saldo;
  }, [
    currentPayDueCentavos,
    detail,
    divisaoCotas,
    divisaoCount,
    divisaoValores.length,
    payForma,
    payMode,
    payValorLivreInput,
    submittingPay,
  ]);

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !payMode || !canSubmitPayment) return;

    setSubmittingPay(true);
    setPayError(null);

    if (!payIdempotencyKeyRef.current) {
      payIdempotencyKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = payIdempotencyKeyRef.current;

    let payload: Record<string, unknown>;
    const receiver = recebidoPor.trim() || null;

    if (payMode.type === "PESSOA") {
      payload = {
        tipo: "PESSOA",
        idempotencyKey,
        telefone: payMode.telefone,
        forma: payForma,
        pagador: payPagador.trim() || payMode.nome,
        recebidoPor: receiver,
      };
    } else if (payMode.type === "ITENS") {
      payload = {
        tipo: "ITENS",
        idempotencyKey,
        itemIds: payMode.itemIds,
        forma: payForma,
        pagador: payPagador.trim() || null,
        recebidoPor: receiver,
      };
    } else if (payMode.type === "VALOR_LIVRE") {
      const valor = parseCurrencyToCentavos(payValorLivreInput);
      payload = {
        tipo: "VALOR_LIVRE",
        idempotencyKey,
        valor,
        forma: payForma,
        pagador: payPagador.trim() || null,
        recebidoPor: receiver,
      };
    } else if (payMode.type === "SALDO_TOTAL") {
      payload = {
        tipo: "SALDO_TOTAL",
        idempotencyKey,
        forma: payForma,
        pagador: payPagador.trim() || "Saldo total da mesa",
        recebidoPor: receiver,
      };
    } else {
      payload = {
        tipo: "DIVISAO_IGUAL",
        idempotencyKey,
        numeroPessoas: divisaoCount,
        cotas: divisaoCotas.map((c) => ({
          forma: c.forma,
          pagador: c.pagador.trim() || null,
        })),
        recebidoPor: receiver,
      };
    }

    try {
      const res = await fetch(`/api/admin/comandas/${detail.id}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error ?? "Não foi possível registrar o pagamento.");
        payIdempotencyKeyRef.current = null;
        await fetchDetail(detail.id);
        return;
      }

      if (data.comanda) {
        setDetail(data.comanda as ComandaDetailDTO);
      } else {
        await fetchDetail(detail.id);
      }
      setSelectedItemIds([]);
      setPayMode(null);
      payIdempotencyKeyRef.current = null;
      setFeedback("Pagamento registrado com sucesso.");
      void fetchList(statusFilter, false);
    } catch {
      setPayError("Falha de conexão. Clique novamente para tentar de novo.");
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleConfirmEstorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !estornoTarget || submittingEstorno) return;
    if (estornoMotivo.trim().length < 3) {
      setEstornoError("Informe o motivo do estorno (mínimo 3 caracteres).");
      return;
    }

    setSubmittingEstorno(true);
    setEstornoError(null);
    try {
      const res = await fetch(
        `/api/admin/comandas/${detail.id}/pagamentos/${estornoTarget.id}/estornar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: estornoMotivo.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setEstornoError(data.error ?? "Não foi possível estornar.");
        return;
      }
      if (data.comanda) {
        setDetail(data.comanda as ComandaDetailDTO);
      } else {
        await fetchDetail(detail.id);
      }
      setEstornoTarget(null);
      setEstornoMotivo("");
      setFeedback("Pagamento estornado e itens liberados novamente.");
      void fetchList(statusFilter, false);
    } catch {
      setEstornoError("Erro de conexão ao estornar pagamento.");
    } finally {
      setSubmittingEstorno(false);
    }
  };

  const handleOpenFechar = () => {
    setFecharError(null);
    setForcarSaldoConfirmado(false);
    setMotivoFecharPendente("");
    setFecharOpen(true);
  };

  const handleConfirmFechar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || submittingFechar) return;

    if (detail.saldo > 0) {
      if (!forcarSaldoConfirmado) {
        setFecharError(
          "Marque a confirmação para fechar a mesa com saldo pendente."
        );
        return;
      }
      if (motivoFecharPendente.trim().length < 3) {
        setFecharError("Informe o motivo (mínimo 3 caracteres).");
        return;
      }
    }

    setSubmittingFechar(true);
    setFecharError(null);

    try {
      const res = await fetch(`/api/admin/comandas/${detail.id}/fechar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          detail.saldo > 0
            ? {
                forcarComSaldo: true,
                motivo: motivoFecharPendente.trim(),
              }
            : {}
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setFecharError(data.error ?? "Não foi possível fechar a comanda.");
        await fetchDetail(detail.id);
        return;
      }

      const mesaFechada = detail.mesaNumero;
      setFecharOpen(false);
      setSelectedId(null);
      setDetail(null);
      setSelectedItemIds([]);
      setFeedback(
        `Comanda da Mesa ${mesaFechada} fechada. O próximo pedido abrirá uma nova comanda.`
      );
      await fetchList(statusFilter, true);
    } catch {
      setFecharError("Erro de conexão ao fechar comanda.");
    } finally {
      setSubmittingFechar(false);
    }
  };

  // =========================================================================
  // MASTER-DETAIL (mobile: lista em cards + detalhe tela cheia; tablet/desktop: lado a lado)
  // =========================================================================
  return (
    <section className="flex flex-col gap-4">
      <div className="md:grid md:grid-cols-[310px_minmax(0,1fr)] md:items-start md:gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* COLUNA ESQUERDA: LISTA DE COMANDAS */}
        <div
          className={`flex-col gap-4 ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="glass-card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold text-[var(--foreground)]">
                  Comandas ({comandas.length})
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Conta por mesa até encerrar e liberar para os próximos clientes.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchList(statusFilter, true)}
                disabled={refreshing}
                className="shrink-0"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Atualizar
              </Button>
            </div>

            <div className="grid grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
              {(["ABERTA", "FECHADA"] as ComandaStatus[]).map((st) => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusTab(st)}
                    className={`min-h-11 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer sm:min-h-9 ${
                      active
                        ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {st === "ABERTA" ? "Abertas" : "Fechadas recentes"}
                  </button>
                );
              })}
            </div>
          </div>

          <LiveStatusBar
            lastUpdatedAt={lastUpdatedAt}
            onRetry={() => void fetchList(statusFilter, true)}
            wakeLockSupported={wakeLockSupported}
            wakeLockActive={wakeLockActive}
          />

          {error && !selectedId && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
              {error}
            </div>
          )}

          {feedback && !selectedId && (
            <div className="rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand-primary-foreground)]">
              {feedback}
            </div>
          )}

          {loadingList ? (
            <div className="grid gap-3">
              <div className="glass-card h-40 animate-pulse" />
              <div className="glass-card h-40 animate-pulse" />
              <div className="glass-card h-40 animate-pulse" />
            </div>
          ) : comandas.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <ReceiptText className="mx-auto h-10 w-10 text-[var(--brand-primary-strong)]" />
              <p className="mt-3 text-base font-bold text-[var(--foreground)]">
                {statusFilter === "ABERTA"
                  ? "Nenhuma comanda aberta"
                  : "Nenhuma comanda fechada"}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {statusFilter === "ABERTA"
                  ? "Quando um cliente enviar um pedido na mesa, a comanda aparecerá aqui."
                  : "As comandas encerradas aparecerão aqui."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {comandas.map((comanda) => {
                const isSelected = selectedId === comanda.id;
                return (
                  <button
                    key={comanda.id}
                    type="button"
                    onClick={() => handleOpenDetail(comanda.id)}
                    className={`glass-card flex flex-col justify-between gap-3 p-4 text-left transition hover:shadow-md cursor-pointer ${
                      isSelected
                        ? "ring-2 ring-[var(--brand-primary-strong)] bg-[var(--brand-primary-soft)]/50"
                        : comanda.pediuConta && comanda.status === "ABERTA"
                        ? "ring-2 ring-amber-500 bg-amber-50/60"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-flex items-center rounded-2xl bg-[var(--brand-primary)] px-3.5 py-1 text-lg font-black text-[var(--brand-primary-foreground)]">
                          {comanda.mesaNumero !== null
                            ? `MESA ${comanda.mesaNumero}`
                            : "BALCÃO"}
                        </span>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {comanda.qtdPessoas}{" "}
                            {comanda.qtdPessoas === 1 ? "pessoa" : "pessoas"}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {comanda.status === "ABERTA"
                              ? formatDurationSince(
                                  comanda.abertaEm,
                                  nowMs ?? undefined
                                )
                              : formatDateTimeBR(
                                  comanda.fechadaEm ?? comanda.abertaEm
                                )}
                          </span>
                        </div>
                      </div>

                      {comanda.pediuConta && comanda.status === "ABERTA" ? (
                        <Badge variant="warning" className="animate-pulse">
                          <BellRing className="mr-1 h-3 w-3" />
                          {comanda.pediuContaDetalhes
                            ? `Conta · ${comanda.pediuContaDetalhes}`
                            : "Pediu conta"}
                        </Badge>
                      ) : comanda.saldo === 0 && comanda.total > 0 ? (
                        <Badge variant="default">Quitada</Badge>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-2.5 text-xs">
                      <div>
                        <span className="block text-[var(--muted-foreground)]">
                          Total
                        </span>
                        <strong className="text-sm font-extrabold text-[var(--foreground)]">
                          {formatCurrency(comanda.total)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[var(--muted-foreground)]">
                          Pago
                        </span>
                        <strong className="text-sm font-extrabold text-[var(--brand-primary-strong)]">
                          {formatCurrency(comanda.pago)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[var(--muted-foreground)]">
                          Saldo
                        </span>
                        <strong className="text-sm font-black text-[var(--foreground)]">
                          {formatCurrency(comanda.saldo)}
                        </strong>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: DETALHE DA COMANDA */}
        {!selectedId ? (
          <div className="glass-card hidden min-h-80 flex-col items-center justify-center gap-2 p-10 text-center md:flex">
            <ReceiptText className="h-12 w-12 text-[var(--brand-primary-strong)]" />
            <p className="text-lg font-extrabold text-[var(--foreground)]">
              Selecione uma mesa ao lado
            </p>
            <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
              Veja o consumo separado por pessoa, registre pagamentos parciais ou
              totais e imprima o extrato da comanda.
            </p>
          </div>
        ) : (
          <div className="fixed inset-0 z-40 flex h-dvh flex-col bg-[var(--background)] md:static md:z-auto md:flex md:h-auto md:gap-4 md:bg-transparent">
            {/* Cabeçalho fixo no mobile (mesa, saldo) / card no desktop */}
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-glass-strong)] px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md md:rounded-[1.5rem] md:border md:bg-white/80 md:p-4 md:shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBackToList}
                    className="md:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Mesas
                  </Button>

                  {detail && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-2xl bg-[var(--brand-primary)] px-3 py-1 text-base font-black text-[var(--brand-primary-foreground)] sm:text-lg">
                        {detail.mesaNumero !== null
                          ? `MESA ${detail.mesaNumero}`
                          : "BALCÃO"}
                      </span>
                      <Badge
                        variant={
                          detail.status === "ABERTA" ? "default" : "outline"
                        }
                      >
                        {detail.status === "ABERTA" ? "Aberta" : "Fechada"}
                      </Badge>
                      {detail.pediuConta && detail.status === "ABERTA" && (
                        <Badge variant="warning" className="animate-pulse">
                          <BellRing className="mr-1 h-3.5 w-3.5" />
                          {detail.pediuContaDetalhes
                            ? `Conta · ${detail.pediuContaDetalhes}`
                            : "Pediu a conta"}
                          {detail.pediuContaEm
                            ? ` (${formatTimeBR(detail.pediuContaEm)})`
                            : ""}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {detail && (
                    <span className="rounded-xl bg-[var(--brand-primary-soft)] px-2.5 py-1 text-xs font-black text-[var(--brand-primary-foreground)] md:hidden">
                      Saldo: {formatCurrency(detail.saldo)}
                    </span>
                  )}
                  {detail && (
                    <Link
                      href={`/admin/comandas/${detail.id}/extrato`}
                      target="_blank"
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white/90 px-3 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white sm:min-h-9 sm:rounded-full sm:px-3.5 sm:text-sm"
                    >
                      <Printer className="h-4 w-4" />
                      Extrato
                    </Link>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchDetail(selectedId)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="hidden sm:inline">Atualizar</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Corpo rolável no mobile */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:flex md:flex-col md:gap-4 md:overflow-visible md:p-0">
              <div className="flex flex-col gap-4">
                <div className="md:hidden">
                  <LiveStatusBar
                    lastUpdatedAt={lastUpdatedAt}
                    onRetry={() => void fetchDetail(selectedId)}
                    wakeLockSupported={wakeLockSupported}
                    wakeLockActive={wakeLockActive}
                  />
                </div>

                {error && (
                  <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
                    {error}
                  </div>
                )}

                {feedback && (
                  <div className="rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand-primary-foreground)]">
                    {feedback}
                  </div>
                )}

                {loadingDetail && !detail ? (
                  <div className="glass-card h-64 animate-pulse" />
                ) : !detail ? (
                  <div className="glass-card p-8 text-center">
                    <p className="font-bold text-[var(--foreground)]">
                      Comanda não encontrada.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Resumo financeiro e ações principais (ações desktop inline; mobile no rodapé fixo) */}
                    <div className="glass-card flex flex-col gap-4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Aberta em {formatDateTimeBR(detail.abertaEm)} (
                          {formatDurationSince(
                            detail.abertaEm,
                            nowMs ?? undefined
                          )}
                          )
                        </span>
                        {detail.fechadaEm && (
                          <span>
                            Fechada em {formatDateTimeBR(detail.fechadaEm)}
                          </span>
                        )}
                        {detail.qtdPedidosAbertosCozinha > 0 && (
                          <Badge variant="warning">
                            {detail.qtdPedidosAbertosCozinha} pedido(s) na
                            cozinha
                          </Badge>
                        )}
                      </div>

                      {detail.motivoFechamentoPendente && (
                        <div className="break-words rounded-2xl bg-[var(--status-preparando-bg)] px-4 py-2.5 text-xs font-semibold text-[var(--status-preparando-fg)]">
                          Fechada com saldo pendente · Motivo:{" "}
                          {detail.motivoFechamentoPendente}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            Total
                          </p>
                          <p className="mt-1 text-base font-black text-[var(--foreground)] sm:text-2xl">
                            {formatCurrency(detail.total)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            Já pago
                          </p>
                          <p className="mt-1 text-base font-black text-[var(--brand-primary-strong)] sm:text-2xl">
                            {formatCurrency(detail.pago)}
                          </p>
                        </div>

                        <div
                          className={`rounded-2xl border p-3 sm:p-4 ${
                            detail.saldo > 0
                              ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/55"
                              : "border-[var(--border)] bg-[var(--surface-subtle)]"
                          }`}
                        >
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            Saldo
                          </p>
                          <p className="mt-1 text-base font-black text-[var(--foreground)] sm:text-2xl">
                            {formatCurrency(detail.saldo)}
                          </p>
                        </div>
                      </div>

                      {detail.status === "ABERTA" && (
                        <div className="hidden flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 md:flex">
                          {detail.saldo > 0 && (
                            <>
                              <Button
                                size="lg"
                                onClick={() =>
                                  openPayModal({
                                    type: "SALDO_TOTAL",
                                    valor: detail.saldo,
                                  })
                                }
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Pagar saldo total ({formatCurrency(detail.saldo)}
                                )
                              </Button>

                              <Button
                                variant="outline"
                                size="lg"
                                disabled={selectedItemIds.length === 0}
                                onClick={() =>
                                  openPayModal({
                                    type: "ITENS",
                                    itemIds: selectedItemIds,
                                    label: `${selectedItemIds.length} ite${
                                      selectedItemIds.length === 1 ? "m" : "ns"
                                    } selecionado${
                                      selectedItemIds.length === 1 ? "" : "s"
                                    }`,
                                    valor: selectedItemsTotal,
                                  })
                                }
                              >
                                <Check className="h-4 w-4" />
                                Pagar selecionados ({selectedItemIds.length} ·{" "}
                                {formatCurrency(selectedItemsTotal)})
                              </Button>

                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() =>
                                  openPayModal({ type: "DIVISAO_IGUAL" })
                                }
                              >
                                <Split className="h-4 w-4" />
                                Dividir igualmente
                              </Button>

                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() =>
                                  openPayModal({ type: "VALOR_LIVRE" })
                                }
                              >
                                <DollarSign className="h-4 w-4" />
                                Pagar valor
                              </Button>
                            </>
                          )}

                          <Button
                            variant={detail.saldo === 0 ? "default" : "outline"}
                            size="lg"
                            onClick={handleOpenFechar}
                            className="ml-auto"
                          >
                            <Lock className="h-4 w-4" />
                            Fechar mesa
                          </Button>
                        </div>
                      )}

                      {detail.status === "ABERTA" && detail.saldo > 0 && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Dica: para dividir uma conta em mais de uma forma de
                          pagamento (ex.: parte em Pix e parte em Dinheiro), use{" "}
                          <strong>Pagar valor</strong> para lançar a primeira
                          parte e depois quite o saldo restante.
                        </p>
                      )}
                    </div>

                    {/* Consumo agrupado por pessoa (pelo telefone) */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="flex items-center gap-2 text-lg font-extrabold text-[var(--foreground)]">
                          <Users className="h-5 w-5 text-[var(--brand-primary-strong)]" />
                          Consumo por pessoa ({detail.pessoas.length})
                        </h3>
                        {selectedItemIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedItemIds([])}
                            className="min-h-11 px-2 text-xs font-bold text-[var(--brand-primary-strong)] hover:underline cursor-pointer sm:min-h-0"
                          >
                            Limpar seleção ({selectedItemIds.length})
                          </button>
                        )}
                      </div>

                      {detail.pessoas.length === 0 ? (
                        <div className="glass-card p-6 text-center text-sm text-[var(--muted-foreground)]">
                          Nenhum item válido lançado nesta comanda.
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {detail.pessoas.map((pessoa) => {
                            const podePagarPessoa =
                              detail.status === "ABERTA" &&
                              pessoa.valorPendente > 0 &&
                              detail.saldo > 0;
                            const valorPessoaAPagar = Math.min(
                              pessoa.valorPendente,
                              detail.saldo
                            );

                            return (
                              <article
                                key={pessoa.telefone}
                                className="glass-card flex flex-col gap-3 p-4 sm:p-5"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="break-words text-lg font-extrabold text-[var(--foreground)]">
                                        {pessoa.nome}
                                      </h4>
                                      <Badge
                                        variant={
                                          pessoa.tudoPago
                                            ? "default"
                                            : "warning"
                                        }
                                      >
                                        {pessoa.tudoPago
                                          ? "Itens pagos"
                                          : `Pendente: ${formatCurrency(
                                              pessoa.valorPendente
                                            )}`}
                                      </Badge>
                                    </div>
                                    <p className="mt-0.5 break-words text-xs text-[var(--muted-foreground)]">
                                      Contato:{" "}
                                      {formatPessoaContato(pessoa.telefone)} ·
                                      Subtotal: {formatCurrency(pessoa.subtotal)}
                                      {pessoa.valorPago > 0
                                        ? ` · Pago em itens: ${formatCurrency(
                                            pessoa.valorPago
                                          )}`
                                        : ""}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      href={`/admin/comandas/${
                                        detail.id
                                      }/extrato?pessoa=${encodeURIComponent(
                                        pessoa.telefone
                                      )}`}
                                      target="_blank"
                                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-white/80 px-3 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white sm:min-h-9"
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                      Extrato individual
                                    </Link>

                                    {podePagarPessoa && (
                                      <Button
                                        size="sm"
                                        disabled={
                                          pessoa.valorPendente > detail.saldo
                                        }
                                        title={
                                          pessoa.valorPendente > detail.saldo
                                            ? "O valor dos itens supera o saldo restante da mesa porque já houve pagamento por valor."
                                            : undefined
                                        }
                                        onClick={() =>
                                          openPayModal({
                                            type: "PESSOA",
                                            telefone: pessoa.telefone,
                                            nome: pessoa.nome,
                                            valor: valorPessoaAPagar,
                                          })
                                        }
                                      >
                                        Pagar parte de{" "}
                                        {pessoa.nome.split(" ")[0]} (
                                        {formatCurrency(pessoa.valorPendente)})
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                <ul className="flex flex-col gap-1.5">
                                  {pessoa.itens.map((item) => {
                                    const checked = selectedItemIds.includes(
                                      item.id
                                    );
                                    const selectable =
                                      detail.status === "ABERTA" &&
                                      !item.pago &&
                                      detail.saldo > 0;
                                    return (
                                      <li
                                        key={item.id}
                                        className={`flex items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm ${
                                          item.pago
                                            ? "border-[var(--border)] bg-white/40 opacity-75"
                                            : checked
                                            ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary-soft)]/50"
                                            : "border-[var(--border)] bg-[var(--surface-subtle)]"
                                        }`}
                                      >
                                        <label
                                          className={`flex min-w-0 flex-1 items-start gap-2.5 ${
                                            selectable
                                              ? "cursor-pointer"
                                              : "cursor-default"
                                          }`}
                                        >
                                          {selectable ? (
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() =>
                                                toggleItemSelection(item.id)
                                              }
                                              className="mt-0.5 h-5 w-5 shrink-0 rounded accent-[var(--brand-primary-strong)]"
                                            />
                                          ) : (
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary-strong)]" />
                                          )}
                                          <span className="min-w-0 break-words font-semibold text-[var(--foreground)]">
                                            <span className="mr-1.5 font-black text-[var(--brand-primary-strong)]">
                                              {item.quantidade}x
                                            </span>
                                            {item.nomeSnapshot}
                                            <span className="ml-1.5 hidden text-xs font-normal text-[var(--muted-foreground)] sm:inline">
                                              · #{item.pedidoNumero} (
                                              {
                                                PEDIDO_STATUS_LABELS[
                                                  item.pedidoStatus
                                                ]
                                              }
                                              )
                                            </span>
                                          </span>
                                        </label>

                                        <div className="flex shrink-0 items-center gap-2">
                                          <span
                                            className={`text-[11px] font-bold ${
                                              item.pago
                                                ? "text-[var(--brand-primary-strong)]"
                                                : "text-[var(--muted-foreground)]"
                                            }`}
                                          >
                                            {item.pago ? "Pago" : "Pendente"}
                                          </span>
                                          <span className="font-extrabold text-[var(--foreground)]">
                                            {formatCurrency(item.subtotal)}
                                          </span>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Pagamentos registrados */}
                    <div className="glass-card flex flex-col gap-3 p-4 sm:p-5">
                      <h3 className="flex items-center gap-2 text-lg font-extrabold text-[var(--foreground)]">
                        <WalletIcon />
                        Pagamentos registrados ({detail.pagamentos.length})
                      </h3>

                      {detail.pagamentos.length === 0 ? (
                        <p className="text-sm text-[var(--muted-foreground)]">
                          Nenhum pagamento registrado nesta comanda ainda.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {detail.pagamentos.map((pag) => {
                            const estornado = pag.status === "ESTORNADO";
                            return (
                              <li
                                key={pag.id}
                                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 text-sm ${
                                  estornado
                                    ? "border-[var(--destructive)]/25 bg-[var(--status-cancelado-bg)]/40 opacity-80"
                                    : "border-[var(--border)] bg-[var(--surface-subtle)]"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--foreground)]">
                                      <FormaIcon forma={pag.forma} />
                                      {FORMA_PAGAMENTO_LABELS[pag.forma]}
                                    </span>
                                    <span
                                      className={`text-base font-black ${
                                        estornado
                                          ? "line-through text-[var(--muted-foreground)]"
                                          : "text-[var(--foreground)]"
                                      }`}
                                    >
                                      {formatCurrency(pag.valor)}
                                    </span>
                                    {estornado ? (
                                      <Badge variant="destructive">
                                        Estornado
                                      </Badge>
                                    ) : (
                                      <Badge variant="default">Ativo</Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 break-words text-xs text-[var(--muted-foreground)]">
                                    {formatTimeBR(pag.createdAt)}
                                    {pag.pagador
                                      ? ` · Pagador: ${pag.pagador}`
                                      : ""}
                                    {pag.recebidoPor
                                      ? ` · Recebido por: ${pag.recebidoPor}`
                                      : ""}
                                    {pag.executadoPorPerfil
                                      ? ` · Perfil: ${
                                          pag.executadoPorPerfil === "DONO"
                                            ? "Dono"
                                            : "Atendente"
                                        }`
                                      : ""}
                                    {pag.itensCount > 0
                                      ? ` · ${pag.itensCount} ite${
                                          pag.itensCount === 1 ? "m" : "ns"
                                        }`
                                      : " · Pagamento por valor"}
                                  </p>
                                  {estornado && pag.motivoEstorno && (
                                    <p className="mt-1 break-words text-xs font-semibold text-[var(--status-cancelado-fg)]">
                                      Motivo do estorno: {pag.motivoEstorno}
                                      {pag.estornadoPorPerfil
                                        ? ` (${
                                            pag.estornadoPorPerfil === "DONO"
                                              ? "Dono"
                                              : "Atendente"
                                          })`
                                        : ""}
                                    </p>
                                  )}
                                </div>

                                {!estornado &&
                                  detail.status === "ABERTA" &&
                                  role === "DONO" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEstornoError(null);
                                        setEstornoMotivo("");
                                        setEstornoTarget({
                                          id: pag.id,
                                          valor: pag.valor,
                                          forma: pag.forma,
                                          pagador: pag.pagador,
                                        });
                                      }}
                                      className="border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--status-cancelado-bg)]"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                      Estornar
                                    </Button>
                                  )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Rodapé fixo no mobile com ações de pagamento */}
            {detail && detail.status === "ABERTA" && (
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-glass-strong)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md md:hidden">
                <div className="flex flex-wrap gap-2">
                  {detail.saldo > 0 && (
                    <>
                      <Button
                        size="default"
                        onClick={() =>
                          openPayModal({
                            type: "SALDO_TOTAL",
                            valor: detail.saldo,
                          })
                        }
                        className="flex-1 text-xs sm:text-sm"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Pagar saldo ({formatCurrency(detail.saldo)})
                      </Button>

                      {selectedItemIds.length > 0 && (
                        <Button
                          variant="secondary"
                          size="default"
                          onClick={() =>
                            openPayModal({
                              type: "ITENS",
                              itemIds: selectedItemIds,
                              label: `${selectedItemIds.length} ite${
                                selectedItemIds.length === 1 ? "m" : "ns"
                              } selecionado${
                                selectedItemIds.length === 1 ? "" : "s"
                              }`,
                              valor: selectedItemsTotal,
                            })
                          }
                          className="text-xs"
                        >
                          <Check className="h-4 w-4 shrink-0" />
                          Itens ({selectedItemIds.length} ·{" "}
                          {formatCurrency(selectedItemsTotal)})
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => openPayModal({ type: "DIVISAO_IGUAL" })}
                        className="bg-white text-xs"
                      >
                        <Split className="h-4 w-4 shrink-0" />
                        Dividir
                      </Button>

                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => openPayModal({ type: "VALOR_LIVRE" })}
                        className="bg-white text-xs"
                      >
                        <DollarSign className="h-4 w-4 shrink-0" />
                        Valor
                      </Button>
                    </>
                  )}

                  <Button
                    variant={detail.saldo === 0 ? "default" : "outline"}
                    size="default"
                    onClick={handleOpenFechar}
                    className={`${
                      detail.saldo === 0 ? "w-full" : "bg-white text-xs"
                    }`}
                  >
                    <Lock className="h-4 w-4 shrink-0" />
                    Fechar mesa
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE PAGAMENTO */}
      <Dialog
        open={Boolean(payMode)}
        onOpenChange={(open) => {
          if (!open) {
            setPayMode(null);
            payIdempotencyKeyRef.current = null;
          }
        }}
        title={
          payMode?.type === "PESSOA"
            ? `Pagar parte de ${payMode.nome}`
            : payMode?.type === "ITENS"
            ? `Pagar ${payMode.label}`
            : payMode?.type === "SALDO_TOTAL"
            ? "Pagar saldo total da mesa"
            : payMode?.type === "DIVISAO_IGUAL"
            ? "Dividir saldo igualmente"
            : "Pagar valor livre"
        }
        description={
          detail
            ? `Mesa ${detail.mesaNumero} · Saldo: ${formatCurrency(detail.saldo)}`
            : undefined
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayMode(null)}
              disabled={submittingPay}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="comanda-pay-form"
              disabled={!canSubmitPayment}
              className="flex-1 sm:flex-initial"
            >
              {submittingPay ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Confirmar pagamento
                </>
              )}
            </Button>
          </div>
        }
      >
        <form
          id="comanda-pay-form"
          onSubmit={handleConfirmPayment}
          className="flex flex-col gap-4"
        >
          {payError && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
              {payError}
            </div>
          )}

          {payMode && payMode.type !== "DIVISAO_IGUAL" && (
            <>
              {payMode.type === "VALOR_LIVRE" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-valor-livre">Valor a pagar (R$)</Label>
                  <Input
                    id="pay-valor-livre"
                    inputMode="decimal"
                    placeholder="Ex: 25,00"
                    value={payValorLivreInput}
                    onChange={(e) => {
                      setPayValorLivreInput(e.target.value);
                      resetIdempotency();
                    }}
                  />
                  {detail &&
                    (parseCurrencyToCentavos(payValorLivreInput) ?? 0) >
                      detail.saldo && (
                      <p className="text-xs font-semibold text-[var(--destructive)]">
                        Não é possível registrar valor maior que o saldo (
                        {formatCurrency(detail.saldo)}).
                      </p>
                    )}
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--brand-primary-foreground)]">
                    Valor deste pagamento
                  </p>
                  <p className="text-2xl font-black text-[var(--brand-primary-foreground)]">
                    {formatCurrency(currentPayDueCentavos)}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label>
                  Forma de pagamento{" "}
                  <span className="text-[var(--destructive)]">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAS_PAGAMENTO_ORDEM.map((forma) => {
                    const active = payForma === forma;
                    return (
                      <button
                        key={forma}
                        type="button"
                        onClick={() => {
                          setPayForma(forma);
                          resetIdempotency();
                        }}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-bold transition cursor-pointer ${
                          active
                            ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                            : "border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
                        }`}
                      >
                        <FormaIcon forma={forma} />
                        {FORMA_PAGAMENTO_LABELS[forma]}
                      </button>
                    );
                  })}
                </div>
                {!payForma && (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Escolha uma forma acima para habilitar a confirmação.
                  </p>
                )}
              </div>

              {payForma === "DINHEIRO" && (
                <div className="rounded-2xl border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/45 p-3.5">
                  <Label htmlFor="pay-dinheiro-recebido">
                    Valor recebido em dinheiro (opcional — só para troco)
                  </Label>
                  <Input
                    id="pay-dinheiro-recebido"
                    inputMode="decimal"
                    placeholder="Ex: 100,00"
                    className="mt-1.5 bg-white"
                    value={payDinheiroRecebidoInput}
                    onChange={(e) =>
                      setPayDinheiroRecebidoInput(e.target.value)
                    }
                  />
                  {dinheiroRecebidoCentavos !== null &&
                    currentPayDueCentavos > 0 && (
                      <div className="mt-2 flex items-center justify-between text-sm font-bold">
                        {dinheiroRecebidoCentavos >= currentPayDueCentavos ? (
                          <>
                            <span className="text-[var(--brand-primary-foreground)]">
                              Troco a devolver:
                            </span>
                            <span className="text-lg font-black text-[var(--brand-primary-strong)]">
                              {formatCurrency(
                                dinheiroRecebidoCentavos - currentPayDueCentavos
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[var(--destructive)]">
                              Falta completar:
                            </span>
                            <span className="text-base font-black text-[var(--destructive)]">
                              {formatCurrency(
                                currentPayDueCentavos - dinheiroRecebidoCentavos
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-pagador">Pagador (opcional)</Label>
                <Input
                  id="pay-pagador"
                  placeholder="Nome de quem está pagando"
                  value={payPagador}
                  onChange={(e) => {
                    setPayPagador(e.target.value);
                    resetIdempotency();
                  }}
                />
              </div>
            </>
          )}

          {payMode?.type === "DIVISAO_IGUAL" && detail && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="divisao-pessoas">
                  Dividir {formatCurrency(detail.saldo)} entre quantas pessoas?
                </Label>
                <Input
                  id="divisao-pessoas"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={50}
                  value={divisaoCountInput}
                  onChange={(e) => handleDivisaoCountChange(e.target.value)}
                />
                {detail.saldo < (divisaoCount ?? 2) && (
                  <p className="text-xs font-semibold text-[var(--destructive)]">
                    Saldo insuficiente para dividir por esta quantidade de
                    pessoas.
                  </p>
                )}
              </div>

              {divisaoValores.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {divisaoValores.map((valorCota, idx) => {
                    const cota = divisaoCotas[idx] ?? {
                      forma: null,
                      pagador: "",
                      valorRecebidoInput: "",
                    };
                    const cotaRecebido = parseCurrencyToCentavos(
                      cota.valorRecebidoInput
                    );

                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold text-[var(--foreground)]">
                            Pessoa {idx + 1}
                            {idx === divisaoValores.length - 1 &&
                            divisaoValores[0] !== valorCota
                              ? " (inclui resto dos centavos)"
                              : ""}
                          </span>
                          <span className="text-base font-black text-[var(--brand-primary-strong)]">
                            {formatCurrency(valorCota)}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {FORMAS_PAGAMENTO_ORDEM.map((forma) => {
                            const active = cota.forma === forma;
                            return (
                              <button
                                key={forma}
                                type="button"
                                onClick={() => {
                                  resetIdempotency();
                                  setDivisaoCotas((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, forma } : item
                                    )
                                  );
                                }}
                                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition cursor-pointer ${
                                  active
                                    ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                                    : "border-[var(--border)] bg-white text-[var(--foreground)]"
                                }`}
                              >
                                <FormaIcon forma={forma} />
                                {FORMA_PAGAMENTO_LABELS[forma]}
                              </button>
                            );
                          })}
                        </div>

                        {cota.forma === "DINHEIRO" && (
                          <div className="mt-2 rounded-xl bg-white/80 p-2">
                            <Input
                              inputMode="decimal"
                              placeholder="Valor recebido em dinheiro (troco)"
                              value={cota.valorRecebidoInput}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDivisaoCotas((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, valorRecebidoInput: val }
                                      : item
                                  )
                                );
                              }}
                            />
                            {cotaRecebido !== null &&
                              cotaRecebido >= valorCota && (
                                <p className="mt-1 text-xs font-bold text-[var(--brand-primary-strong)]">
                                  Troco:{" "}
                                  {formatCurrency(cotaRecebido - valorCota)}
                                </p>
                              )}
                          </div>
                        )}

                        <Input
                          className="mt-2 bg-white"
                          placeholder={`Nome pessoa ${idx + 1} (opcional)`}
                          value={cota.pagador}
                          onChange={(e) => {
                            const val = e.target.value;
                            resetIdempotency();
                            setDivisaoCotas((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, pagador: val } : item
                              )
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-recebido-por">Recebido por (opcional)</Label>
            <Input
              id="pay-recebido-por"
              placeholder="Nome de quem cobrou (salvo neste aparelho)"
              value={recebidoPor}
              onChange={(e) => {
                handleRecebidoPorChange(e.target.value);
                resetIdempotency();
              }}
            />
          </div>
        </form>
      </Dialog>

      {/* MODAL DE ESTORNO */}
      <Dialog
        open={Boolean(estornoTarget)}
        onOpenChange={(open) => {
          if (!open) setEstornoTarget(null);
        }}
        title="Estornar pagamento"
        description={
          estornoTarget
            ? `${FORMA_PAGAMENTO_LABELS[estornoTarget.forma]} · ${formatCurrency(
                estornoTarget.valor
              )}${estornoTarget.pagador ? ` (${estornoTarget.pagador})` : ""}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEstornoTarget(null)}
              disabled={submittingEstorno}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form="estornar-pagamento-form"
              variant="destructive"
              disabled={submittingEstorno || estornoMotivo.trim().length < 3}
            >
              {submittingEstorno ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Estornando...
                </>
              ) : (
                "Confirmar estorno"
              )}
            </Button>
          </div>
        }
      >
        <form
          id="estornar-pagamento-form"
          onSubmit={handleConfirmEstorno}
          className="flex flex-col gap-3"
        >
          {estornoError && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
              {estornoError}
            </div>
          )}
          <p className="text-sm text-[var(--muted-foreground)]">
            O pagamento será marcado como estornado e os itens vinculados
            voltarão a ficar pendentes na comanda.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-estorno">
              Motivo do estorno{" "}
              <span className="text-[var(--destructive)]">*</span>
            </Label>
            <Textarea
              id="motivo-estorno"
              placeholder="Ex: Lançado em forma errada / pessoa pagou depois..."
              value={estornoMotivo}
              onChange={(e) => setEstornoMotivo(e.target.value)}
              required
            />
          </div>
        </form>
      </Dialog>

      {/* MODAL DE FECHAR MESA */}
      <Dialog
        open={fecharOpen}
        onOpenChange={setFecharOpen}
        title={
          detail ? `Fechar comanda · Mesa ${detail.mesaNumero}` : "Fechar mesa"
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFecharOpen(false)}
              disabled={submittingFechar}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form="fechar-comanda-form"
              variant={detail && detail.saldo > 0 ? "destructive" : "default"}
              disabled={
                submittingFechar ||
                (detail !== null &&
                  detail.saldo > 0 &&
                  (role !== "DONO" ||
                    !forcarSaldoConfirmado ||
                    motivoFecharPendente.trim().length < 3))
              }
            >
              {submittingFechar ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fechando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Confirmar fechamento
                </>
              )}
            </Button>
          </div>
        }
      >
        <form
          id="fechar-comanda-form"
          onSubmit={handleConfirmFechar}
          className="flex flex-col gap-3"
        >
          {fecharError && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
              {fecharError}
            </div>
          )}

          {detail && detail.saldo === 0 ? (
            <p className="text-sm text-[var(--foreground)]">
              O saldo da <strong>Mesa {detail.mesaNumero}</strong> está zerado.
              Ao fechar a comanda, novos pedidos nesta mesa abrirão uma nova
              comanda automaticamente.
            </p>
          ) : detail && role !== "DONO" ? (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] p-4 text-sm font-semibold text-[var(--status-cancelado-fg)]">
              Ainda há saldo pendente de {formatCurrency(detail.saldo)}. Apenas o{" "}
              <strong>Dono</strong> pode fechar uma mesa com saldo pendente.
              Quite o restante antes de fechar.
            </div>
          ) : (
            detail && (
              <>
                <div className="rounded-2xl bg-[var(--status-preparando-bg)] p-4 text-sm text-[var(--status-preparando-fg)]">
                  <div className="flex items-center gap-2 font-extrabold">
                    <AlertTriangle className="h-4 w-4" />
                    Ainda há saldo pendente de {formatCurrency(detail.saldo)}
                  </div>
                  <p className="mt-1 text-xs">
                    Só feche com saldo pendente em exceções (ex.: fiado ou
                    acerto posterior no balcão). O motivo ficará gravado.
                  </p>
                </div>

                <label className="flex items-start gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forcarSaldoConfirmado}
                    onChange={(e) =>
                      setForcarSaldoConfirmado(e.target.checked)
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--destructive)]"
                  />
                  <span>
                    Confirmo fechar a comanda mesmo com{" "}
                    {formatCurrency(detail.saldo)} pendente.
                  </span>
                </label>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="motivo-fechar-pendente">
                    Motivo obrigatório{" "}
                    <span className="text-[var(--destructive)]">*</span>
                  </Label>
                  <Textarea
                    id="motivo-fechar-pendente"
                    placeholder="Ex: Cliente acertou na saída com gerência / cortesia..."
                    value={motivoFecharPendente}
                    onChange={(e) => setMotivoFecharPendente(e.target.value)}
                    required
                  />
                </div>
              </>
            )
          )}
        </form>
      </Dialog>
    </section>
  );
}

function WalletIcon() {
  return <DollarSign className="h-5 w-5 text-[var(--brand-primary-strong)]" />;
}
