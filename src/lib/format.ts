import type { PedidoStatus } from "@prisma/client";

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(centavos: number): string {
  return brlFormatter.format(centavos / 100);
}

/**
 * Converte texto como "14,50" ou "14.50" ou "14" em centavos inteiros.
 */
export function parseCurrencyToCentavos(input: string): number | null {
  const cleaned = input.trim().replace(/[R$\s]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100);
}

export function formatCentavosInput(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function formatTimeBR(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export function formatDateTimeBR(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export const PEDIDO_STATUS_LABELS: Record<PedidoStatus, string> = {
  RECEBIDO: "Recebido",
  PREPARANDO: "Preparando",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

export const PEDIDO_STATUS_STYLES: Record<
  PedidoStatus,
  { bg: string; fg: string }
> = {
  RECEBIDO: {
    bg: "var(--status-recebido-bg)",
    fg: "var(--status-recebido-fg)",
  },
  PREPARANDO: {
    bg: "var(--status-preparando-bg)",
    fg: "var(--status-preparando-fg)",
  },
  PRONTO: {
    bg: "var(--status-pronto-bg)",
    fg: "var(--status-pronto-fg)",
  },
  ENTREGUE: {
    bg: "var(--status-entregue-bg)",
    fg: "var(--status-entregue-fg)",
  },
  CANCELADO: {
    bg: "var(--status-cancelado-bg)",
    fg: "var(--status-cancelado-fg)",
  },
};

export const OPEN_ORDER_STATUSES: PedidoStatus[] = [
  "RECEBIDO",
  "PREPARANDO",
  "PRONTO",
];

export const ACTIVE_ABUSE_STATUSES: PedidoStatus[] = [
  "RECEBIDO",
  "PREPARANDO",
];

export const ALLOWED_STATUS_TRANSITIONS: Record<PedidoStatus, PedidoStatus[]> =
  {
    RECEBIDO: ["PREPARANDO", "CANCELADO"],
    PREPARANDO: ["PRONTO", "CANCELADO"],
    PRONTO: ["ENTREGUE", "CANCELADO"],
    ENTREGUE: [],
    CANCELADO: [],
  };

export function isOpenOrderStatus(status: PedidoStatus): boolean {
  return (
    status === "RECEBIDO" || status === "PREPARANDO" || status === "PRONTO"
  );
}
