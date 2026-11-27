"use client";

import * as React from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  Store,
  XCircle,
} from "lucide-react";
import type { BalcaoVendaDTO } from "@/app/api/admin/balcao/vendas/route";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FORMA_PAGAMENTO_LABELS,
  formatCurrency,
  formatDateTimeBR,
  formatTimeBR,
  PEDIDO_STATUS_LABELS,
} from "@/lib/format";

type PeriodoBalcao = "hoje" | "7d" | "30d";

export function BalcaoTab({
  refreshKey = 0,
  onNewSaleClick,
}: {
  refreshKey?: number;
  onNewSaleClick?: () => void;
}) {
  const [periodo, setPeriodo] = React.useState<PeriodoBalcao>("hoje");
  const [vendas, setVendas] = React.useState<BalcaoVendaDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = React.useState<BalcaoVendaDTO | null>(
    null
  );
  const [cancelMotivo, setCancelMotivo] = React.useState("");
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [submittingCancel, setSubmittingCancel] = React.useState(false);

  const fetchVendas = React.useCallback(
    async (targetPeriodo: PeriodoBalcao = periodo, manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const res = await fetch(
          `/api/admin/balcao/vendas?periodo=${targetPeriodo}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Erro ao carregar vendas de balcão.");
          return;
        }
        const data = (await res.json()) as { vendas: BalcaoVendaDTO[] };
        setVendas(data.vendas);
        setError(null);
      } catch {
        setError("Falha de conexão ao carregar vendas de balcão.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [periodo]
  );

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void fetchVendas(periodo, false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchVendas, periodo, refreshKey]);

  const ativas = React.useMemo(
    () => vendas.filter((v) => !v.cancelada),
    [vendas]
  );
  const totalAtivo = React.useMemo(
    () => ativas.reduce((acc, v) => acc + v.total, 0),
    [ativas]
  );

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget || submittingCancel) return;
    if (cancelMotivo.trim().length < 3) {
      setCancelError("Informe o motivo do cancelamento (mínimo 3 caracteres).");
      return;
    }

    setSubmittingCancel(true);
    setCancelError(null);
    try {
      const res = await fetch(
        `/api/admin/balcao/vendas/${cancelTarget.comandaId}/cancelar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: cancelMotivo.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error ?? "Não foi possível cancelar a venda.");
        return;
      }

      setCancelTarget(null);
      setCancelMotivo("");
      setFeedback(
        `Venda #${cancelTarget.numero} cancelada, pagamento estornado e estoque devolvido.`
      );
      await fetchVendas(periodo, true);
    } catch {
      setCancelError("Erro de conexão ao cancelar venda.");
    } finally {
      setSubmittingCancel(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--foreground)]">
            Vendas de Balcão {periodo === "hoje" ? "de Hoje" : ""} ({ativas.length})
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Total ativo no período:{" "}
            <strong className="text-[var(--foreground)]">
              {formatCurrency(totalAtivo)}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
            {(
              [
                { value: "hoje", label: "Hoje" },
                { value: "7d", label: "7 dias" },
                { value: "30d", label: "30 dias" },
              ] as Array<{ value: PeriodoBalcao; label: string }>
            ).map((opt) => {
              const active = periodo === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setPeriodo(opt.value);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchVendas(periodo, true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>

          {onNewSaleClick && (
            <Button size="sm" onClick={onNewSaleClick}>
              <Plus className="h-4 w-4" />
              Nova venda
            </Button>
          )}
        </div>
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

      {loading ? (
        <div className="grid gap-3">
          <div className="glass-card h-28 animate-pulse" />
          <div className="glass-card h-28 animate-pulse" />
        </div>
      ) : vendas.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Store className="mx-auto h-12 w-12 text-[var(--brand-primary-strong)]" />
          <p className="mt-3 text-lg font-bold text-[var(--foreground)]">
            Nenhuma venda de balcão neste período
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Use o botão &ldquo;Nova venda de balcão&rdquo; no topo do painel para
            lançar uma venda rápida.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {vendas.map((venda) => {
            const formasResumo = venda.pagamentos
              .map(
                (p) =>
                  `${FORMA_PAGAMENTO_LABELS[p.forma]} (${formatCurrency(p.valor)})`
              )
              .join(" + ");
            const recebidoPor = venda.pagamentos.find(
              (p) => p.recebidoPor
            )?.recebidoPor;

            return (
              <article
                key={venda.comandaId}
                className={`glass-card flex flex-col gap-3 p-4 sm:p-5 ${
                  venda.cancelada
                    ? "border border-[var(--destructive)]/30 bg-[var(--status-cancelado-bg)]/35 opacity-85"
                    : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-xl bg-[var(--brand-primary)] px-2.5 py-0.5 text-xs font-black text-[var(--brand-primary-foreground)]">
                        BALCÃO #{venda.numero}
                      </span>
                      <span className="text-base font-extrabold text-[var(--foreground)]">
                        {venda.nomeCliente}
                      </span>
                      <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                        {periodo === "hoje"
                          ? formatTimeBR(venda.createdAt)
                          : formatDateTimeBR(venda.createdAt)}
                      </span>
                      {venda.cancelada ? (
                        <Badge variant="destructive">Cancelada</Badge>
                      ) : venda.status !== "ENTREGUE" ? (
                        <Badge variant="warning">
                          Cozinha: {PEDIDO_STATUS_LABELS[venda.status]}
                        </Badge>
                      ) : (
                        <Badge variant="default">Concluída</Badge>
                      )}
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
                      {venda.itens
                        .map((i) => `${i.quantidade}x ${i.nomeSnapshot}`)
                        .join(" · ")}
                    </p>

                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Pagamento: <strong>{formasResumo}</strong>
                      {recebidoPor ? ` · Recebido por: ${recebidoPor}` : ""}
                    </p>

                    {venda.observacao && (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Obs: {venda.observacao}
                      </p>
                    )}

                    {venda.cancelada && venda.motivoCancelamento && (
                      <p className="mt-1 text-xs font-semibold text-[var(--status-cancelado-fg)]">
                        Motivo do cancelamento: {venda.motivoCancelamento}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xl font-black ${
                        venda.cancelada
                          ? "line-through text-[var(--muted-foreground)]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {formatCurrency(venda.total)}
                    </span>

                    {!venda.cancelada && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCancelError(null);
                          setCancelMotivo("");
                          setCancelTarget(venda);
                        }}
                        className="border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--status-cancelado-bg)]"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar venda
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title={
          cancelTarget
            ? `Cancelar venda #${cancelTarget.numero}`
            : "Cancelar venda"
        }
        description={
          cancelTarget
            ? `${cancelTarget.nomeCliente} · ${formatCurrency(cancelTarget.total)}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={submittingCancel}
            >
              Voltar
            </Button>
            <Button
              type="submit"
              form="cancelar-balcao-form"
              variant="destructive"
              disabled={submittingCancel || cancelMotivo.trim().length < 3}
            >
              {submittingCancel ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Confirmar cancelamento"
              )}
            </Button>
          </div>
        }
      >
        <form
          id="cancelar-balcao-form"
          onSubmit={handleConfirmCancel}
          className="flex flex-col gap-3"
        >
          {cancelError && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
              {cancelError}
            </div>
          )}
          <p className="text-sm text-[var(--muted-foreground)]">
            A venda será marcada como cancelada, os pagamentos serão estornados e
            os itens retornarão ao estoque automaticamente.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-cancelar-balcao">
              Motivo do cancelamento{" "}
              <span className="text-[var(--destructive)]">*</span>
            </Label>
            <Textarea
              id="motivo-cancelar-balcao"
              placeholder="Ex: Cliente desistiu / lançamento duplicado..."
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              required
            />
          </div>
        </form>
      </Dialog>
    </section>
  );
}
