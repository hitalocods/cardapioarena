import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toPublicPedidoDTO } from "@/lib/orders";
import { PedidoTracker } from "@/components/pedido/pedido-tracker";
import { Button } from "@/components/ui/button";

async function PedidoLoader({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  if (!id || id.length > 64) {
    notFound();
  }

  let pedido = null;
  try {
    pedido = await db.pedido.findUnique({
      where: { id },
      include: { itens: true },
    });
  } catch (error) {
    console.error("Erro ao carregar pedido:", error);
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="glass-card p-6">
          <p className="font-bold">Erro ao consultar o pedido</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Tente atualizar a página em instantes.
          </p>
          <Link href="/" className="mt-4 inline-block">
            <Button>Voltar ao cardápio</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!pedido) {
    notFound();
  }

  return <PedidoTracker initialPedido={toPublicPedidoDTO(pedido)} />;
}

export default function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6">
          <div className="glass-card h-72 animate-pulse p-6" />
          <div className="glass-card h-44 animate-pulse p-6" />
        </div>
      }
    >
      <PedidoLoader params={params} />
    </Suspense>
  );
}
