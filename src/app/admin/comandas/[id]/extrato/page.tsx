import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { loadComandaDetail } from "@/lib/comandas";
import { ExtratoComandaClient } from "@/components/admin/extrato-comanda-client";

async function ExtratoGate({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pessoa?: string }>;
}) {
  await connection();
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect("/admin/login");
  }

  const [{ id }, { pessoa }] = await Promise.all([params, searchParams]);
  const comanda = await loadComandaDetail(id);
  if (!comanda) {
    notFound();
  }

  return (
    <ExtratoComandaClient
      comanda={comanda}
      pessoaTelefone={pessoa?.trim() || undefined}
      emittedAtIso={new Date().toISOString()}
    />
  );
}

export default function ExtratoComandaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pessoa?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-6">
          <div className="glass-card h-96 animate-pulse" />
        </div>
      }
    >
      <ExtratoGate params={params} searchParams={searchParams} />
    </Suspense>
  );
}
