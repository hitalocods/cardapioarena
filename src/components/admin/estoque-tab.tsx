"use client";

import * as React from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export interface EstoqueProdutoRow {
  id: string;
  nome: string;
  categoria: string;
  foto: string | null;
  ativo: boolean;
  ordem: number;
  controlaEstoque: boolean;
  estoque: number;
  estoqueMinimo: number;
  emAbertoHoje: number;
  entreguesHoje: number;
  vendidosHoje: number;
}

type FilterMode = "todos" | "controlados" | "alertas";

export function EstoqueTab({
  onAlertsChange,
}: {
  onAlertsChange?: (count: number) => void;
}) {
  const [produtos, setProdutos] = React.useState<EstoqueProdutoRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [mode, setMode] = React.useState<FilterMode>("todos");
  const [categoria, setCategoria] = React.useState<string>("Todas");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [draftEstoque, setDraftEstoque] = React.useState<
    Record<string, string>
  >({});
  const [draftMinimo, setDraftMinimo] = React.useState<Record<string, string>>(
    {}
  );

  const syncDrafts = React.useCallback((list: EstoqueProdutoRow[]) => {
    const est: Record<string, string> = {};
    const min: Record<string, string> = {};
    for (const p of list) {
      est[p.id] = String(p.estoque);
      min[p.id] = String(p.estoqueMinimo);
    }
    setDraftEstoque(est);
    setDraftMinimo(min);
  }, []);

  const fetchEstoque = React.useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const res = await fetch("/api/admin/estoque", { cache: "no-store" });
        if (!res.ok) {
          setError("Não foi possível carregar o estoque.");
          return;
        }
        const data = (await res.json()) as { produtos: EstoqueProdutoRow[] };
        setProdutos(data.produtos);
        syncDrafts(data.produtos);
        const alerts = data.produtos.filter(
          (p) =>
            p.ativo &&
            p.controlaEstoque &&
            (p.estoque <= 0 || p.estoque <= p.estoqueMinimo)
        ).length;
        onAlertsChange?.(alerts);
        setError(null);
      } catch {
        setError("Erro de conexão ao carregar estoque.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onAlertsChange, syncDrafts]
  );

  React.useEffect(() => {
    let active = true;
    const load = () => {
      if (!active) return;
      void fetchEstoque(false);
    };
    const timer = window.setTimeout(load, 0);
    const interval = window.setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchEstoque]);

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

  const stats = React.useMemo(() => {
    const controlados = produtos.filter((p) => p.controlaEstoque);
    const esgotados = controlados.filter((p) => p.ativo && p.estoque <= 0);
    const baixos = controlados.filter(
      (p) => p.ativo && p.estoque > 0 && p.estoque <= p.estoqueMinimo
    );
    const entreguesHoje = produtos.reduce((s, p) => s + p.entreguesHoje, 0);
    return {
      controlados: controlados.length,
      esgotados: esgotados.length,
      baixos: baixos.length,
      entreguesHoje,
    };
  }, [produtos]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return produtos.filter((p) => {
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      if (categoria !== "Todas" && (p.categoria || "Geral") !== categoria) {
        return false;
      }
      if (mode === "controlados" && !p.controlaEstoque) return false;
      if (
        mode === "alertas" &&
        (!p.controlaEstoque || (p.estoque > 0 && p.estoque > p.estoqueMinimo))
      ) {
        return false;
      }
      return true;
    });
  }, [produtos, search, categoria, mode]);

  const handleToggleControla = async (item: EstoqueProdutoRow) => {
    if (busyId) return;
    setBusyId(item.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/produtos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlaEstoque: !item.controlaEstoque }),
      });
      if (res.ok) {
        await fetchEstoque(false);
        setFeedback(
          !item.controlaEstoque
            ? `Controle de estoque ativado em "${item.nome}".`
            : `Controle de estoque desativado em "${item.nome}".`
        );
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickDelta = async (item: EstoqueProdutoRow, delta: number) => {
    if (busyId) return;
    setBusyId(item.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/produtos/${item.id}/estoque`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (res.ok) {
        await fetchEstoque(false);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveNumbers = async (item: EstoqueProdutoRow) => {
    if (busyId) return;
    const est = Math.max(
      0,
      Number.parseInt(draftEstoque[item.id] ?? String(item.estoque), 10) || 0
    );
    const min = Math.max(
      0,
      Number.parseInt(draftMinimo[item.id] ?? String(item.estoqueMinimo), 10) ||
        0
    );

    setBusyId(item.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/produtos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlaEstoque: true,
          estoque: est,
          estoqueMinimo: min,
        }),
      });
      if (res.ok) {
        await fetchEstoque(false);
        setFeedback(`Estoque de "${item.nome}" salvo (${est} un.).`);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--foreground)]">
            Cadastro e Controle de Estoque
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Integrado aos pedidos em tempo real: reserva na saída do pedido,
            registra entregas e devolve automaticamente se cancelar.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchEstoque(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </div>

      {/* KPIs de estoque */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Controlados
          </p>
          <p className="mt-1 text-2xl font-black text-[var(--foreground)]">
            {stats.controlados}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Esgotados
          </p>
          <p className="mt-1 text-2xl font-black text-[var(--destructive)]">
            {stats.esgotados}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Estoque baixo
          </p>
          <p className="mt-1 text-2xl font-black text-amber-600">
            {stats.baixos}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Entregues hoje
          </p>
          <p className="mt-1 text-2xl font-black text-[var(--brand-primary-strong)]">
            {stats.entreguesHoje} un.
          </p>
        </div>
      </div>

      {/* Busca + Filtros */}
      <div className="glass-card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item no estoque..."
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { value: "todos", label: "Todos" },
                { value: "controlados", label: "Só controlados" },
                { value: "alertas", label: "Baixo / Esgotado" },
              ] as Array<{ value: FilterMode; label: string }>
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`rounded-full border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  mode === opt.value
                    ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                    : "border-[var(--border)] bg-white/80 text-[var(--muted-foreground)] hover:bg-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {categorias.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {["Todas", ...categorias].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoria(cat)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  categoria === cat
                    ? "border-[var(--brand-primary-strong)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary-foreground)]"
                    : "border-[var(--border)] bg-white/70 text-[var(--muted-foreground)] hover:bg-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-medium text-[var(--status-cancelado-fg)]">
          {error}
        </div>
      )}

      {feedback && (
        <div className="rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand-primary-foreground)]">
          {feedback}
        </div>
      )}

      {/* Lista de itens */}
      {loading ? (
        <div className="glass-card h-56 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Boxes className="mx-auto h-10 w-10 text-[var(--muted-foreground)]" />
          <p className="mt-2 font-semibold">
            Nenhum item encontrado com esses filtros.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const isOut = item.controlaEstoque && item.estoque <= 0;
            const isLow =
              item.controlaEstoque &&
              item.estoque > 0 &&
              item.estoque <= item.estoqueMinimo;
            const estDraft = draftEstoque[item.id] ?? String(item.estoque);
            const minDraft =
              draftMinimo[item.id] ?? String(item.estoqueMinimo);
            const dirty =
              estDraft !== String(item.estoque) ||
              minDraft !== String(item.estoqueMinimo);

            return (
              <div
                key={item.id}
                className={`glass-card flex flex-col gap-3 p-4 ${
                  !item.ativo ? "opacity-65" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#a2cf9c]/60 bg-gradient-to-br from-[#eaf5e8] to-[#a2cf9c]/75">
                      {item.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.foto}
                          alt={item.nome}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#142614]">
                          <Package className="h-5 w-5 opacity-75" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-base font-bold text-[var(--foreground)]">
                          {item.nome}
                        </h3>
                        <Badge variant="secondary">{item.categoria}</Badge>
                        {!item.controlaEstoque && (
                          <Badge variant="outline">Sem controle</Badge>
                        )}
                        {isOut && <Badge variant="destructive">Esgotado</Badge>}
                        {isLow && (
                          <Badge variant="warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Baixo
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Pedidos abertos hoje:{" "}
                        <strong className="text-[var(--foreground)]">
                          {item.emAbertoHoje} un.
                        </strong>{" "}
                        · Entregues hoje:{" "}
                        <strong className="text-[var(--brand-primary-strong)]">
                          {item.entreguesHoje} un.
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                      Controlar estoque
                    </span>
                    <Switch
                      checked={item.controlaEstoque}
                      disabled={busyId === item.id}
                      onCheckedChange={() => void handleToggleControla(item)}
                      aria-label={`Controlar estoque de ${item.nome}`}
                    />
                  </div>
                </div>

                {item.controlaEstoque && (
                  <div className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-subtle)] p-3 border border-[var(--border)] sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-wrap items-end gap-2.5">
                      <div>
                        <label
                          htmlFor={`est-${item.id}`}
                          className="block text-[11px] font-bold text-[var(--muted-foreground)]"
                        >
                          Quantidade atual
                        </label>
                        <Input
                          id={`est-${item.id}`}
                          type="number"
                          min={0}
                          max={99999}
                          value={estDraft}
                          onChange={(e) =>
                            setDraftEstoque((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="mt-1 h-10 w-24 text-center font-bold"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`min-${item.id}`}
                          className="block text-[11px] font-bold text-[var(--muted-foreground)]"
                        >
                          Mínimo alerta
                        </label>
                        <Input
                          id={`min-${item.id}`}
                          type="number"
                          min={0}
                          max={99999}
                          value={minDraft}
                          onChange={(e) =>
                            setDraftMinimo((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="mt-1 h-10 w-24 text-center font-bold"
                        />
                      </div>

                      <Button
                        size="sm"
                        disabled={busyId === item.id || !dirty}
                        onClick={() => void handleSaveNumbers(item)}
                        className="h-10"
                      >
                        <Check className="h-4 w-4" />
                        Salvar
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {[-1, 1, 6, 12, 24].map((delta) => (
                        <Button
                          key={delta}
                          variant="outline"
                          size="sm"
                          disabled={
                            busyId === item.id ||
                            (delta < 0 && item.estoque <= 0)
                          }
                          onClick={() => void handleQuickDelta(item, delta)}
                          className="h-9 px-3 font-bold"
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
