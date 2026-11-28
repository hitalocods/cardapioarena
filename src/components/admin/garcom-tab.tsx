"use client";

import * as React from "react";
import {
  BellRing,
  Check,
  CheckCircle2,
  ClipboardPlus,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import type { ComandaDetailDTO, ComandaPessoaDTO, ComandaSummaryDTO } from "@/lib/comandas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { formatBrPhoneMask } from "@/lib/phone";

const LANCADO_POR_STORAGE_KEY = "ahb_lancado_por_v1";

interface MesaItem {
  id: string;
  numero: number;
  ativa: boolean;
}

interface CatalogProduto {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  ativo: boolean;
  controlaEstoque: boolean;
  estoque: number;
}

export function GarcomTab({
  onOrderCreated,
}: {
  onOrderCreated?: () => void;
}) {
  const [mesas, setMesas] = React.useState<MesaItem[]>([]);
  const [abertasByMesa, setAbertasByMesa] = React.useState<
    Record<number, ComandaSummaryDTO>
  >({});
  const [produtos, setProdutos] = React.useState<CatalogProduto[]>([]);
  const [loadingInit, setLoadingInit] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const [selectedMesa, setSelectedMesa] = React.useState<number | null>(null);
  const [pessoasMesa, setPessoasMesa] = React.useState<ComandaPessoaDTO[]>([]);
  const [loadingPessoas, setLoadingPessoas] = React.useState(false);

  // Pessoa selecionada: null = Nova pessoa; string = telefone/chave existente
  const [selectedPessoaKey, setSelectedPessoaKey] = React.useState<
    string | null
  >(null);
  const [novoNome, setNovoNome] = React.useState("");
  const [novoTelefone, setNovoTelefone] = React.useState("");

  // Itens do pedido
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("Todos");
  const [cart, setCart] = React.useState<Record<string, number>>({});

  // Opções
  const [enviarCozinha, setEnviarCozinha] = React.useState(true); // MARCADO por padrão
  const [observacao, setObservacao] = React.useState("");
  const [lancadoPor, setLancadoPor] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const idempotencyKeyRef = React.useRef<string | null>(null);

  const resetIdempotency = () => {
    idempotencyKeyRef.current = null;
  };

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(LANCADO_POR_STORAGE_KEY);
        if (saved) setLancadoPor(saved);
      } catch {
        // Ignora erro de localStorage
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadBaseData = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [catRes, comRes] = await Promise.all([
        fetch("/api/admin/garcom/catalogo", { cache: "no-store" }),
        fetch("/api/admin/comandas?status=ABERTA", { cache: "no-store" }),
      ]);

      if (catRes.ok) {
        const catJson = (await catRes.json()) as {
          mesas: MesaItem[];
          produtos: CatalogProduto[];
        };
        setMesas(catJson.mesas.filter((m) => m.ativa));
        setProdutos(catJson.produtos.filter((p) => p.ativo));
      }

      if (comRes.ok) {
        const cJson = (await comRes.json()) as { comandas: ComandaSummaryDTO[] };
        const map: Record<number, ComandaSummaryDTO> = {};
        for (const cmd of cJson.comandas) {
          if (cmd.mesaNumero !== null) {
            map[cmd.mesaNumero] = cmd;
          }
        }
        setAbertasByMesa(map);
      }

      setError(null);
    } catch {
      setError("Falha de conexão ao carregar mesas e cardápio.");
    } finally {
      setLoadingInit(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void loadBaseData(false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadBaseData]);

  const loadPessoasDaComanda = React.useCallback(async (comandaId: string) => {
    setLoadingPessoas(true);
    try {
      const res = await fetch(`/api/admin/comandas/${comandaId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setPessoasMesa([]);
        return;
      }
      const data = (await res.json()) as { comanda: ComandaDetailDTO };
      setPessoasMesa(data.comanda.pessoas);
    } catch {
      setPessoasMesa([]);
    } finally {
      setLoadingPessoas(false);
    }
  }, []);

  const handleSelectMesa = (mesaNumero: number) => {
    resetIdempotency();
    setError(null);
    setFeedback(null);
    setSelectedMesa(mesaNumero);
    setSelectedPessoaKey(null);
    setNovoNome("");
    setNovoTelefone("");

    const comandaAberta = abertasByMesa[mesaNumero];
    if (comandaAberta) {
      void loadPessoasDaComanda(comandaAberta.id);
    } else {
      setPessoasMesa([]);
    }
  };

  const handleLancadoPorChange = (value: string) => {
    setLancadoPor(value);
    resetIdempotency();
    try {
      if (value.trim()) {
        localStorage.setItem(LANCADO_POR_STORAGE_KEY, value.trim());
      } else {
        localStorage.removeItem(LANCADO_POR_STORAGE_KEY);
      }
    } catch {
      // Ignora erro de localStorage
    }
  };

  const categorias = React.useMemo(() => {
    const set = new Set<string>(["Todos"]);
    for (const p of produtos) {
      set.add(p.categoria || "Geral");
    }
    return Array.from(set);
  }, [produtos]);

  const filteredProdutos = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const catOk = categoria === "Todos" || (p.categoria || "Geral") === categoria;
      const qOk = !q || p.nome.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [busca, categoria, produtos]);

  const produtoMap = React.useMemo(
    () => new Map(produtos.map((p) => [p.id, p])),
    [produtos]
  );

  const selectedItems = React.useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([produtoId, quantidade]) => {
        const produto = produtoMap.get(produtoId);
        if (!produto) return null;
        return {
          produto,
          quantidade,
          subtotal: produto.preco * quantidade,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [cart, produtoMap]);

  const totalUnits = React.useMemo(
    () => selectedItems.reduce((acc, i) => acc + i.quantidade, 0),
    [selectedItems]
  );

  const totalCentavos = React.useMemo(
    () => selectedItems.reduce((acc, i) => acc + i.subtotal, 0),
    [selectedItems]
  );

  const selectedExistingPessoa = React.useMemo(() => {
    if (!selectedPessoaKey) return null;
    return pessoasMesa.find((p) => p.telefone === selectedPessoaKey) ?? null;
  }, [pessoasMesa, selectedPessoaKey]);

  const activeNome = selectedExistingPessoa
    ? selectedExistingPessoa.nome
    : novoNome.trim();

  const canSubmit = Boolean(
    !submitting &&
      selectedMesa !== null &&
      activeNome.length >= 2 &&
      selectedItems.length > 0
  );

  const handleQtyDelta = (produto: CatalogProduto, delta: number) => {
    resetIdempotency();
    setError(null);
    setCart((prev) => {
      const current = prev[produto.id] ?? 0;
      const maxAllowed = produto.controlaEstoque ? produto.estoque : 100;
      const next = Math.max(0, Math.min(maxAllowed, current + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[produto.id];
        return copy;
      }
      return { ...prev, [produto.id]: next };
    });
  };

  const handleSubmitOrder = async () => {
    if (!canSubmit || selectedMesa === null) return;

    setSubmitting(true);
    setError(null);
    setFeedback(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    const payload = {
      idempotencyKey: idempotencyKeyRef.current,
      mesaNumero: selectedMesa,
      nomeCliente: activeNome,
      telefone: selectedExistingPessoa
        ? selectedExistingPessoa.telefone
        : novoTelefone.trim() || null,
      observacao: observacao.trim() || null,
      enviarCozinha,
      lancadoPor: lancadoPor.trim() || null,
      itens: selectedItems.map((i) => ({
        produtoId: i.produto.id,
        quantidade: i.quantidade,
      })),
    };

    try {
      const res = await fetch("/api/admin/garcom/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          resetIdempotency();
          await loadBaseData(false);
        }
        setError(data.error ?? "Não foi possível lançar o pedido.");
        return;
      }

      const pedidoNumero = data.pedido?.numero;
      const cmdId = data.comandaId as string | undefined;

      resetIdempotency();
      setCart({});
      setObservacao("");
      setFeedback(
        `Pedido #${pedidoNumero ?? ""} lançado na Mesa ${selectedMesa} (${activeNome})!${
          enviarCozinha ? " Enviado para a cozinha." : " Registrado como entregue."
        }`
      );

      await loadBaseData(false);
      if (cmdId) {
        await loadPessoasDaComanda(cmdId);
      }
      onOrderCreated?.();
    } catch {
      setError("Falha de conexão. Toque novamente para reenviar sem duplicar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))]">
      {/* Cabeçalho */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[var(--foreground)]">
            <ClipboardPlus className="h-5 w-5 text-[var(--brand-primary-strong)]" />
            Lançar Pedido (Modo Garçom)
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Escolha a mesa, selecione ou adicione a pessoa e lance os itens na
            comanda.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadBaseData(true);
            if (selectedMesa !== null && abertasByMesa[selectedMesa]) {
              void loadPessoasDaComanda(abertasByMesa[selectedMesa]!.id);
            }
          }}
          disabled={refreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
          {error}
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--brand-primary-foreground)]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--brand-primary-strong)]" />
          <span>{feedback}</span>
        </div>
      )}

      {/* 1. Grade de Mesas */}
      <div className="glass-card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
            1. Escolha a mesa
          </h3>
          <span className="text-xs text-[var(--muted-foreground)]">
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[var(--brand-primary)]" />
            Comanda aberta
          </span>
        </div>

        {loadingInit ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-[var(--surface-subtle)]"
              />
            ))}
          </div>
        ) : mesas.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhuma mesa ativa cadastrada. Ative mesas na aba Mesas.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
            {mesas.map((mesa) => {
              const comanda = abertasByMesa[mesa.numero];
              const isSelected = selectedMesa === mesa.numero;
              return (
                <button
                  key={mesa.id}
                  type="button"
                  onClick={() => handleSelectMesa(mesa.numero)}
                  className={`relative flex min-h-16 flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition active:scale-95 cursor-pointer ${
                    isSelected
                      ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] ring-2 ring-[var(--brand-primary-strong)] shadow-xs"
                      : comanda
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/75 text-[var(--foreground)] hover:bg-[var(--brand-primary-soft)]"
                      : "border-[var(--border)] bg-white/85 text-[var(--foreground)] hover:bg-white"
                  }`}
                >
                  {comanda?.pediuConta && (
                    <BellRing
                      className="absolute right-1.5 top-1.5 h-3.5 w-3.5 animate-pulse text-amber-600"
                      aria-label="Pediu a conta"
                    />
                  )}
                  <span className="text-[10px] font-bold uppercase opacity-75">
                    Mesa
                  </span>
                  <span className="text-xl font-black leading-tight">
                    {mesa.numero}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold opacity-80">
                    {comanda
                      ? `${comanda.qtdPessoas} pess.`
                      : "Livre"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Pessoa na Mesa (Chips + Nova pessoa) */}
      {selectedMesa !== null && (
        <div className="glass-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
              <Users className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              2. Pessoa na Mesa {selectedMesa}
            </h3>
            {loadingPessoas && (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {pessoasMesa.map((pessoa) => {
              const active = selectedPessoaKey === pessoa.telefone;
              return (
                <button
                  key={pessoa.telefone}
                  type="button"
                  onClick={() => {
                    resetIdempotency();
                    setSelectedPessoaKey(pessoa.telefone);
                    setError(null);
                  }}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition active:scale-95 cursor-pointer ${
                    active
                      ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                      : "border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="break-words">{pessoa.nome}</span>
                  <span className="text-xs opacity-75">
                    ({formatCurrency(pessoa.subtotal)})
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                resetIdempotency();
                setSelectedPessoaKey(null);
                setError(null);
              }}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition active:scale-95 cursor-pointer ${
                selectedPessoaKey === null
                  ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                  : "border-dashed border-[var(--border)] bg-white/80 text-[var(--foreground)] hover:bg-white"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Nova pessoa
            </button>
          </div>

          {selectedPessoaKey === null && (
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="garcom-nome-pessoa">
                  Nome da pessoa{" "}
                  <span className="text-[var(--destructive)]">*</span>
                </Label>
                <Input
                  id="garcom-nome-pessoa"
                  placeholder="Ex: João"
                  value={novoNome}
                  onChange={(e) => {
                    resetIdempotency();
                    setNovoNome(e.target.value);
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="garcom-tel-pessoa">
                  Telefone (opcional)
                </Label>
                <Input
                  id="garcom-tel-pessoa"
                  type="tel"
                  inputMode="tel"
                  placeholder="(86) 99999-9999"
                  value={novoTelefone}
                  onChange={(e) => {
                    resetIdempotency();
                    setNovoTelefone(formatBrPhoneMask(e.target.value));
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Itens do Cardápio */}
      <div className="glass-card flex flex-col gap-3 p-4">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--muted-foreground)]">
          3. Escolha os itens
        </h3>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            placeholder="Buscar item..."
            className="pl-10"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categorias.map((cat) => {
            const active = categoria === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoria(cat)}
                className={`min-h-11 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition cursor-pointer sm:min-h-9 ${
                  active
                    ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                    : "border border-[var(--border)] bg-white text-[var(--muted-foreground)]"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {filteredProdutos.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
            Nenhum item encontrado.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredProdutos.map((prod) => {
              const qty = cart[prod.id] ?? 0;
              const outOfStock = prod.controlaEstoque && prod.estoque <= 0;
              const atMax = prod.controlaEstoque && qty >= prod.estoque;

              return (
                <li
                  key={prod.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${
                    qty > 0
                      ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary-soft)]/70"
                      : "border-[var(--border)] bg-white/85"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words font-bold text-[var(--foreground)]">
                        {prod.nome}
                      </span>
                      {outOfStock && (
                        <Badge variant="destructive">Esgotado</Badge>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      <strong className="text-sm font-extrabold text-[var(--brand-primary-strong)]">
                        {formatCurrency(prod.preco)}
                      </strong>
                      {prod.controlaEstoque && (
                        <span> · Estoque: {prod.estoque}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 rounded-full"
                      disabled={qty <= 0}
                      onClick={() => handleQtyDelta(prod, -1)}
                      aria-label={`Remover ${prod.nome}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="min-w-6 text-center text-base font-black">
                      {qty}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      className="h-11 w-11 rounded-full"
                      disabled={outOfStock || atMax}
                      onClick={() => handleQtyDelta(prod, 1)}
                      aria-label={`Adicionar ${prod.nome}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 4. Opções do Lançamento */}
      <div className="glass-card flex flex-col gap-3 p-4">
        <label className="flex items-start gap-3 rounded-2xl border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/50 p-3.5 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={enviarCozinha}
            onChange={(e) => {
              resetIdempotency();
              setEnviarCozinha(e.target.checked);
            }}
            className="mt-0.5 h-4 w-4 accent-[var(--brand-primary-strong)]"
          />
          <span>
            <span className="block font-extrabold text-[var(--foreground)]">
              Enviar para a cozinha
            </span>
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              Marcado = entra na fila da cozinha e notifica o painel. Desmarque
              para bebidas/itens entregues na hora.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="garcom-obs">Observação (opcional)</Label>
            <Textarea
              id="garcom-obs"
              placeholder="Ex: bem passado, sem cebola, copo com gelo..."
              value={observacao}
              onChange={(e) => {
                resetIdempotency();
                setObservacao(e.target.value);
              }}
              maxLength={300}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="garcom-lancado-por">
              Lançado por (opcional)
            </Label>
            <Input
              id="garcom-lancado-por"
              placeholder="Seu nome (salvo neste aparelho)"
              value={lancadoPor}
              onChange={(e) => handleLancadoPorChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Rodapé fixo no celular com resumo e botão Lançar pedido */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-7xl px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div className="glass-bar flex items-center justify-between gap-3 rounded-[1.5rem] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">
              {selectedMesa !== null
                ? `Mesa ${selectedMesa}${activeNome ? ` · ${activeNome}` : " · informe a pessoa"}`
                : "Selecione uma mesa"}
              {totalUnits > 0
                ? ` · ${totalUnits} ${totalUnits === 1 ? "item" : "itens"}`
                : ""}
            </p>
            <p className="text-xl font-black text-[var(--foreground)]">
              {formatCurrency(totalCentavos)}
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!canSubmit}
            onClick={() => void handleSubmitOrder()}
            className="shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Lançando...
              </>
            ) : (
              <>
                <ClipboardPlus className="h-4 w-4" />
                Lançar pedido
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
