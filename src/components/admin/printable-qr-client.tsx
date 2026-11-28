"use client";

import * as React from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveQrBaseUrl } from "@/lib/qr-url";

const emptySubscribe = () => () => {};

export function PrintableQrClient({
  mesas,
  initialBaseUrl,
}: {
  mesas: Array<{ id: string; numero: number }>;
  initialBaseUrl?: string;
}) {
  const originUrl = React.useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "http://localhost:3000"
  );
  const baseUrl = resolveQrBaseUrl(initialBaseUrl, originUrl);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin?tab=qrcode">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao painel
          </Button>
        </Link>

        <div className="text-sm font-medium text-[var(--muted-foreground)]">
          {mesas.length} {mesas.length === 1 ? "mesa ativa" : "mesas ativas"} ·{" "}
          <span className="font-mono">{baseUrl}</span>
        </div>

        <Button size="lg" onClick={() => window.print()}>
          <Printer className="h-5 w-5" />
          Imprimir grade ({mesas.length})
        </Button>
      </div>

      {mesas.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="font-semibold">
            Nenhuma mesa ativa para imprimir. Configure na aba Mesas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
          {mesas.map((mesa) => {
            const mesaUrl = `${baseUrl}/mesa/${mesa.numero}`;
            return (
              <div
                key={mesa.id}
                className="glass-card print-card flex break-inside-avoid flex-col items-center rounded-3xl border-2 border-dashed border-[var(--border)] p-6 text-center"
              >
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--brand-primary-foreground)]">
                  <Sun className="h-3.5 w-3.5 text-[var(--brand-primary-strong)]" />
                  Arena Home Beach
                </div>

                <h2 className="mt-3 text-5xl font-black tracking-tight text-[var(--foreground)]">
                  Mesa {mesa.numero}
                </h2>

                <div className="my-4 rounded-2xl border-2 border-[var(--brand-primary)] bg-white p-4">
                  <QRCodeSVG
                    value={mesaUrl}
                    size={190}
                    level="M"
                    includeMargin
                  />
                </div>

                <p className="text-sm font-bold text-[var(--foreground)]">
                  Aponte a câmera para pedir
                </p>
                <p className="mt-1.5 text-xs font-semibold tracking-wide text-[var(--muted-foreground)]">
                  Atlas Software · www.atlassoftware.org
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
