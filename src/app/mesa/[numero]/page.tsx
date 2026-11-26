import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { QrCode, Sun } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { type CardapioProduto } from "@/components/cardapio/cardapio-client";
import { MesaFlowClient } from "@/components/cardapio/mesa-flow-client";

async function MesaLoader({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  await connection();
  const { numero: rawNumero } = await params;

  const isDigitsOnly = /^\d+$/.test(rawNumero);
  const numero = isDigitsOnly ? Number.parseInt(rawNumero, 10) : NaN;

  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 9999) {
    return <MesaNotFound />;
  }

  let mesa = null;
  let produtos: CardapioProduto[] = [];

  try {
    mesa = await db.mesa.findFirst({
      where: { numero, ativa: true },
      select: { id: true, numero: true },
    });

    if (mesa) {
      produtos = await db.produto.findMany({
        where: { ativo: true },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        select: {
          id: true,
          nome: true,
          descricao: true,
          preco: true,
          foto: true,
          ordem: true,
          controlaEstoque: true,
          estoque: true,
        },
      });
    }
  } catch (error) {
    console.error("Erro ao validar mesa:", error);
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
        <div className="glass-card p-6 text-center">
          <p className="font-bold text-[var(--foreground)]">
            Erro ao carregar a mesa
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Tente atualizar a página em alguns instantes.
          </p>
        </div>
      </div>
    );
  }

  if (!mesa) {
    return <MesaNotFound />;
  }

  return <MesaFlowClient mesaNumero={mesa.numero} initialProdutos={produtos} />;
}

function MesaNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="glass-card flex flex-col items-center p-8 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary-foreground)]">
          <Sun className="h-3.5 w-3.5 text-[var(--brand-primary-strong)]" />
          Arena Home Beach
        </div>
        <QrCode className="mt-5 h-12 w-12 text-[var(--muted-foreground)]" />
        <h1 className="mt-3 text-2xl font-extrabold text-[var(--foreground)]">
          Mesa não encontrada
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Este QR Code não corresponde a uma mesa ativa. Peça ajuda no bar da
          arena ou escaneie o código da sua mesa.
        </p>
        <Link href="/" className="mt-5 w-full">
          <Button variant="outline" size="lg" className="w-full">
            Ver cardápio
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function MesaPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
          <div className="glass-card h-72 animate-pulse p-6" />
        </div>
      }
    >
      <MesaLoader params={params} />
    </Suspense>
  );
}
