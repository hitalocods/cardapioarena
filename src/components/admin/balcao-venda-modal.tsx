"use client";

import * as React from "react";
import type { FormaPagamento } from "@prisma/client";
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import type { BalcaoVendaDTO } from "@/app/api/admin/balcao/vendas/route";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FORMA_PAGAMENTO_LABELS,
  FORMAS_PAGAMENTO_ORDEM,
  formatCentavosInput,
  formatCurrency,
  parseCurrencyToCentavos,
} from "@/lib/format";

const RECEBIDO_POR_STORAGE_KEY = "ahb_recebido_por_v1";

interface CatalogProduto {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  ativo: boolean;
  controlaEstoque: boolean;
  estoque: number;
}

interface PagamentoDraft {
  id: string;
  forma: FormaPagamento | null;
  valorInput: string;
  valorEdited: boolean;
  dinheiroRecebidoInput: string;
}

function FormaIcon({ forma }: { forma: FormaPagamento }) {
  if (forma === "PIX") return <QrCode className="h-4 w-4" />;
  if (forma === "DINHEIRO") return <Banknote className="h-4 w-4" />;
  return <CreditCard className="h-4 w-4" />;
}

export function BalcaoVendaModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (venda: BalcaoVendaDTO) => void;
}) {
  const [produtos, setProdutos] = React.useState<CatalogProduto[]>([]);
  const [loadingProdutos, setLoadingProdutos] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("Todos");
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [nomeCliente, setNomeCliente] = React.useState("");
  const [observacao, setObservacao] = React.useState("");
  const [enviarCozinha, setEnviarCozinha] = React.useState(false);
  const [recebidoPor, setRecebidoPor] = React.useState("");
  const [pagamentos, setPagamentos] = React.useState<PagamentoDraft[]>([
    {
      id: "p1",
      forma: null,
      valorInput: "",
      valorEdited: false,
      dinheiroRecebidoInput: "",
    },
  ]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const idempotencyKeyRef = React.useRef<string | null>(null);
  const nextDraftSeqRef = React.useRef(2);

  React.useEffect(() => {
    if (!open) return;

    let active = true;
    idempotencyKeyRef.current = null;

    const initTimer = window.setTimeout(() => {
      if (!active) return;
      setLoadingProdutos(true);
      setError(null);
      setBusca("");
      setCategoria("Todos");
      setCart({});
      setNomeCliente("");
      setObservacao("");
      setEnviarCozinha(false);
      setPagamentos([
        {
          id: "p1",
          forma: null,
          valorInput: "",
          valorEdited: false,
          dinheiroRecebidoInput: "",
        },
      ]);
      try {
        const saved = localStorage.getItem(RECEBIDO_POR_STORAGE_KEY);
        if (saved) setRecebidoPor(saved);
      } catch {
        // Ignora erro de localStorage
      }
    }, 0);

    fetch("/api/admin/produtos", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setError("Não foi possível carregar o catálogo.");
          return;
        }
        const data = (await res.json()) as { produtos: CatalogProduto[] };
        if (active) {
          setProdutos(data.produtos.filter((p) => p.ativo));
        }
      })
      .catch(() => {
        if (active) setError("Erro de conexão ao carregar catálogo.");
      })
      .finally(() => {
        if (active) setLoadingProdutos(false);
      });

    return () => {
      active = false;
      window.clearTimeout(initTimer);
    };
  }, [open]);

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

  const totalVenda = React.useMemo(
    () => selectedItems.reduce((acc, item) => acc + item.subtotal, 0),
    [selectedItems]
  );

  // Mantém linha única sincronizada com o total enquanto não editada manualmente
  const effectivePagamentos = React.useMemo(() => {
    if (pagamentos.length === 1 && !pagamentos[0]!.valorEdited) {
      return [
        {
          ...pagamentos[0]!,
          valorCentavos: totalVenda,
          displayValorInput:
            totalVenda > 0 ? formatCentavosInput(totalVenda) : "",
        },
      ];
    }
    return pagamentos.map((p) => ({
      ...p,
      valorCentavos: parseCurrencyToCentavos(p.valorInput) ?? 0,
      displayValorInput: p.valorInput,
    }));
  }, [pagamentos, totalVenda]);

  const totalAlocado = React.useMemo(
    () => effectivePagamentos.reduce((acc, p) => acc + p.valorCentavos, 0),
    [effectivePagamentos]
  );

  const diferenca = totalVenda - totalAlocado;

  const canSubmit = React.useMemo(() => {
    if (submitting || selectedItems.length === 0 || totalVenda <= 0) {
      return false;
    }
    if (diferenca !== 0) return false;
    return effectivePagamentos.every(
      (p) => p.forma !== null && p.valorCentavos > 0
    );
  }, [diferenca, effectivePagamentos, selectedItems.length, submitting, totalVenda]);

  const resetIdempotency = () => {
    idempotencyKeyRef.current = null;
  };

  const handleQtyDelta = (produto: CatalogProduto, delta: number) => {
    resetIdempotency();
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

  const handleAddPagamento = () => {
    resetIdempotency();
    const id = `p${nextDraftSeqRef.current++}`;
    setPagamentos((prev) => {
      // Se só havia 1 linha em modo automático, fixa seu valor atual antes de adicionar a 2ª
      const normalized =
        prev.length === 1 && !prev[0]!.valorEdited
          ? [
              {
                ...prev[0]!,
                valorInput: totalVenda > 0 ? formatCentavosInput(totalVenda) : "",
                valorEdited: true,
              },
            ]
          : prev;

      const alocado = normalized.reduce(
        (acc, p) => acc + (parseCurrencyToCentavos(p.valorInput) ?? 0),
        0
      );
      const restante = Math.max(0, totalVenda - alocado);
      return [
        ...normalized,
        {
          id,
          forma: null,
          valorInput: restante > 0 ? formatCentavosInput(restante) : "",
          valorEdited: true,
          dinheiroRecebidoInput: "",
        },
      ];
    });
  };

  const handleRemovePagamento = (id: string) => {
    resetIdempotency();
    setPagamentos((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (filtered.length === 0) {
        return [
          {
            id: "p1",
            forma: null,
            valorInput: "",
            valorEdited: false,
            dinheiroRecebidoInput: "",
          },
        ];
      }
      if (filtered.length === 1) {
        return [{ ...filtered[0]!, valorEdited: false, valorInput: "" }];
      }
      return filtered;
    });
  };

  const handleRecebidoPorChange = (val: string) => {
    setRecebidoPor(val);
    resetIdempotency();
    try {
      if (val.trim()) {
        localStorage.setItem(RECEBIDO_POR_STORAGE_KEY, val.trim());
      } else {
        localStorage.removeItem(RECEBIDO_POR_STORAGE_KEY);
      }
    } catch {
      // Ignora erro de localStorage
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const res = await fetch("/api/admin/balcao/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          nomeCliente: nomeCliente.trim() || null,
          observacao: observacao.trim() || null,
          enviarCozinha,
          recebidoPor: recebidoPor.trim() || null,
          itens: selectedItems.map((i) => ({
            produtoId: i.produto.id,
            quantidade: i.quantidade,
          })),
          pagamentos: effectivePagamentos.map((p) => ({
            forma: p.forma,
            valor: p.valorCentavos,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível registrar a venda.");
        idempotencyKeyRef.current = null;
        return;
      }

      onSuccess?.(data.venda as BalcaoVendaDTO);
      onOpenChange(false);
    } catch {
      setError("Falha de conexão. Clique novamente para tentar de novo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova venda de balcão"
      description="Escolha os itens, a(s) forma(s) de pagamento e registre a venda."
      className="sm:max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="block text-xs font-semibold text-[var(--muted-foreground)]">
              Total da venda ({selectedItems.reduce((s, i) => s + i.quantidade, 0)}{" "}
              un.)
            </span>
            <strong className="text-xl font-black text-[var(--foreground)]">
              {formatCurrency(totalVenda)}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="balcao-venda-form"
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Registrar venda
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="balcao-venda-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {error && (
          <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-semibold text-[var(--status-cancelado-fg)]">
            {error}
          </div>
        )}

        {/* Busca e filtro de categoria */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              placeholder="Buscar item do cardápio..."
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
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
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
        </div>

        {/* Lista de produtos */}
        {loadingProdutos ? (
          <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" />
        ) : (
          <div className="max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-2">
            {filteredProdutos.length === 0 ? (
              <p className="p-4 text-center text-sm text-[var(--muted-foreground)]">
                Nenhum item encontrado.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {filteredProdutos.map((prod) => {
                  const qty = cart[prod.id] ?? 0;
                  const outOfStock = prod.controlaEstoque && prod.estoque <= 0;
                  const atMax =
                    prod.controlaEstoque && qty >= prod.estoque;

                  return (
                    <li
                      key={prod.id}
                      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${
                        qty > 0
                          ? "bg-[var(--brand-primary-soft)]/70 border border-[var(--brand-primary-strong)]/40"
                          : "bg-white/90"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-[var(--foreground)]">
                          {prod.nome}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                          <span className="font-extrabold text-[var(--brand-primary-strong)]">
                            {formatCurrency(prod.preco)}
                          </span>
                          {prod.controlaEstoque && (
                            <span>
                              · Estoque: <strong>{prod.estoque}</strong>
                            </span>
                          )}
                          {outOfStock && (
                            <Badge variant="destructive">Esgotado</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          disabled={qty <= 0}
                          onClick={() => handleQtyDelta(prod, -1)}
                          aria-label={`Remover 1 ${prod.nome}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-6 text-center text-sm font-black">
                          {qty}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          disabled={outOfStock || atMax}
                          onClick={() => handleQtyDelta(prod, 1)}
                          aria-label={`Adicionar 1 ${prod.nome}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Resumo dos itens escolhidos */}
        {selectedItems.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-3 text-xs">
            <p className="mb-1.5 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              <ShoppingBag className="h-3.5 w-3.5" />
              Itens na venda
            </p>
            <ul className="flex flex-col gap-1">
              {selectedItems.map((item) => (
                <li
                  key={item.produto.id}
                  className="flex items-center justify-between"
                >
                  <span className="font-semibold text-[var(--foreground)]">
                    {item.quantidade}x {item.produto.nome}
                  </span>
                  <span className="font-bold">
                    {formatCurrency(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pagamentos (forma obrigatória, permite múltiplas formas) */}
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-extrabold">
              Forma(s) de pagamento{" "}
              <span className="text-[var(--destructive)]">*</span>
            </Label>
            {totalVenda > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPagamento}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar outra forma
              </Button>
            )}
          </div>

          {effectivePagamentos.map((pag, idx) => {
            const recebidoCentavos = parseCurrencyToCentavos(
              pag.dinheiroRecebidoInput
            );
            return (
              <div
                key={pag.id}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--muted-foreground)]">
                    Pagamento {idx + 1}
                  </span>
                  {effectivePagamentos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePagamento(pag.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--destructive)] hover:underline cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {FORMAS_PAGAMENTO_ORDEM.map((forma) => {
                    const active = pag.forma === forma;
                    return (
                      <button
                        key={forma}
                        type="button"
                        onClick={() => {
                          resetIdempotency();
                          setPagamentos((prev) =>
                            prev.map((item) =>
                              item.id === pag.id ? { ...item, forma } : item
                            )
                          );
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition cursor-pointer ${
                          active
                            ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                            : "border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
                        }`}
                      >
                        <FormaIcon forma={forma} />
                        {FORMA_PAGAMENTO_LABELS[forma]}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`balcao-valor-${pag.id}`} className="text-xs">
                    Valor desta forma (R$)
                  </Label>
                  <Input
                    id={`balcao-valor-${pag.id}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={pag.displayValorInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      resetIdempotency();
                      setPagamentos((prev) =>
                        prev.map((item) =>
                          item.id === pag.id
                            ? { ...item, valorInput: val, valorEdited: true }
                            : item
                        )
                      );
                    }}
                  />
                </div>

                {pag.forma === "DINHEIRO" && (
                  <div className="rounded-xl bg-[var(--brand-primary-soft)]/50 p-2.5">
                    <Label
                      htmlFor={`balcao-dinheiro-${pag.id}`}
                      className="text-xs"
                    >
                      Valor recebido em dinheiro (opcional — só para troco)
                    </Label>
                    <Input
                      id={`balcao-dinheiro-${pag.id}`}
                      inputMode="decimal"
                      placeholder="Ex: 50,00"
                      className="mt-1 bg-white"
                      value={pag.dinheiroRecebidoInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPagamentos((prev) =>
                          prev.map((item) =>
                            item.id === pag.id
                              ? { ...item, dinheiroRecebidoInput: val }
                              : item
                          )
                        );
                      }}
                    />
                    {recebidoCentavos !== null && pag.valorCentavos > 0 && (
                      <p className="mt-1 text-xs font-bold">
                        {recebidoCentavos >= pag.valorCentavos ? (
                          <span className="text-[var(--brand-primary-strong)]">
                            Troco:{" "}
                            {formatCurrency(
                              recebidoCentavos - pag.valorCentavos
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--destructive)]">
                            Falta:{" "}
                            {formatCurrency(
                              pag.valorCentavos - recebidoCentavos
                            )}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {totalVenda > 0 && diferenca !== 0 && (
            <p className="text-xs font-bold text-[var(--destructive)]">
              {diferenca > 0
                ? `Faltam ${formatCurrency(diferenca)} para completar o total da venda.`
                : `Os pagamentos excedem o total em ${formatCurrency(Math.abs(diferenca))}.`}
            </p>
          )}
        </div>

        {/* Opções da venda */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="balcao-cliente">Nome do cliente (opcional)</Label>
            <Input
              id="balcao-cliente"
              placeholder="Ex: Carlos / Balcão"
              value={nomeCliente}
              onChange={(e) => {
                setNomeCliente(e.target.value);
                resetIdempotency();
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="balcao-recebido-por">Recebido por (opcional)</Label>
            <Input
              id="balcao-recebido-por"
              placeholder="Nome de quem cobrou"
              value={recebidoPor}
              onChange={(e) => handleRecebidoPorChange(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="balcao-obs">Observação (opcional)</Label>
          <Input
            id="balcao-obs"
            placeholder="Ex: Sem cebola, copo com gelo e limão..."
            value={observacao}
            onChange={(e) => {
              setObservacao(e.target.value);
              resetIdempotency();
            }}
          />
        </div>

        <label className="flex items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={enviarCozinha}
            onChange={(e) => {
              setEnviarCozinha(e.target.checked);
              resetIdempotency();
            }}
            className="h-4 w-4 accent-[var(--brand-primary-strong)]"
          />
          <span>
            Enviar para a cozinha{" "}
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              (desmarcado = já sai entregue na hora, sem entrar na fila)
            </span>
          </span>
        </label>
      </form>
    </Dialog>
  );
}
