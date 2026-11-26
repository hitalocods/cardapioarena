import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { type CardapioProduto } from "@/components/cardapio/cardapio-client";
import { HomeWelcomeClient } from "@/components/cardapio/home-welcome-client";

async function HomeLoader() {
  await connection();

  let produtos: CardapioProduto[] = [];
  let loadError = false;

  try {
    produtos = await db.produto.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        categoria: true,
        descricao: true,
        preco: true,
        foto: true,
        ordem: true,
        controlaEstoque: true,
        estoque: true,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar cardápio inicial:", error);
    loadError = true;
  }

  return (
    <HomeWelcomeClient initialProdutos={produtos} loadError={loadError} />
  );
}

function HomeSkeleton() {
  return (
    <div className="arena-grid grid min-h-dvh place-items-center p-4">
      <div className="glass-card h-96 w-full max-w-md animate-pulse p-8 sm:max-w-lg" />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeLoader />
    </Suspense>
  );
}
