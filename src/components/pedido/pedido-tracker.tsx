"use client";

import * as React from "react";
import Link from "next/link";
import type { PedidoStatus } from "@prisma/client";
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  MapPin,
  PackageCheck,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatTimeBR,
  isOpenOrderStatus,
  PEDIDO_STATUS_LABELS,
  PEDIDO_STATUS_STYLES,
} from "@/lib/format";
import type { PublicPedidoDTO } from "@/lib/orders";

const STEPS: Array<{
  status: PedidoStatus;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    status: "RECEBIDO",
    label: "Recebido",
    description: "Seu pedido chegou no bar",
    icon: Clock,
  },
  {
    status: "PREPARANDO",
    label: "Preparando",
    description: "Estamos separando tudo pra você",
    icon: ChefHat,
  },
  {
    status: "PRONTO",
    label: "Pronto",
    description: "Saiu para entrega ou retirada",
    icon: PackageCheck,
  },
  {
    status: "ENTREGUE",
    label: "Entregue",
    description: "Bom jogo e aproveite!",
    icon: Check,
  },
];

const STEP_INDEX: Record<PedidoStatus, number> = {
  RECEBIDO: 0,
  PREPARANDO: 1,
  PRONTO: 2,
  ENTREGUE: 3,
  CANCELADO: -1,
};

export function PedidoTracker({
  initialPedido,
}: {
  initialPedido: PublicPedidoDTO;
}) {
  const [pedido, setPedido] = React.useState<PublicPedidoDTO>(initialPedido);
  const [refreshing, setRefreshing] = React.useState(false);

  const fetchLatest = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { pedido?: PublicPedidoDTO };
      if (data.pedido) {
        setPedido(data.pedido);
      }
    } catch {
      // Ignora erro transitório de polling
    } finally {
      setRefreshing(false);
    }
  }, [pedido.id]);

  const isOpen = isOpenOrderStatus(pedido.status);

  React.useEffect(() => {
    // Para o polling automaticamente quando Entregue ou Cancelado
    if (!isOpen) return;

    const tick = () => {
      if (!document.hidden) {
        void fetchLatest();
      }
    };

    const intervalId = window.setInterval(tick, 8000);
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void fetchLatest();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isOpen, fetchLatest]);

  const statusStyle = PEDIDO_STATUS_STYLES[pedido.status];
  const currentStepIdx = STEP_INDEX[pedido.status];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6">
      {/* Topo */}
      <div className="flex items-center justify-between">
        <Link
          href={`/mesa/${pedido.mesaNumero}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3.5 py-2 text-sm font-semibold text-[var(--foreground)] border border-[var(--border)] shadow-xs hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao cardápio
        </Link>

        {isOpen && (
          <button
            type="button"
            onClick={() => void fetchLatest()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-white cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        )}
      </div>

      {/* Card principal */}
      <section className="glass-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Arena Home Beach
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
              Pedido #{pedido.numero}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
              <MapPin className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              <span>
                {pedido.nomeCliente} · <strong>Mesa {pedido.mesaNumero}</strong> ·{" "}
                {formatTimeBR(pedido.createdAt)}
              </span>
            </p>
          </div>

          <span
            className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold"
            style={{
              backgroundColor: statusStyle.bg,
              color: statusStyle.fg,
            }}
          >
            {PEDIDO_STATUS_LABELS[pedido.status]}
          </span>
        </div>

        {/* Etapas */}
        {pedido.status === "CANCELADO" ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[var(--status-cancelado-bg)] p-4 text-[var(--status-cancelado-fg)]">
            <XCircle className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-bold">Pedido cancelado</p>
              <p className="text-sm opacity-90">
                Caso tenha dúvidas, fale com a equipe no bar da arena.
              </p>
            </div>
          </div>
        ) : (
          <ol className="mt-6 flex flex-col gap-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const done = idx < currentStepIdx;
              const active = idx === currentStepIdx;

              return (
                <li
                  key={step.status}
                  className={`flex items-center gap-3.5 rounded-2xl border p-3.5 transition-all ${
                    active
                      ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary-soft)] shadow-xs"
                      : done
                      ? "border-[var(--brand-primary)]/40 bg-white/80"
                      : "border-[var(--border)] bg-white/40 opacity-55"
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      active || done
                        ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                        : "bg-black/10 text-[var(--muted-foreground)]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--foreground)]">
                      {step.label}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {step.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {isOpen && (
          <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
            Atualização automática a cada 8 segundos enquanto o pedido estiver
            aberto.
          </p>
        )}
      </section>

      {/* Itens e pagamento */}
      <section className="glass-card p-6">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          Itens do pedido
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {pedido.itens.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-medium text-[var(--foreground)]">
                {item.quantidade}x {item.nomeSnapshot}
              </span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatCurrency(item.precoSnapshot * item.quantidade)}
              </span>
            </li>
          ))}
        </ul>

        {pedido.observacao && (
          <div className="mt-4 rounded-2xl bg-[var(--surface-subtle)] p-3 text-sm text-[var(--foreground)]">
            <span className="font-semibold">Observação:</span>{" "}
            {pedido.observacao}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">
              Total a pagar na arena
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Acerte no bar ou na entrega
            </p>
          </div>
          <span className="text-2xl font-extrabold text-[var(--brand-primary-strong)]">
            {formatCurrency(pedido.total)}
          </span>
        </div>
      </section>

      <Link href={`/mesa/${pedido.mesaNumero}`} className="w-full">
        <Button variant="outline" size="lg" className="w-full">
          Fazer outro pedido
        </Button>
      </Link>
    </div>
  );
}
