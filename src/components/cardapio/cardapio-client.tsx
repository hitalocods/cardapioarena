"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Beer,
  CheckCircle2,
  Clock,
  CupSoda,
  Flame,
  Loader2,
  Minus,
  Plus,
  QrCode,
  Sandwich,
  ShoppingBag,
  Sun,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ArenaEmblem } from "@/components/brand/arena-emblem";
import { formatCurrency } from "@/lib/format";

export interface CardapioProduto {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  preco: number;
  foto: string | null;
  ordem: number;
  controlaEstoque: boolean;
  estoque: number;
}

export interface CustomerIdentity {
  nomeCliente: string;
  telefone: string; // somente dígitos
}

interface StoredLastOrder {
  id: string;
  numero: number;
}

const LAST_ORDER_STORAGE_KEY = "ahb_last_order_v1";
const MAX_UNITS_PER_ITEM = 20;
const MAX_TOTAL_UNITS = 30;

function CategoryPlaceholderIcon({ categoria }: { categoria: string }) {
  const key = categoria.toLowerCase();
  if (key.includes("cerveja")) {
    return <Beer className="h-7 w-7 opacity-70" />;
  }
  if (key.includes("dose")) {
    return <Wine className="h-7 w-7 opacity-70" />;
  }
  if (key.includes("bebida")) {
    return <CupSoda className="h-7 w-7 opacity-70" />;
  }
  if (key.includes("lanche")) {
    return <Sandwich className="h-7 w-7 opacity-70" />;
  }
  if (key.includes("tira")) {
    return <Flame className="h-7 w-7 opacity-70" />;
  }
  return <UtensilsCrossed className="h-7 w-7 opacity-70" />;
}

export function CardapioClient({
  initialProdutos,
  mesaNumero,
  customer,
  onChangeCustomer,
  loadError,
}: {
  initialProdutos: CardapioProduto[];
  mesaNumero?: number;
  customer?: CustomerIdentity;
  onChangeCustomer?: () => void;
  loadError?: boolean;
}) {
  const router = useRouter();
  const isOrderMode = typeof mesaNumero === "number" && Boolean(customer);

  const [produtos, setProdutos] =
    React.useState<CardapioProduto[]>(initialProdutos);
  const [selectedCategoria, setSelectedCategoria] =
    React.useState<string>("Todos");
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [observacao, setObservacao] = React.useState("");

  const [lastOrder, setLastOrder] = React.useState<StoredLastOrder | null>(
    null
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Idempotency key por tentativa de envio: mantida em retries da mesma tentativa, renovada ao alterar carrinho/observação
  const idempotencyKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedOrder = localStorage.getItem(LAST_ORDER_STORAGE_KEY);
        if (savedOrder) {
          const parsedOrder = JSON.parse(savedOrder) as StoredLastOrder;
          if (parsedOrder?.id && parsedOrder?.numero) {
            setLastOrder(parsedOrder);
          }
        }
      } catch {
        // Ignora erros de localStorage em navegação privada
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const invalidateIdempotency = React.useCallback(() => {
    idempotencyKeyRef.current = null;
  }, []);

  const refreshCardapio = React.useCallback(async () => {
    try {
      const res = await fetch("/api/cardapio", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        produtos: CardapioProduto[];
      };
      setProdutos(data.produtos);
      setCart((prev) => {
        const next: Record<string, number> = {};
        const map = new Map(data.produtos.map((p) => [p.id, p]));
        for (const [id, qty] of Object.entries(prev)) {
          const prod = map.get(id);
          if (!prod) continue;
          const maxForProd = prod.controlaEstoque
            ? Math.min(MAX_UNITS_PER_ITEM, prod.estoque)
            : MAX_UNITS_PER_ITEM;
          if (maxForProd > 0) {
            next[id] = Math.min(qty, maxForProd);
          }
        }
        return next;
      });
    } catch {
      // Ignora falha silenciosa de atualização
    }
  }, []);

  const categorias = React.useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of produtos) {
      const cat = p.categoria || "Geral";
      if (!seen.has(cat)) {
        seen.add(cat);
        list.push(cat);
      }
    }
    return list;
  }, [produtos]);

  const groupedSections = React.useMemo(() => {
    const targetCats =
      selectedCategoria === "Todos" ? categorias : [selectedCategoria];
    return targetCats
      .map((cat) => ({
        categoria: cat,
        itens: produtos.filter((p) => (p.categoria || "Geral") === cat),
      }))
      .filter((sec) => sec.itens.length > 0);
  }, [produtos, categorias, selectedCategoria]);

  const totalUnits = React.useMemo(
    () => Object.values(cart).reduce((sum, q) => sum + q, 0),
    [cart]
  );

  const cartItems = React.useMemo(() => {
    return produtos
      .filter((p) => (cart[p.id] ?? 0) > 0)
      .map((p) => ({
        produto: p,
        quantidade: cart[p.id] ?? 0,
      }));
  }, [produtos, cart]);

  const totalCentavos = React.useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + item.produto.preco * item.quantidade,
        0
      ),
    [cartItems]
  );

  const handleQtyChange = (produto: CardapioProduto, delta: number) => {
    if (!isOrderMode) return;
    invalidateIdempotency();
    setSubmitError(null);
    setCart((prev) => {
      const current = prev[produto.id] ?? 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[produto.id];
        return copy;
      }

      const maxStock = produto.controlaEstoque
        ? produto.estoque
        : MAX_UNITS_PER_ITEM;
      const maxAllowed = Math.min(MAX_UNITS_PER_ITEM, maxStock);
      if (next > maxAllowed) {
        return prev;
      }

      const currentTotal = Object.values(prev).reduce((a, b) => a + b, 0);
      if (delta > 0 && currentTotal + delta > MAX_TOTAL_UNITS) {
        return prev;
      }

      return { ...prev, [produto.id]: next };
    });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOrderMode || !customer || mesaNumero === undefined || submitting) {
      return;
    }

    setSubmitError(null);

    if (cartItems.length === 0) {
      setSubmitError("Seu carrinho está vazio.");
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          nomeCliente: customer.nomeCliente,
          telefone: customer.telefone,
          mesaNumero,
          observacao: observacao.trim() || null,
          itens: cartItems.map((i) => ({
            produtoId: i.produto.id,
            quantidade: i.quantidade,
          })),
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          invalidateIdempotency();
          await refreshCardapio();
        }
        setSubmitError(
          payload.error ?? "Não foi possível enviar seu pedido. Tente novamente."
        );
        return;
      }

      const created = payload.pedido as { id: string; numero: number };
      try {
        localStorage.setItem(
          LAST_ORDER_STORAGE_KEY,
          JSON.stringify({ id: created.id, numero: created.numero })
        );
      } catch {
        // Ignora erro de armazenamento
      }

      setCart({});
      setCheckoutOpen(false);
      router.push(`/pedido/${created.id}`);
    } catch {
      setSubmitError(
        "Falha de conexão ao enviar o pedido. Verifique sua internet e tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-4 ${
        isOrderMode
          ? "pb-[calc(8.5rem+env(safe-area-inset-bottom))]"
          : "pb-10"
      }`}
    >
      {/* Cabeçalho fixo no topo mantendo Mesa N sempre visível */}
      {isOrderMode && mesaNumero !== undefined ? (
        <div className="sticky top-2 z-20 mb-4">
          <div className="glass-bar flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--brand-primary)] px-3.5 py-1 text-sm font-black text-[var(--brand-primary-foreground)]">
                Mesa {mesaNumero}
              </span>
              <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                {customer?.nomeCliente}
              </span>
            </div>
            {onChangeCustomer && (
              <button
                type="button"
                onClick={onChangeCustomer}
                className="shrink-0 text-xs font-semibold text-[var(--muted-foreground)] underline underline-offset-2 hover:text-[var(--foreground)] cursor-pointer"
              >
                Trocar dados
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Cabeçalho do cardápio */}
      <header className="glass-card mb-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary-foreground)]">
              <Sun className="h-3.5 w-3.5 text-[var(--brand-primary-strong)]" />
              Arena Home Beach
            </div>
            <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Cardápio da Arena
            </h1>
          </div>
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[var(--brand-primary-strong)]/35 bg-white shadow-xs">
            <ArenaEmblem />
          </div>
        </div>

        {isOrderMode ? (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Escolha seus itens e finalize para receber na{" "}
            <strong>Mesa {mesaNumero}</strong>. Pagamento direto na arena.
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-[var(--status-preparando-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-preparando-fg)]">
            <QrCode className="h-5 w-5 shrink-0" />
            <span>Escaneie o QR Code da sua mesa para pedir.</span>
          </div>
        )}

        {lastOrder && (
          <Link
            href={`/pedido/${lastOrder.id}`}
            className="mt-4 flex items-center justify-between rounded-2xl border border-[var(--brand-primary)]/50 bg-[var(--brand-primary-soft)]/80 px-4 py-2.5 text-sm font-semibold text-[var(--brand-primary-foreground)] transition-colors hover:bg-[var(--brand-primary-soft)]"
          >
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--brand-primary-strong)]" />
              Acompanhar seu último pedido (#{lastOrder.numero})
            </span>
            <span className="text-xs underline">Ver status</span>
          </Link>
        )}
      </header>

      {/* Filtro rápido de categorias */}
      {categorias.length > 1 && (
        <nav
          aria-label="Categorias do cardápio"
          className="mb-4 flex gap-2 overflow-x-auto pb-1"
        >
          {["Todos", ...categorias].map((cat) => {
            const active = selectedCategoria === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoria(cat)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition cursor-pointer ${
                  active
                    ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                    : "border-[var(--border)] bg-white/80 text-[var(--muted-foreground)] hover:bg-white hover:text-[var(--foreground)]"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </nav>
      )}

      {/* Lista de itens */}
      {loadError ? (
        <div className="glass-card p-6 text-center">
          <p className="font-semibold text-[var(--foreground)]">
            Não foi possível carregar o cardápio agora.
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Tente atualizar a página em alguns instantes.
          </p>
          <Button className="mt-4" onClick={() => refreshCardapio()}>
            Tentar novamente
          </Button>
        </div>
      ) : produtos.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <UtensilsCrossed className="mx-auto h-10 w-10 text-[var(--muted-foreground)]" />
          <p className="mt-3 font-semibold text-[var(--foreground)]">
            Nenhum item disponível no momento
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Volte em instantes ou peça diretamente no bar da arena.
          </p>
        </div>
      ) : (
        <main className="flex flex-col gap-6">
          {groupedSections.map((section) => (
            <section key={section.categoria} className="flex flex-col gap-3">
              <h2 className="px-1 text-sm font-black uppercase tracking-wider text-[var(--brand-primary-strong)]">
                {section.categoria}
              </h2>

              {section.itens.map((produto) => {
                const qty = cart[produto.id] ?? 0;
                const outOfStock =
                  produto.controlaEstoque && produto.estoque <= 0;
                const maxForProduct = produto.controlaEstoque
                  ? Math.min(MAX_UNITS_PER_ITEM, produto.estoque)
                  : MAX_UNITS_PER_ITEM;
                const canAdd =
                  isOrderMode &&
                  !outOfStock &&
                  qty < maxForProduct &&
                  totalUnits < MAX_TOTAL_UNITS;

                return (
                  <article
                    key={produto.id}
                    className={`glass-card flex items-center gap-4 p-3.5 transition-opacity ${
                      outOfStock ? "opacity-65" : ""
                    }`}
                  >
                    {/* Foto ou fundo da cor da Arena */}
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[#a2cf9c]/60 bg-gradient-to-br from-[#eaf5e8] to-[#a2cf9c]/75">
                      {produto.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={produto.foto}
                          alt={produto.nome}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#142614]">
                          <CategoryPlaceholderIcon
                            categoria={produto.categoria}
                          />
                        </div>
                      )}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-bold leading-snug text-[var(--foreground)]">
                            {produto.nome}
                          </h3>
                          {outOfStock && (
                            <Badge variant="destructive" className="shrink-0">
                              Esgotado
                            </Badge>
                          )}
                        </div>
                        {produto.descricao && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted-foreground)]">
                            {produto.descricao}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-extrabold text-[var(--foreground)]">
                          {formatCurrency(produto.preco)}
                        </span>

                        {!isOrderMode ? null : outOfStock ? (
                          <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                            Indisponível
                          </span>
                        ) : qty === 0 ? (
                          <Button
                            size="sm"
                            onClick={() => handleQtyChange(produto, 1)}
                            disabled={!canAdd}
                            aria-label={`Adicionar ${produto.nome}`}
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar
                          </Button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] p-1 border border-[var(--brand-primary)]/40">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(produto, -1)}
                              aria-label={`Remover uma unidade de ${produto.nome}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--foreground)] shadow-xs active:scale-95 cursor-pointer"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-6 text-center text-sm font-bold text-[var(--foreground)]">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(produto, 1)}
                              disabled={!canAdd}
                              aria-label={`Adicionar mais uma unidade de ${produto.nome}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs active:scale-95 disabled:opacity-40 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </main>
      )}

      {/* Barra fixa inferior do carrinho (somente quando acessado via /mesa/[numero]) */}
      {isOrderMode && totalUnits > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
          <div className="glass-bar flex items-center justify-between gap-3 rounded-[1.5rem] p-3.5">
            <div className="min-w-0 pl-1">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                {totalUnits} {totalUnits === 1 ? "item" : "itens"} · Mesa{" "}
                {mesaNumero}
              </p>
              <p className="text-xl font-extrabold text-[var(--foreground)]">
                {formatCurrency(totalCentavos)}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => {
                setSubmitError(null);
                setCheckoutOpen(true);
              }}
              className="shrink-0"
            >
              <ShoppingBag className="h-5 w-5" />
              Finalizar pedido
            </Button>
          </div>
        </div>
      )}

      {/* Modal Confirmar pedido: apenas resumo, Mesa N, observação e rodapé fixo com Enviar pedido */}
      {isOrderMode && mesaNumero !== undefined && (
        <Dialog
          open={checkoutOpen}
          onOpenChange={(open) => {
            if (!submitting) setCheckoutOpen(open);
          }}
          title="Confirmar pedido"
          description="Pagamento realizado diretamente na Arena Home Beach."
          footer={
            <div className="flex flex-col gap-2.5">
              {submitError && (
                <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-2.5 text-sm font-medium text-[var(--status-cancelado-fg)]">
                  {submitError}
                </div>
              )}
              <Button
                type="submit"
                form="confirm-order-form"
                size="xl"
                disabled={submitting || cartItems.length === 0}
                className="w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Enviando pedido...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Enviar pedido · {formatCurrency(totalCentavos)}
                  </>
                )}
              </Button>
            </div>
          }
        >
          <form
            id="confirm-order-form"
            onSubmit={handleSubmitOrder}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between rounded-2xl border border-[var(--brand-primary)]/50 bg-[var(--brand-primary-soft)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--brand-primary-foreground)]">
                Entrega do pedido
              </span>
              <span className="rounded-full bg-[var(--brand-primary)] px-3.5 py-1 text-sm font-black text-[var(--brand-primary-foreground)]">
                Mesa {mesaNumero}
              </span>
            </div>

            <div className="rounded-2xl bg-[var(--surface-subtle)] p-3.5 border border-[var(--border)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Resumo do pedido
              </p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {cartItems.map(({ produto, quantidade }) => (
                  <li
                    key={produto.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium text-[var(--foreground)]">
                      {quantidade}x {produto.nome}
                    </span>
                    <span className="shrink-0 font-semibold text-[var(--foreground)]">
                      {formatCurrency(produto.preco * quantidade)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5">
                <span className="text-sm font-bold text-[var(--foreground)]">
                  Total a pagar na arena
                </span>
                <span className="text-lg font-extrabold text-[var(--brand-primary-strong)]">
                  {formatCurrency(totalCentavos)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observacao">Observação (opcional)</Label>
              <Textarea
                id="observacao"
                placeholder="Ex: gelo e limão, sem ketchup..."
                value={observacao}
                onChange={(e) => {
                  invalidateIdempotency();
                  setObservacao(e.target.value);
                }}
                maxLength={300}
              />
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
