"use client";

import * as React from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminMesa } from "@/components/admin/mesas-tab";

const emptySubscribe = () => () => {};
const ENV_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";

export function QrcodeTab() {
  const originUrl = React.useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "http://localhost:3000"
  );
  const defaultBaseUrl = (ENV_SITE_URL || originUrl).replace(/\/+$/, "");

  const [customBaseUrl, setCustomBaseUrl] = React.useState<string | null>(null);
  const [mesas, setMesas] = React.useState<AdminMesa[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [copiedMesa, setCopiedMesa] = React.useState<number | null>(null);

  const baseUrl = (customBaseUrl ?? defaultBaseUrl).replace(/\/+$/, "");

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin/mesas", { cache: "no-store" })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const data = (await res.json()) as { mesas: AdminMesa[] };
        if (active) {
          setMesas(data.mesas.filter((m) => m.ativa));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = async (numero: number, mesaUrl: string) => {
    try {
      await navigator.clipboard.writeText(mesaUrl);
      setCopiedMesa(numero);
      window.setTimeout(() => setCopiedMesa(null), 1800);
    } catch {
      // Ignora erro caso clipboard não esteja disponível
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="glass-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--foreground)]">
              QR Code por Mesa ({mesas.length} ativas)
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Cada mesa possui um link exclusivo{" "}
              <code className="font-mono">/mesa/N</code> para identificar o
              pedido automaticamente.
            </p>
          </div>

          <Link
            href={`/admin/qrcode?url=${encodeURIComponent(baseUrl)}`}
            target="_blank"
          >
            <Button size="lg">
              <Printer className="h-5 w-5" />
              Página imprimível ({mesas.length} mesas)
            </Button>
          </Link>
        </div>

        <div className="max-w-md">
          <Label htmlFor="qr-base-url">URL base dos QR Codes</Label>
          <Input
            id="qr-base-url"
            className="mt-1.5"
            value={customBaseUrl ?? defaultBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
            placeholder="https://cardapio.arenahomebeach.com.br"
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-card h-56 animate-pulse" />
      ) : mesas.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="font-semibold">
            Nenhuma mesa ativa. Ative mesas na aba &ldquo;Mesas&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {mesas.map((mesa) => {
            const mesaUrl = `${baseUrl}/mesa/${mesa.numero}`;
            const copied = copiedMesa === mesa.numero;
            return (
              <div
                key={mesa.id}
                className="glass-card flex flex-col items-center gap-3 p-5 text-center"
              >
                <span className="rounded-full bg-[var(--brand-primary)] px-4 py-1 text-base font-black text-[var(--brand-primary-foreground)]">
                  Mesa {mesa.numero}
                </span>

                <div className="rounded-2xl border border-[var(--border)] bg-white p-3">
                  <QRCodeSVG value={mesaUrl} size={160} level="M" includeMargin />
                </div>

                <p className="w-full truncate text-xs font-mono text-[var(--muted-foreground)]">
                  {mesaUrl}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void handleCopy(mesa.numero, mesaUrl)}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-[var(--brand-primary-strong)]" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar link
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
