"use client";

import * as React from "react";
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

export function MesaFlowClient({
  mesaNumero,
  initialProdutos,
}: {
  mesaNumero: number;
  initialProdutos: CardapioProduto[];
}) {
  const [step, setStep] = React.useState<"welcome" | "menu">("welcome");
  const [savedCustomer, setSavedCustomer] =
    React.useState<CustomerIdentity | null>(null);
  const [nomeInput, setNomeInput] = React.useState("");
  const [telefoneInput, setTelefoneInput] = React.useState("");
  const [activeCustomer, setActiveCustomer] =
    React.useState<CustomerIdentity | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_MESA_KEY, String(mesaNumero));
    } catch {
      // Ignora erro em navegação privada
    }

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
        // Ignora erro de localStorage
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [mesaNumero]);

  const handleContinueSaved = () => {
    if (!savedCustomer) return;
    setActiveCustomer(savedCustomer);
    setStep("menu");
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

  const handleSubmitWelcome = (e: React.FormEvent) => {
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
    setActiveCustomer(identity);
    setStep("menu");
  };

  if (step === "menu" && activeCustomer) {
    return (
      <CardapioClient
        mesaNumero={mesaNumero}
        customer={activeCustomer}
        initialProdutos={initialProdutos}
        onChangeCustomer={() => setStep("welcome")}
      />
    );
  }

  const canSubmit =
    nomeInput.trim().length >= 2 && normalizeBrPhone(telefoneInput).length >= 10;

  return (
    <main className="arena-grid relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_50%_0%,rgba(162,207,156,0.45),transparent_70%)]" />

      <section className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mx-auto mb-8 h-36 w-36 overflow-hidden rounded-full border-2 border-[var(--brand-primary-strong)]/40 bg-white/95 shadow-[0_0_48px_rgba(162,207,156,0.55)]">
          <ArenaEmblem />
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            Bem-vindo(a) à
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-wide text-[var(--foreground)] sm:text-5xl">
            ARENA
          </h1>
          <p className="mt-1 text-xl font-bold tracking-[0.16em] text-[var(--brand-primary-strong)]">
            HOME BEACH
          </p>
          <div className="mt-5 inline-flex items-center rounded-full border border-[var(--brand-primary-strong)]/35 bg-[var(--brand-primary)]/35 px-4 py-1 text-sm font-bold text-[var(--brand-primary-foreground)]">
            Mesa {mesaNumero}
          </div>
        </div>

        {savedCustomer ? (
          <div className="mt-8 space-y-3 text-center">
            <p className="text-lg font-bold text-[var(--foreground)]">
              Olá, {savedCustomer.nomeCliente}
            </p>
            <Button
              type="button"
              onClick={handleContinueSaved}
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
          <form onSubmit={handleSubmitWelcome} className="mt-8 space-y-3">
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
      </section>
    </main>
  );
}
