"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <div className="glass-card p-6 sm:p-8">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary-foreground)]">
          <Sun className="h-3.5 w-3.5 text-[var(--brand-primary-strong)]" />
          Arena Home Beach
        </div>

        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
          Painel do Bar / Admin
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Digite a senha de administrador para gerenciar pedidos e o cardápio.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha do painel</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-2xl bg-[var(--status-cancelado-bg)] px-4 py-3 text-sm font-medium text-[var(--status-cancelado-fg)]">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Entrando...
              </>
            ) : (
              <>
                <Lock className="h-5 w-5" />
                Entrar no painel
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
