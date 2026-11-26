"use client";

import * as React from "react";
import {
  AlertTriangle,
  Edit3,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import {
  formatCentavosInput,
  formatCurrency,
  parseCurrencyToCentavos,
} from "@/lib/format";

export interface AdminProduto {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  foto: string | null;
  ativo: boolean;
  ordem: number;
  controlaEstoque: boolean;
  estoque: number;
  estoqueMinimo: number;
}

interface ProdutoFormState {
  nome: string;
  descricao: string;
  precoTexto: string;
  foto: string;
  ativo: boolean;
  ordem: string;
  controlaEstoque: boolean;
  estoque: string;
  estoqueMinimo: string;
}

const EMPTY_FORM: ProdutoFormState = {
  nome: "",
  descricao: "",
  precoTexto: "",
  foto: "",
  ativo: true,
  ordem: "0",
  controlaEstoque: true,
  estoque: "10",
  estoqueMinimo: "5",
};

export function ProdutosTab() {
  const [produtos, setProdutos] = React.useState<AdminProduto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [stockDrafts, setStockDrafts] = React.useState<Record<string, string>>(
    {}
  );
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ProdutoFormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const loadProdutos = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/produtos", { cache: "no-store" });
      if (!res.ok) {
        setError("Não foi possível carregar os produtos.");
        return;
      }
      const data = (await res.json()) as { produtos: AdminProduto[] };
      setProdutos(data.produtos);
      const drafts: Record<string, string> = {};
      for (const p of data.produtos) {
        drafts[p.id] = String(p.estoque);
      }
      setStockDrafts(drafts);
      setError(null);
    } catch {
      setError("Erro de conexão ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin/produtos", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setError("Não foi possível carregar os produtos.");
          return;
        }
        const data = (await res.json()) as { produtos: AdminProduto[] };
        if (!active) return;
        setProdutos(data.produtos);
        const drafts: Record<string, string> = {};
        for (const p of data.produtos) {
          drafts[p.id] = String(p.estoque);
        }
        setStockDrafts(drafts);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Erro de conexão ao carregar produtos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const lowStockItems = React.useMemo(
    () =>
      produtos.filter(
        (p) =>
          p.ativo &&
          p.controlaEstoque &&
          (p.estoque === 0 || p.estoque <= p.estoqueMinimo)
      ),
    [produtos]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      ordem: String(produtos.length + 1),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (p: AdminProduto) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      descricao: p.descricao,
      precoTexto: formatCentavosInput(p.preco),
      foto: p.foto ?? "",
      ativo: p.ativo,
      ordem: String(p.ordem),
      controlaEstoque: p.controlaEstoque,
      estoque: String(p.estoque),
      estoqueMinimo: String(p.estoqueMinimo),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Falha no upload da imagem.");
        return;
      }
      setForm((prev) => ({ ...prev, foto: data.url }));
    } catch {
      setFormError("Erro de conexão no upload da foto.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    const preco = parseCurrencyToCentavos(form.precoTexto);
    if (preco === null) {
      setFormError("Informe um preço válido (ex: 14,50).");
      return;
    }

    const ordem = Math.max(0, Number.parseInt(form.ordem || "0", 10) || 0);
    const estoque = Math.max(0, Number.parseInt(form.estoque || "0", 10) || 0);
    const estoqueMinimo = Math.max(
      0,
      Number.parseInt(form.estoqueMinimo || "0", 10) || 0
    );

    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/produtos/${editingId}`
        : "/api/admin/produtos";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          descricao: form.descricao.trim(),
          preco,
          foto: form.foto.trim() || null,
          ativo: form.ativo,
          ordem,
          controlaEstoque: form.controlaEstoque,
          estoque,
          estoqueMinimo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Erro ao salvar produto.");
        return;
      }

      setDialogOpen(false);
      await loadProdutos();
    } catch {
      setFormError("Falha de conexão ao salvar produto.");
    } finally {
      setSaving(false);
    }
  };

  const handleStockUpdate = async (
    produtoId: string,
    payload: { delta: number } | { estoque: number }
  ) => {
    if (busyId) return;
    setBusyId(produtoId);
    try {
      const res = await fetch(`/api/admin/produtos/${produtoId}/estoque`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { produto: AdminProduto };
        setProdutos((prev) =>
          prev.map((p) => (p.id === produtoId ? data.produto : p))
        );
        setStockDrafts((prev) => ({
          ...prev,
          [produtoId]: String(data.produto.estoque),
        }));
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAtivo = async (p: AdminProduto) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/produtos/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !p.ativo }),
      });
      if (res.ok) {
        await loadProdutos();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (p: AdminProduto) => {
    if (!window.confirm(`Excluir "${p.nome}" do cardápio?`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/produtos/${p.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadProdutos();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--foreground)]">
            Produtos e Estoque
          </h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Itens com estoque 0 ficam automaticamente como &ldquo;Esgotado&rdquo;
            no cardápio.
          </p>
        </div>
        <Button size="lg" onClick={openCreate}>
          <Plus className="h-5 w-5" />
          Novo produto
        </Button>
      </div>

      {/* Alerta de estoque baixo */}
      {lowStockItems.length > 0 && (
        <div className="rounded-[1.5rem] border border-amber-300 bg-[var(--status-preparando-bg)] p-4 text-[var(--status-preparando-fg)] shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Atenção: itens com estoque baixo</p>
              <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                {lowStockItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-full bg-white/75 px-3 py-0.5 font-semibold"
                  >
                    {item.nome}:{" "}
                    {item.estoque === 0 ? "ESGOTADO" : `${item.estoque} un.`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-medium text-[var(--status-cancelado-fg)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card h-48 animate-pulse" />
      ) : produtos.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="font-semibold">Nenhum produto cadastrado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {produtos.map((p) => {
            const isLow =
              p.controlaEstoque && p.estoque > 0 && p.estoque <= p.estoqueMinimo;
            const isOut = p.controlaEstoque && p.estoque === 0;
            const draftVal = stockDrafts[p.id] ?? String(p.estoque);
            const parsedDraft = Number.parseInt(draftVal, 10);
            const draftChanged =
              Number.isFinite(parsedDraft) && parsedDraft !== p.estoque;

            return (
              <div
                key={p.id}
                className={`glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                  !p.ativo ? "opacity-65" : ""
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)]">
                    {p.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.foto}
                        alt={p.nome}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--brand-primary-strong)]">
                        <UtensilsCrossed className="h-6 w-6 opacity-60" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-[var(--muted-foreground)]">
                        #{p.ordem}
                      </span>
                      <h3 className="text-base font-bold text-[var(--foreground)]">
                        {p.nome}
                      </h3>
                      {!p.ativo && <Badge variant="outline">Inativo</Badge>}
                      {isOut && <Badge variant="destructive">Esgotado</Badge>}
                      {isLow && <Badge variant="warning">Estoque baixo</Badge>}
                    </div>
                    {p.descricao && (
                      <p className="truncate text-xs text-[var(--muted-foreground)]">
                        {p.descricao}
                      </p>
                    )}
                    <p className="mt-1 text-base font-extrabold text-[var(--brand-primary-strong)]">
                      {formatCurrency(p.preco)}
                    </p>
                  </div>
                </div>

                {/* Controles rápidos */}
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  {p.controlaEstoque && (
                    <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--surface-subtle)] p-1.5 border border-[var(--border)]">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={busyId === p.id || p.estoque <= 0}
                        onClick={() => void handleStockUpdate(p.id, { delta: -1 })}
                        aria-label={`Diminuir estoque de ${p.nome}`}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        max={99999}
                        value={draftVal}
                        onChange={(e) =>
                          setStockDrafts((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          if (
                            Number.isFinite(parsedDraft) &&
                            parsedDraft >= 0 &&
                            parsedDraft !== p.estoque
                          ) {
                            void handleStockUpdate(p.id, {
                              estoque: parsedDraft,
                            });
                          }
                        }}
                        aria-label={`Estoque de ${p.nome}`}
                        className="h-10 w-20 rounded-xl text-center font-bold px-2"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={busyId === p.id}
                        onClick={() => void handleStockUpdate(p.id, { delta: 1 })}
                        aria-label={`Aumentar estoque de ${p.nome}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      {draftChanged && (
                        <Button
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() =>
                            void handleStockUpdate(p.id, {
                              estoque: Math.max(0, parsedDraft),
                            })
                          }
                        >
                          OK
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.ativo}
                      disabled={busyId === p.id}
                      onCheckedChange={() => void handleToggleAtivo(p)}
                      aria-label={`Ativar ou desativar ${p.nome}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEdit(p)}
                      aria-label={`Editar ${p.nome}`}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={busyId === p.id}
                      onClick={() => void handleDelete(p)}
                      aria-label={`Excluir ${p.nome}`}
                      className="text-[var(--destructive)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
        title={editingId ? "Editar produto" : "Novo produto"}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prod-nome">Nome</Label>
            <Input
              id="prod-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Cerveja Long Neck"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prod-desc">Descrição</Label>
            <Textarea
              id="prod-desc"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex: Bem gelada 330ml"
              maxLength={240}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-preco">Preço (R$)</Label>
              <Input
                id="prod-preco"
                inputMode="decimal"
                value={form.precoTexto}
                onChange={(e) =>
                  setForm({ ...form, precoTexto: e.target.value })
                }
                placeholder="14,00"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-ordem">Ordem</Label>
              <Input
                id="prod-ordem"
                type="number"
                min={0}
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: e.target.value })}
              />
            </div>
          </div>

          {/* Foto (Vercel Blob) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="prod-foto-url">Foto do produto</Label>
            <div className="flex items-center gap-2">
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm font-semibold hover:bg-[var(--surface-subtle)]">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {uploading ? "Enviando..." : "Enviar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => void handleUploadImage(e)}
                />
              </label>
              <Input
                id="prod-foto-url"
                value={form.foto}
                onChange={(e) => setForm({ ...form, foto: e.target.value })}
                placeholder="ou cole a URL da imagem"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-subtle)] px-4 py-3">
            <Label htmlFor="prod-ativo">Visível no cardápio</Label>
            <Switch
              id="prod-ativo"
              checked={form.ativo}
              onCheckedChange={(checked) =>
                setForm({ ...form, ativo: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-subtle)] px-4 py-3">
            <Label htmlFor="prod-controla">Controlar estoque</Label>
            <Switch
              id="prod-controla"
              checked={form.controlaEstoque}
              onCheckedChange={(checked) =>
                setForm({ ...form, controlaEstoque: checked })
              }
            />
          </div>

          {form.controlaEstoque && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prod-estoque">Quantidade atual</Label>
                <Input
                  id="prod-estoque"
                  type="number"
                  min={0}
                  value={form.estoque}
                  onChange={(e) =>
                    setForm({ ...form, estoque: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prod-min">Avisar quando chegar a</Label>
                <Input
                  id="prod-min"
                  type="number"
                  min={0}
                  value={form.estoqueMinimo}
                  onChange={(e) =>
                    setForm({ ...form, estoqueMinimo: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {formError && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-medium text-[var(--status-cancelado-fg)]">
              {formError}
            </div>
          )}

          <Button type="submit" size="lg" disabled={saving || uploading}>
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar produto"
            )}
          </Button>
        </form>
      </Dialog>
    </section>
  );
}
