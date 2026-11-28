"use client";

import * as React from "react";
import { AlertTriangle, MonitorCheck, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LiveStatusBar({
  lastUpdatedAt,
  onRetry,
  wakeLockSupported,
  wakeLockActive,
}: {
  lastUpdatedAt: number | null;
  onRetry?: () => void;
  wakeLockSupported: boolean | null;
  wakeLockActive: boolean;
}) {
  const [mountedAtMs, setMountedAtMs] = React.useState<number | null>(null);
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    const startTimer = window.setTimeout(() => {
      const now = Date.now();
      setMountedAtMs((prev) => prev ?? now);
      setNowMs(now);
    }, 0);

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
    };
  }, []);

  const referenceMs = lastUpdatedAt ?? mountedAtMs;
  const secondsSinceUpdate =
    nowMs !== null && referenceMs !== null
      ? Math.max(0, Math.floor((nowMs - referenceMs) / 1000))
      : 0;

  const isStale = secondsSinceUpdate > 60;

  return (
    <div className="flex flex-col gap-2">
      {isStale && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-400 bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Sem conexão: pedidos podem estar atrasados
          </span>
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="border-white/50 bg-white/15 text-white hover:bg-white/25"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar agora
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Wifi
            className={`h-3.5 w-3.5 ${
              isStale ? "text-red-600" : "text-[var(--brand-primary-strong)]"
            }`}
          />
          {lastUpdatedAt === null
            ? "Conectando..."
            : `Última atualização há ${secondsSinceUpdate}s`}
        </span>

        <span className="inline-flex items-center gap-1.5">
          {wakeLockSupported === false ? (
            <span>
              Este navegador não mantém a tela acordada automaticamente.
            </span>
          ) : wakeLockActive ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--brand-primary-strong)]">
              <MonitorCheck className="h-3.5 w-3.5" />
              Tela acordada
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
