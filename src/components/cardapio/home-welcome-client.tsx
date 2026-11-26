"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArenaEmblem } from "@/components/brand/arena-emblem";
import {
  CardapioClient,
  type CardapioProduto,
  type CustomerIdentity,
} from "@/components/cardapio/cardapio-client";
import {
  formatBrPhoneMask,
  isValidBrPhone,
  normalizeBrPhone,
} from "@/lib/phone";

const CUSTOMER_STORAGE_KEY = "ahb_customer_info_v1";
const SESSION_MESA_KEY = "ahb_mesa_atual";

interface StoredCustomer {
  nomeCliente?: string;
  telefone?: string;
}

export function HomeWelcomeClient({
  initialProdutos,
  loadError,
}: {
  initialProdutos: CardapioProduto[];
  loadError?: boolean;
}) {
  const router = useRouter();
  const [showMenu, setShowMenu] = React.useState(false);
  const [savedCustomer, setSavedCustomer] =
    React.useState<CustomerIdentity | null>(null);
  const [nomeInput, setNomeInput] = React.useState("");
  const [telefoneInput, setTelefoneInput] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as StoredCustomer;
        const nome = parsed.nomeCliente?.trim() ?? "";
        const digits = normalizeBrPhone(parsed.telefone ?? "");
        if (nome.length >= 2 && isValidBrPhone(digits)) {
          setSavedCustomer({ nomeCliente: nome, telefone: digits });
          setNomeInput(nome);
          setTelefoneInput(formatBrPhoneMask(digits));
        }
      } catch {
        // Ignora erro de localStorage em navegação privada
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const proceedToMenuOrMesa = () => {
    try {
      const rawMesa = sessionStorage.getItem(SESSION_MESA_KEY);
      const parsedMesa = rawMesa ? Number.parseInt(rawMesa, 10) : NaN;
      if (Number.isSafeInteger(parsedMesa) && parsedMesa >= 1) {
        router.push(`/mesa/${parsedMesa}`);
        return;
      }
    } catch {
      // Ignora erro de sessionStorage
    }
    setShowMenu(true);
  };

  const handleNotMe = () => {
    setSavedCustomer(null);
    setNomeInput("");
    setTelefoneInput("");
    setFormError(null);
    try {
      localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    } catch {
      // Ignora
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = nomeInput.trim();
    if (trimmedName.length < 2) {
      setFormError("Informe seu nome para continuar.");
      return;
    }

    if (!isValidBrPhone(telefoneInput)) {
      setFormError(
        "Informe um telefone brasileiro válido com DDD (ex: (11) 99999-9999)."
      );
      return;
    }

    const digits = normalizeBrPhone(telefoneInput);
    const identity: CustomerIdentity = {
      nomeCliente: trimmedName,
      telefone: digits,
    };

    try {
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // Ignora
    }

    setSavedCustomer(identity);
    proceedToMenuOrMesa();
  };

  if (showMenu) {
    return (
      <CardapioClient
        initialProdutos={initialProdutos}
        loadError={loadError}
      />
    );
  }

  const canSubmit =
    nomeInput.trim().length >= 2 && normalizeBrPhone(telefoneInput).length >= 10;

  return (
    <main className="arena-grid relative grid min-h-dvh place-items-center overflow-hidden p-4 text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_50%_0%,rgba(162,207,156,0.45),transparent_70%)]" />

      <div className="glass-card relative w-full max-w-md p-6 text-center shadow-[var(--shadow-elevated)] sm:max-w-lg sm:p-8">
        <div className="mx-auto mb-5 h-28 w-28 overflow-hidden rounded-full border-2 border-[var(--brand-primary-strong)]/40 bg-white shadow-[0_0_40px_rgba(162,207,156,0.5)]">
          <ArenaEmblem />
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-primary-strong)]">
          ARENA HOME BEACH
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)] sm:text-3xl">
          Cardápio Digital
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Peça bebidas e lanches direto da sua mesa.
        </p>

        {savedCustomer ? (
          <div className="mt-6 space-y-3">
            <p className="text-base font-bold text-[var(--foreground)]">
              Olá, {savedCustomer.nomeCliente}
            </p>
            <Button
              type="button"
              onClick={proceedToMenuOrMesa}
              className="h-12 w-full text-base font-bold"
            >
              Continuar
            </Button>
            <button
              type="button"
              onClick={handleNotMe}
              className="text-xs font-medium text-[var(--muted-foreground)] underline underline-offset-2 hover:text-[var(--foreground)] cursor-pointer"
            >
              Não sou eu
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
            <Input
              aria-label="Nome"
              value={nomeInput}
              onChange={(e) => {
                setFormError(null);
                setNomeInput(e.target.value);
              }}
              placeholder="Qual seu nome?"
              maxLength={80}
              className="h-12 text-base"
              required
            />
            <Input
              aria-label="Telefone"
              type="tel"
              inputMode="numeric"
              value={telefoneInput}
              onChange={(e) => {
                setFormError(null);
                setTelefoneInput(formatBrPhoneMask(e.target.value));
              }}
              placeholder="Qual seu telefone? (com DDD)"
              className="h-12 text-base"
              required
            />

            {formError && (
              <p className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--status-cancelado-fg)]">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="h-12 w-full text-base font-bold"
            >
              Ver cardápio
            </Button>
          </form>
        )}

        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <Link href="/admin" className="block w-full">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full text-sm font-semibold"
            >
              Painel Administrativo
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
