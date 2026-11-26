import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const mesasCount = await prisma.mesa.count();
  if (mesasCount === 0) {
    await prisma.mesa.createMany({
      data: Array.from({ length: 10 }, (_, idx) => ({
        numero: idx + 1,
        ativa: true,
      })),
    });
    console.log("Mesas 1 a 10 criadas.");
  } else {
    console.log("Mesas já existem — seed ignorado.");
  }

  const produtosCount = await prisma.produto.count();
  if (produtosCount === 0) {
    // Preços iniciais provisórios (em centavos) para ajuste posterior no /admin
    await prisma.produto.createMany({
      data: [
        {
          nome: "Cerveja Long Neck",
          descricao: "Bem gelada (330ml / 355ml)",
          preco: 1400,
          ativo: true,
          ordem: 1,
          controlaEstoque: true,
          estoque: 24,
          estoqueMinimo: 6,
        },
        {
          nome: "Cerveja Lata",
          descricao: "Lata 350ml trincando",
          preco: 900,
          ativo: true,
          ordem: 2,
          controlaEstoque: true,
          estoque: 30,
          estoqueMinimo: 8,
        },
        {
          nome: "Água Mineral sem Gás",
          descricao: "Garrafa 500ml",
          preco: 500,
          ativo: true,
          ordem: 3,
          controlaEstoque: true,
          estoque: 30,
          estoqueMinimo: 6,
        },
        {
          nome: "Água Mineral com Gás",
          descricao: "Garrafa 500ml",
          preco: 600,
          ativo: true,
          ordem: 4,
          controlaEstoque: true,
          estoque: 20,
          estoqueMinimo: 5,
        },
        {
          nome: "Água de Coco",
          descricao: "Natural e gelada",
          preco: 1000,
          ativo: true,
          ordem: 5,
          controlaEstoque: true,
          estoque: 15,
          estoqueMinimo: 4,
        },
        {
          nome: "Cachorro-Quente",
          descricao: "Pão macio, salsicha, molho especial e batata palha",
          preco: 1800,
          ativo: true,
          ordem: 6,
          controlaEstoque: false,
          estoque: 0,
          estoqueMinimo: 5,
        },
        {
          nome: "Batata Frita",
          descricao: "Porção crocante individual com sal e orégano",
          preco: 2200,
          ativo: true,
          ordem: 7,
          controlaEstoque: false,
          estoque: 0,
          estoqueMinimo: 5,
        },
      ],
    });
    console.log("Produtos iniciais criados (preços provisórios).");
  } else {
    console.log("Produtos já existem — seed ignorado.");
  }
}

main()
  .catch((error) => {
    console.error("Erro ao rodar seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
