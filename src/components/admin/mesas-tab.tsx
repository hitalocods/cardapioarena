"use client";

import * as React from "react";
import { Loader2, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export interface AdminMesa {
  id: string;
  numero: number;
  ativa: boolean;
}

export function MesasTab() {
  const [mesas, setMesas] = React.useState<AdminMesa[]>([]);
  const [quantidadeInput, setQuantidadeInput] = React.useState("10");
  const [loading, setLoading] = React.useState(true);
  const [savingQty, setSavingQty] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin/mesas", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setError("Não foi possível carregar as mesas.");
          return;
        }
        const data = (await res.json()) as { mesas: AdminMesa[] };
        if (!active) return;
        setMesas(data.mesas);
        const highestActive = data.mesas
          .filter((m) => m.ativa)
          .reduce((max, m) => Math.max(max, m.numero), 0);
        setQuantidadeInput(String(highestActive || data.mesas.length || 10));
        setError(null);
      })
      .catch(() => {
        if (active) setError("Erro de conexão ao carregar mesas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleApplyQuantidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingQty) return;
    const qtd = Number.parseInt(quantidadeInput, 10);
    if (!Number.isFinite(qtd) || qtd < 0 || qtd > 200) {
      setError("Informe uma quantidade entre 0 e 200 mesas.");
      return;
    }

    setSavingQty(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mesas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: qtd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao atualizar mesas.");
        return;
      }
      setMesas(data.mesas);
    } catch {
      setError("Falha de conexão ao salvar mesas.");
    } finally {
      setSavingQty(false);
    }
  };

  const handleToggleMesa = async (mesa: AdminMesa) => {
    if (busyId) return;
    setBusyId(mesa.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/mesas/${mesa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativa: !mesa.ativa }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao alterar mesa.");
        return;
      }
      setMesas((prev) =>
        prev.map((m) => (m.id === mesa.id ? data.mesa : m))
      );
    } catch {
      setError("Falha de conexão ao alterar mesa.");
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = mesas.filter((m) => m.ativa).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="glass-card p-5">
        <h2 className="text-xl font-extrabold text-[var(--foreground)]">
          Mesas ({activeCount} ativas)
        </h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Defina a quantidade de mesas de 1 até N. Mesas acima de N são apenas
          desativadas, preservando o histórico de pedidos antigos.
        </p>

        <form
          onSubmit={handleApplyQuantidade}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qtd-mesas">Quantidade de mesas</Label>
            <Input
              id="qtd-mesas"
              type="number"
              inputMode="numeric"
              min={0}
              max={200}
              value={quantidadeInput}
              onChange={(e) => setQuantidadeInput(e.target.value)}
              className="w-full sm:w-40"
              required
            />
          </div>
          <Button type="submit" disabled={savingQty}>
            {savingQty && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar quantidade
          </Button>
        </form>
      </div>

      {error && (
        <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-medium text-[var(--status-cancelado-fg)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card h-40 animate-pulse" />
      ) : mesas.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="font-semibold">Nenhuma mesa cadastrada.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mesas.map((mesa) => (
            <div
              key={mesa.id}
              className={`glass-card flex items-center justify-between gap-3 p-4 ${
                !mesa.ativa ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TableProperties className="h-5 w-5 text-[var(--brand-primary-strong)]" />
                <div>
                  <p className="text-base font-extrabold text-[var(--foreground)]">
                    Mesa {mesa.numero}
                  </p>
                  <Badge
                    variant={mesa.ativa ? "default" : "outline"}
                    className="mt-1"
                  >
                    {mesa.ativa ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </div>

              <Switch
                checked={mesa.ativa}
                disabled={busyId === mesa.id}
                onCheckedChange={() => void handleToggleMesa(mesa)}
                aria-label={`Ativar ou desativar Mesa ${mesa.numero}`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
