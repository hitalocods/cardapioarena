"use client";

import * as React from "react";
import type { PedidoStatus } from "@prisma/client";
import {
  Check,
  ChefHat,
  Loader2,
  PackageCheck,
  RefreshCw,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatTimeBR,
  PEDIDO_STATUS_LABELS,
  PEDIDO_STATUS_STYLES,
} from "@/lib/format";

export interface AdminPedido {
  id: string;
  numero: number;
  origem?: "CLIENTE" | "BALCAO" | "GARCOM";
  lancadoPor?: string | null;
  nomeCliente: string;
  telefone: string;
  mesaNumero: number | null;
  observacao: string | null;
  status: PedidoStatus;
  total: number;
  createdAt: string;
  itens: Array<{
    id: string;
    nomeSnapshot: string;
    precoSnapshot: number;
    quantidade: number;
  }>;
}

function playAlertChime(ctx: AudioContext) {
  try {
    const now = ctx.currentTime;
    const notes = [659.25, 880]; // Mi5 -> Lá5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.27);
    });
  } catch {
    // Ignora falha de áudio caso o dispositivo esteja bloqueado
  }
}

export function PedidosTab({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const [pedidos, setPedidos] = React.useState<AdminPedido[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = React.useState<string | null>(
    null
  );

  const [soundEnabled, setSoundEnabled] = React.useState(false);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const knownIdsRef = React.useRef<Set<string> | null>(null);
  const soundEnabledRef = React.useRef(false);

  React.useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const fetchPedidos = React.useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const res = await fetch("/api/admin/pedidos?abertos=true", {
          cache: "no-store",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Erro ao carregar pedidos.");
          return;
        }

        const data = (await res.json()) as { pedidos: AdminPedido[] };
        setError(null);
        setPedidos(data.pedidos);
        onCountChange?.(data.pedidos.length);

        const incomingIds = new Set(data.pedidos.map((p) => p.id));
        if (knownIdsRef.current !== null) {
          const hasNew = data.pedidos.some(
            (p) => !knownIdsRef.current!.has(p.id)
          );
          if (hasNew && soundEnabledRef.current && audioCtxRef.current) {
            if (audioCtxRef.current.state === "suspended") {
              await audioCtxRef.current.resume().catch(() => {});
            }
            playAlertChime(audioCtxRef.current);
          }
        }
        knownIdsRef.current = incomingIds;
      } catch {
        setError("Falha de conexão ao buscar pedidos.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onCountChange]
  );

  React.useEffect(() => {
    let cancelled = false;

    const runInitialOrPoll = () => {
      if (!cancelled) {
        void fetchPedidos(false);
      }
    };

    const initTimer = window.setTimeout(runInitialOrPoll, 0);
    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        runInitialOrPoll();
      }
    }, 10000);

    const onVisibility = () => {
      if (!document.hidden) {
        runInitialOrPoll();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchPedidos]);

  const handleToggleSound = async () => {
    if (soundEnabled) {
      setSoundEnabled(false);
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume().catch(() => {});
    }
    playAlertChime(audioCtxRef.current);
    setSoundEnabled(true);
  };

  const handleStatusChange = async (
    pedidoId: string,
    numero: number,
    nextStatus: PedidoStatus
  ) => {
    if (updatingId) return;
    setUpdatingId(pedidoId);
    setError(null);
    setFeedback(null);
    setConfirmCancelId(null);

    try {
      const res = await fetch(`/api/admin/pedidos/${pedidoId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível atualizar o pedido.");
        await fetchPedidos();
        return;
      }

      if (nextStatus === "CANCELADO") {
        setFeedback(
          `Pedido #${numero} cancelado e estoque devolvido automaticamente.`
        );
      }
      await fetchPedidos();
    } catch {
      setError("Erro de conexão ao atualizar pedido.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Barra de controles */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--foreground)]">
            Pedidos Abertos ({pedidos.length})
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Atualiza automaticamente a cada 10 segundos com a tela visível.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={soundEnabled ? "default" : "outline"}
            size="lg"
            onClick={() => void handleToggleSound()}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-5 w-5" />
                Som ativo
              </>
            ) : (
              <>
                <VolumeX className="h-5 w-5" />
                Ativar som
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => void fetchPedidos(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass-card h-64 animate-pulse" />
          <div className="glass-card h-64 animate-pulse" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <PackageCheck className="mx-auto h-12 w-12 text-[var(--brand-primary-strong)]" />
          <p className="mt-3 text-xl font-bold text-[var(--foreground)]">
            Nenhum pedido aberto no momento
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Novos pedidos aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pedidos.map((pedido) => {
            const badgeStyle = PEDIDO_STATUS_STYLES[pedido.status];
            const isBusy = updatingId === pedido.id;
            const confirmingCancel = confirmCancelId === pedido.id;

            return (
              <article
                key={pedido.id}
                className="glass-card flex flex-col justify-between gap-4 p-5 sm:p-6"
              >
                <div>
                  {/* Topo do card com MESA N em destaque */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center rounded-2xl bg-[var(--brand-primary)] px-4 py-1.5 text-2xl font-black tracking-tight text-[var(--brand-primary-foreground)] shadow-xs">
                        {pedido.mesaNumero !== null
                          ? `MESA ${pedido.mesaNumero}`
                          : "BALCÃO"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-extrabold text-[var(--foreground)]">
                          {pedido.nomeCliente}
                        </span>
                        <span className="text-sm font-semibold text-[var(--muted-foreground)]">
                          · #{pedido.numero} · {formatTimeBR(pedido.createdAt)}
                        </span>
                        {pedido.origem === "GARCOM" && (
                          <span className="rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--brand-primary-foreground)]">
                            Garçom
                            {pedido.lancadoPor ? ` (${pedido.lancadoPor})` : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className="rounded-full px-4 py-1.5 text-sm font-extrabold"
                      style={{
                        backgroundColor: badgeStyle.bg,
                        color: badgeStyle.fg,
                      }}
                    >
                      {PEDIDO_STATUS_LABELS[pedido.status]}
                    </span>
                  </div>

                  {/* Itens com texto grande */}
                  <ul className="mt-4 flex flex-col gap-2 rounded-2xl bg-[var(--surface-subtle)] p-4 border border-[var(--border)]">
                    {pedido.itens.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-lg font-bold text-[var(--foreground)]"
                      >
                        <span>
                          <span className="mr-1.5 inline-block rounded-lg bg-[var(--brand-primary)] px-2 py-0.5 text-base font-black text-[var(--brand-primary-foreground)]">
                            {item.quantidade}x
                          </span>
                          {item.nomeSnapshot}
                        </span>
                        <span className="text-base font-semibold text-[var(--muted-foreground)]">
                          {formatCurrency(item.precoSnapshot * item.quantidade)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {pedido.observacao && (
                    <div className="mt-3 rounded-2xl bg-[var(--status-preparando-bg)] px-4 py-3 text-base font-semibold text-[var(--status-preparando-fg)]">
                      Obs: {pedido.observacao}
                    </div>
                  )}
                </div>

                {/* Total e botões grandes */}
                <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-[var(--muted-foreground)]">
                      Total a cobrar
                    </span>
                    <span className="text-2xl font-black text-[var(--foreground)]">
                      {formatCurrency(pedido.total)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    {pedido.status === "RECEBIDO" && (
                      <Button
                        size="xl"
                        className="flex-1"
                        disabled={isBusy}
                        onClick={() =>
                          void handleStatusChange(
                            pedido.id,
                            pedido.numero,
                            "PREPARANDO"
                          )
                        }
                      >
                        {isBusy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <ChefHat className="h-5 w-5" />
                        )}
                        Preparando
                      </Button>
                    )}

                    {pedido.status === "PREPARANDO" && (
                      <Button
                        size="xl"
                        className="flex-1"
                        disabled={isBusy}
                        onClick={() =>
                          void handleStatusChange(
                            pedido.id,
                            pedido.numero,
                            "PRONTO"
                          )
                        }
                      >
                        {isBusy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <PackageCheck className="h-5 w-5" />
                        )}
                        Pronto
                      </Button>
                    )}

                    {pedido.status === "PRONTO" && (
                      <Button
                        size="xl"
                        className="flex-1"
                        disabled={isBusy}
                        onClick={() =>
                          void handleStatusChange(
                            pedido.id,
                            pedido.numero,
                            "ENTREGUE"
                          )
                        }
                      >
                        {isBusy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Check className="h-5 w-5" />
                        )}
                        Entregue
                      </Button>
                    )}

                    {!confirmingCancel ? (
                      <Button
                        variant="outline"
                        size="xl"
                        disabled={isBusy}
                        onClick={() => setConfirmCancelId(pedido.id)}
                        className="border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--status-cancelado-bg)]"
                      >
                        <XCircle className="h-5 w-5" />
                        Cancelar
                      </Button>
                    ) : (
                      <div className="flex flex-1 gap-2">
                        <Button
                          variant="destructive"
                          size="xl"
                          className="flex-1"
                          disabled={isBusy}
                          onClick={() =>
                            void handleStatusChange(
                              pedido.id,
                              pedido.numero,
                              "CANCELADO"
                            )
                          }
                        >
                          Confirmar
                        </Button>
                        <Button
                          variant="outline"
                          size="xl"
                          disabled={isBusy}
                          onClick={() => setConfirmCancelId(null)}
                        >
                          Voltar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
