import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FALHA NO TESTE: ${message}`);
  }
}

async function postOrder(payload: {
  idempotencyKey: string;
  nomeCliente: string;
  telefone: string;
  mesaNumero: number;
  itens: Array<{ produtoId: string; quantidade: number }>;
  ipHeader: string;
}) {
  const res = await fetch(`${BASE_URL}/api/pedidos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": payload.ipHeader,
    },
    body: JSON.stringify({
      idempotencyKey: payload.idempotencyKey,
      nomeCliente: payload.nomeCliente,
      telefone: payload.telefone,
      mesaNumero: payload.mesaNumero,
      itens: payload.itens,
    }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log(`Testando concorrência contra ${BASE_URL}...`);

  const suffix = crypto.randomBytes(4).toString("hex");
  const baseMesa = 9100 + Math.floor(Math.random() * 700);
  const testMesaNumbers = [
    baseMesa + 1,
    baseMesa + 2,
    baseMesa + 3,
    baseMesa + 4,
    baseMesa + 5,
  ];

  await prisma.mesa.createMany({
    data: testMesaNumbers.map((numero) => ({ numero, ativa: true })),
  });

  const prod30 = await prisma.produto.create({
    data: {
      nome: `__TEST_PROD_10_${suffix}`,
      descricao: "Produto de teste (estoque 10)",
      preco: 1000,
      ativo: true,
      ordem: 998,
      controlaEstoque: true,
      estoque: 10,
      estoqueMinimo: 2,
    },
  });

  const prodLast = await prisma.produto.create({
    data: {
      nome: `__TEST_PROD_LAST_${suffix}`,
      descricao: "Produto de teste (última unidade)",
      preco: 1500,
      ativo: true,
      ordem: 999,
      controlaEstoque: true,
      estoque: 1,
      estoqueMinimo: 1,
    },
  });

  const createdKeys: string[] = [];

  try {
    // ------------------------------------------------------------------
    // 1) 30 envios simultâneos com o MESMO idempotencyKey -> zero duplicatas
    // ------------------------------------------------------------------
    const sameKey = crypto.randomUUID();
    createdKeys.push(sameKey);

    const sameKeyResults = await Promise.all(
      Array.from({ length: 30 }, () =>
        postOrder({
          idempotencyKey: sameKey,
          nomeCliente: "Teste Idempotência",
          telefone: "11999990000",
          mesaNumero: testMesaNumbers[0],
          itens: [{ produtoId: prod30.id, quantidade: 2 }],
          ipHeader: "198.51.100.1",
        })
      )
    );

    const okSame = sameKeyResults.filter(
      (r) => r.status === 200 || r.status === 201
    );
    assert(
      okSame.length === 30,
      `Esperava 30 respostas 200/201 para mesma idempotencyKey, recebeu ${okSame.length}`
    );

    const uniqueIds = new Set(okSame.map((r) => r.body?.pedido?.id));
    assert(
      uniqueIds.size === 1,
      `Esperava exatamente 1 pedido único, recebeu ${uniqueIds.size}`
    );

    const countSameInDb = await prisma.pedido.count({
      where: { idempotencyKey: sameKey },
    });
    assert(
      countSameInDb === 1,
      `Esperava 1 linha no banco para sameKey, encontrou ${countSameInDb}`
    );

    const afterSameProd = await prisma.produto.findUniqueOrThrow({
      where: { id: prod30.id },
    });
    assert(
      afterSameProd.estoque === 8,
      `Esperava estoque = 8 após 1 pedido de 2 un., encontrou ${afterSameProd.estoque}`
    );
    console.log(
      "PASS 1: 30 envios simultâneos com mesma idempotencyKey -> 1 pedido, estoque = 8."
    );

    // ------------------------------------------------------------------
    // 2) 30 envios simultâneos com idempotencyKeys DISTINTAS contra estoque = 8
    // Distribuídos entre 5 mesas temporárias (6 por mesa) para ficar abaixo do limite de 8/mesa
    // ------------------------------------------------------------------
    const distinctKeys = Array.from({ length: 30 }, () => crypto.randomUUID());
    createdKeys.push(...distinctKeys);

    const raceResults = await Promise.all(
      distinctKeys.map((key, idx) =>
        postOrder({
          idempotencyKey: key,
          nomeCliente: `Cliente ${idx + 1}`,
          telefone: `1198888${String(1000 + idx).padStart(4, "0")}`,
          mesaNumero: testMesaNumbers[idx % testMesaNumbers.length],
          itens: [{ produtoId: prod30.id, quantidade: 1 }],
          ipHeader: `198.51.100.${10 + idx}`,
        })
      )
    );

    const succeeded = raceResults.filter((r) => r.status === 201);
    const conflict = raceResults.filter((r) => r.status === 409);

    assert(
      succeeded.length === 8,
      `Esperava exatamente 8 pedidos aprovados (201), recebeu ${succeeded.length}`
    );
    assert(
      conflict.length === 22,
      `Esperava exatamente 22 bloqueados por estoque (409), recebeu ${conflict.length}`
    );

    const finalProd30 = await prisma.produto.findUniqueOrThrow({
      where: { id: prod30.id },
    });
    assert(
      finalProd30.estoque === 0,
      `Estoque final deveria ser 0 (nunca negativo), encontrou ${finalProd30.estoque}`
    );
    console.log(
      "PASS 2: 30 envios simultâneos distintos para 8 unidades -> 8 aprovados (201), 22 esgotados (409), estoque = 0."
    );

    // ------------------------------------------------------------------
    // 3) 2 clientes simultâneos disputando a ÚLTIMA unidade do mesmo item
    // ------------------------------------------------------------------
    const lastKeyA = crypto.randomUUID();
    const lastKeyB = crypto.randomUUID();
    createdKeys.push(lastKeyA, lastKeyB);

    const [resA, resB] = await Promise.all([
      postOrder({
        idempotencyKey: lastKeyA,
        nomeCliente: "Cliente A",
        telefone: "11977770001",
        mesaNumero: testMesaNumbers[1],
        itens: [{ produtoId: prodLast.id, quantidade: 1 }],
        ipHeader: "198.51.100.201",
      }),
      postOrder({
        idempotencyKey: lastKeyB,
        nomeCliente: "Cliente B",
        telefone: "11977770002",
        mesaNumero: testMesaNumbers[2],
        itens: [{ produtoId: prodLast.id, quantidade: 1 }],
        ipHeader: "198.51.100.202",
      }),
    ]);

    const lastStatuses = [resA.status, resB.status].sort();
    assert(
      lastStatuses[0] === 201 && lastStatuses[1] === 409,
      `Esperava [201, 409] na disputa da última unidade, recebeu [${lastStatuses.join(", ")}]`
    );

    const loser = resA.status === 409 ? resA : resB;
    assert(
      Array.isArray(loser.body?.itensEsgotados) &&
        loser.body.itensEsgotados.some(
          (i: { produtoId: string }) => i.produtoId === prodLast.id
        ),
      "Resposta 409 deveria listar o item esgotado em itensEsgotados"
    );

    const finalProdLast = await prisma.produto.findUniqueOrThrow({
      where: { id: prodLast.id },
    });
    assert(
      finalProdLast.estoque === 0,
      `Estoque do item de última unidade deveria ser 0, encontrou ${finalProdLast.estoque}`
    );
    console.log(
      "PASS 3: 2 clientes disputando a última unidade -> 1 aprovado (201), 1 bloqueado (409), estoque = 0."
    );
    console.log("\nTODOS OS TESTES DE CONCORRÊNCIA PASSARAM!");
  } finally {
    await prisma.pedido.deleteMany({
      where: { idempotencyKey: { in: createdKeys } },
    });
    await prisma.produto.deleteMany({
      where: { id: { in: [prod30.id, prodLast.id] } },
    });
    await prisma.mesa.deleteMany({
      where: { numero: { in: testMesaNumbers } },
    });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
