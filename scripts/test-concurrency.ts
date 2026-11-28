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

async function loginAs(
  password: string,
  expectedRole: "DONO" | "ATENDENTE"
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${expectedRole === "DONO" ? "250" : "251"}`,
    },
    body: JSON.stringify({ password }),
  });
  assert(
    res.status === 200,
    `Login ${expectedRole} falhou com status ${res.status}`
  );
  const body = (await res.json()) as { ok?: boolean; role?: string };
  assert(
    body.role === expectedRole,
    `Esperava role=${expectedRole} no login, recebeu ${body.role}`
  );

  const setCookie = res.headers.get("set-cookie");
  assert(setCookie, "Cookie de sessão admin não retornado no login.");
  const cookiePair = setCookie.split(";")[0];
  assert(
    cookiePair && cookiePair.startsWith("ahb_admin_session="),
    `Cookie inválido retornado no login: ${cookiePair}`
  );
  return cookiePair;
}

async function loginAdmin(): Promise<string> {
  const password = process.env.ADMIN_PASSWORD;
  assert(
    password && password.length > 0,
    "ADMIN_PASSWORD precisa estar definido no ambiente para testar rotas /api/admin/*"
  );
  return loginAs(password, "DONO");
}

async function postAdminPagamento(
  cookie: string,
  comandaId: string,
  payload: Record<string, unknown>
) {
  const res = await fetch(
    `${BASE_URL}/api/admin/comandas/${comandaId}/pagamentos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    }
  );
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
    baseMesa + 6,
    baseMesa + 7,
    baseMesa + 8,
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

  const prodUncontrolled = await prisma.produto.create({
    data: {
      nome: `__TEST_PROD_COMANDA_${suffix}`,
      descricao: "Produto sem controle de estoque para testes de comanda",
      preco: 1200,
      ativo: true,
      ordem: 1000,
      controlaEstoque: false,
      estoque: 0,
      estoqueMinimo: 1,
    },
  });

  const prodBalcao = await prisma.produto.create({
    data: {
      nome: `__TEST_PROD_BALCAO_${suffix}`,
      descricao: "Produto de teste para balcão (estoque 5)",
      preco: 1000,
      ativo: true,
      ordem: 1001,
      controlaEstoque: true,
      estoque: 5,
      estoqueMinimo: 1,
    },
  });

  const prodGarcom = await prisma.produto.create({
    data: {
      nome: `__TEST_PROD_GARCOM_${suffix}`,
      descricao: "Produto de teste para modo garçom (estoque 3)",
      preco: 1000,
      ativo: true,
      ordem: 1002,
      controlaEstoque: true,
      estoque: 3,
      estoqueMinimo: 1,
    },
  });

  const createdKeys: string[] = [];
  const createdBalcaoComandaIds: string[] = [];

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
    // ------------------------------------------------------------------
    const distinctKeys = Array.from({ length: 30 }, () => crypto.randomUUID());
    createdKeys.push(...distinctKeys);

    const raceResults = await Promise.all(
      distinctKeys.map((key, idx) =>
        postOrder({
          idempotencyKey: key,
          nomeCliente: `Cliente ${idx + 1}`,
          telefone: `1198888${String(1000 + idx).padStart(4, "0")}`,
          mesaNumero: testMesaNumbers[idx % 5],
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

    // ------------------------------------------------------------------
    // 4) 2 pedidos simultâneos numa mesa SEM comanda -> apenas 1 Comanda ABERTA criada
    // ------------------------------------------------------------------
    const mesaComanda = testMesaNumbers[5];
    const cmdKeyA = crypto.randomUUID();
    const cmdKeyB = crypto.randomUUID();
    createdKeys.push(cmdKeyA, cmdKeyB);

    const [cmdPedA, cmdPedB] = await Promise.all([
      postOrder({
        idempotencyKey: cmdKeyA,
        nomeCliente: "João",
        telefone: "11966660001",
        mesaNumero: mesaComanda,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 2 }], // 2400
        ipHeader: "198.51.100.211",
      }),
      postOrder({
        idempotencyKey: cmdKeyB,
        nomeCliente: "João",
        telefone: "11966660002", // mesmo nome, telefone diferente
        mesaNumero: mesaComanda,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 1 }], // 1200
        ipHeader: "198.51.100.212",
      }),
    ]);

    assert(
      cmdPedA.status === 201 && cmdPedB.status === 201,
      `Esperava [201, 201] ao abrir comanda simultaneamente, recebeu [${cmdPedA.status}, ${cmdPedB.status}]`
    );

    const comandasMesa = await prisma.comanda.findMany({
      where: { mesaNumero: mesaComanda, status: "ABERTA" },
      include: { pedidos: { include: { itens: true } } },
    });
    assert(
      comandasMesa.length === 1,
      `Esperava exatamente 1 comanda ABERTA para mesa ${mesaComanda}, encontrou ${comandasMesa.length}`
    );
    assert(
      comandasMesa[0]!.pedidos.length === 2,
      `Esperava 2 pedidos vinculados à comanda, encontrou ${comandasMesa[0]!.pedidos.length}`
    );
    console.log(
      "PASS 4: 2 pedidos simultâneos numa mesa sem comanda -> exatamente 1 comanda ABERTA criada e ambos vinculados."
    );

    // ------------------------------------------------------------------
    // 5) 2 baixas simultâneas do MESMO item com idempotencyKeys diferentes -> só 1 passa
    // ------------------------------------------------------------------
    const adminCookie = await loginAdmin();
    const comandaId = comandasMesa[0]!.id;
    const pedAId = cmdPedA.body.pedido.id as string;
    const targetItemId = cmdPedA.body.pedido.itens[0].id as string;

    const payRaceA = crypto.randomUUID();
    const payRaceB = crypto.randomUUID();

    const [payResA, payResB] = await Promise.all([
      postAdminPagamento(adminCookie, comandaId, {
        tipo: "ITENS",
        idempotencyKey: payRaceA,
        itemIds: [targetItemId],
        forma: "PIX",
      }),
      postAdminPagamento(adminCookie, comandaId, {
        tipo: "ITENS",
        idempotencyKey: payRaceB,
        itemIds: [targetItemId],
        forma: "CARTAO_DEBITO",
      }),
    ]);

    const payRaceStatuses = [payResA.status, payResB.status].sort();
    assert(
      payRaceStatuses[0] === 201 && payRaceStatuses[1] === 409,
      `Esperava [201, 409] em 2 baixas simultâneas do mesmo item, recebeu [${payRaceStatuses.join(", ")}]`
    );

    const pagItemWinnerCount = await prisma.pagamento.count({
      where: { idempotencyKey: { in: [payRaceA, payRaceB] } },
    });
    assert(
      pagItemWinnerCount === 1,
      `Esperava apenas 1 Pagamento no banco, encontrou ${pagItemWinnerCount}`
    );
    console.log(
      "PASS 5: 2 baixas simultâneas do mesmo item -> 1 aprovado (201), 1 bloqueado (409)."
    );

    // ------------------------------------------------------------------
    // 6) 10 baixas simultâneas com a MESMA idempotencyKey -> zero duplicidade
    // ------------------------------------------------------------------
    const repeatedPayKey = crypto.randomUUID();
    const repeatedPayResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        postAdminPagamento(adminCookie, comandaId, {
          tipo: "VALOR_LIVRE",
          idempotencyKey: repeatedPayKey,
          valor: 500,
          forma: "DINHEIRO",
          recebidoPor: "Caixa Teste",
        })
      )
    );

    const okRepeatedPays = repeatedPayResults.filter(
      (r) => r.status === 200 || r.status === 201
    );
    assert(
      okRepeatedPays.length === 10,
      `Esperava 10 respostas 200/201 para mesma idempotencyKey de pagamento, recebeu ${okRepeatedPays.length}`
    );

    const uniquePagIds = new Set(okRepeatedPays.map((r) => r.body?.pagamento?.id));
    assert(
      uniquePagIds.size === 1,
      `Esperava exatamente 1 pagamento único, recebeu ${uniquePagIds.size}`
    );
    console.log(
      "PASS 6: 10 baixas simultâneas com mesma idempotencyKey -> exatamente 1 pagamento criado."
    );

    // ------------------------------------------------------------------
    // 7) Validações de integridade Fase 1 (forma obrigatória, bloqueio cancelamento item pago, fechamento)
    // ------------------------------------------------------------------
    const semFormaRes = await postAdminPagamento(adminCookie, comandaId, {
      tipo: "VALOR_LIVRE",
      idempotencyKey: crypto.randomUUID(),
      valor: 100,
    });
    assert(
      semFormaRes.status === 400,
      `Pagamento sem forma deveria retornar 400, recebeu ${semFormaRes.status}`
    );

    const cancelPaidRes = await fetch(
      `${BASE_URL}/api/admin/pedidos/${pedAId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({ status: "CANCELADO" }),
      }
    );
    assert(
      cancelPaidRes.status === 409,
      `Cancelar pedido com item pago deveria retornar 409, recebeu ${cancelPaidRes.status}`
    );

    const fecharComSaldoRes = await fetch(
      `${BASE_URL}/api/admin/comandas/${comandaId}/fechar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({}),
      }
    );
    assert(
      fecharComSaldoRes.status === 409,
      `Fechar mesa com saldo > 0 sem motivo deveria retornar 409, recebeu ${fecharComSaldoRes.status}`
    );

    // Quitar o saldo restante (3600 - 2400 - 500 = 700) e fechar com saldo zero
    const quitaRes = await postAdminPagamento(adminCookie, comandaId, {
      tipo: "SALDO_TOTAL",
      idempotencyKey: crypto.randomUUID(),
      forma: "CARTAO_CREDITO",
    });
    assert(
      quitaRes.status === 201 && quitaRes.body?.comanda?.saldo === 0,
      `Quitação de saldo total falhou: status=${quitaRes.status}, saldo=${quitaRes.body?.comanda?.saldo}`
    );

    const fecharOkRes = await fetch(
      `${BASE_URL}/api/admin/comandas/${comandaId}/fechar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({}),
      }
    );
    assert(
      fecharOkRes.status === 200,
      `Fechar comanda com saldo 0 falhou com status ${fecharOkRes.status}`
    );

    // Próximo pedido na mesma mesa deve abrir uma NOVA comanda
    const newOrderKey = crypto.randomUUID();
    createdKeys.push(newOrderKey);
    const afterCloseOrder = await postOrder({
      idempotencyKey: newOrderKey,
      nomeCliente: "Maria",
      telefone: "11955550001",
      mesaNumero: mesaComanda,
      itens: [{ produtoId: prodUncontrolled.id, quantidade: 1 }],
      ipHeader: "198.51.100.215",
    });
    assert(
      afterCloseOrder.status === 201,
      `Novo pedido após fechar comanda deveria retornar 201, recebeu ${afterCloseOrder.status}`
    );
    const novaComanda = await prisma.comanda.findFirst({
      where: { mesaNumero: mesaComanda, status: "ABERTA" },
    });
    assert(
      novaComanda && novaComanda.id !== comandaId,
      "Pedido após fechamento deveria criar uma NOVA comanda aberta."
    );
    console.log(
      "PASS 7: Forma obrigatória (400), bloqueio de cancelamento pago (409), fechamento e abertura de nova comanda validados."
    );

    // ------------------------------------------------------------------
    // 8) 10 envios simultâneos de Venda de Balcão com MESMA idempotencyKey -> 1 venda, estoque = 3
    // ------------------------------------------------------------------
    const balcaoSameKey = crypto.randomUUID();
    createdKeys.push(balcaoSameKey);

    const postBalcao = async (payload: Record<string, unknown>) => {
      const res = await fetch(`${BASE_URL}/api/admin/balcao/vendas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      return { status: res.status, body };
    };

    const balcaoSameResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        postBalcao({
          idempotencyKey: balcaoSameKey,
          nomeCliente: "Balcão Idempotência",
          enviarCozinha: false,
          itens: [{ produtoId: prodBalcao.id, quantidade: 2 }], // 2000
          pagamentos: [{ forma: "PIX", valor: 2000 }],
        })
      )
    );

    const okBalcaoSame = balcaoSameResults.filter(
      (r) => r.status === 200 || r.status === 201
    );
    assert(
      okBalcaoSame.length === 10,
      `Esperava 10 respostas 200/201 para mesma idempotencyKey no balcão, recebeu ${okBalcaoSame.length}`
    );

    const balcaoComandaIds = new Set(
      okBalcaoSame.map((r) => r.body?.venda?.comandaId)
    );
    assert(
      balcaoComandaIds.size === 1,
      `Esperava 1 venda de balcão única, encontrou ${balcaoComandaIds.size}`
    );
    const firstBalcaoComandaId = okBalcaoSame[0]!.body.venda.comandaId as string;
    createdBalcaoComandaIds.push(firstBalcaoComandaId);

    const balcaoComandaDb = await prisma.comanda.findUniqueOrThrow({
      where: { id: firstBalcaoComandaId },
      include: { pedidos: true, pagamentos: true },
    });
    assert(
      balcaoComandaDb.tipo === "BALCAO" &&
        balcaoComandaDb.mesaNumero === null &&
        balcaoComandaDb.mesaAberta === null &&
        balcaoComandaDb.status === "FECHADA",
      "Comanda de balcão deveria nascer tipo=BALCAO, mesaNumero=null, mesaAberta=null e status=FECHADA"
    );
    assert(
      balcaoComandaDb.pedidos[0]?.origem === "BALCAO" &&
        balcaoComandaDb.pedidos[0]?.status === "ENTREGUE",
      "Pedido de balcão sem enviarCozinha deveria nascer origem=BALCAO e status=ENTREGUE"
    );

    const prodBalcaoAfterSame = await prisma.produto.findUniqueOrThrow({
      where: { id: prodBalcao.id },
    });
    assert(
      prodBalcaoAfterSame.estoque === 3,
      `Esperava estoque balcão = 3 após venda de 2 un., encontrou ${prodBalcaoAfterSame.estoque}`
    );
    console.log(
      "PASS 8: 10 envios simultâneos de balcão com mesma idempotencyKey -> 1 venda ENTREGUE, estoque = 3."
    );

    // ------------------------------------------------------------------
    // 9) 2 vendas de balcão simultâneas disputando estoque (3 un. para 2 pedidos de 2 un.)
    // ------------------------------------------------------------------
    const balcaoRaceKeyA = crypto.randomUUID();
    const balcaoRaceKeyB = crypto.randomUUID();
    createdKeys.push(balcaoRaceKeyA, balcaoRaceKeyB);

    const [bRaceA, bRaceB] = await Promise.all([
      postBalcao({
        idempotencyKey: balcaoRaceKeyA,
        itens: [{ produtoId: prodBalcao.id, quantidade: 2 }],
        pagamentos: [{ forma: "DINHEIRO", valor: 2000 }],
      }),
      postBalcao({
        idempotencyKey: balcaoRaceKeyB,
        itens: [{ produtoId: prodBalcao.id, quantidade: 2 }],
        pagamentos: [{ forma: "CARTAO_DEBITO", valor: 2000 }],
      }),
    ]);

    const bRaceStatuses = [bRaceA.status, bRaceB.status].sort();
    assert(
      bRaceStatuses[0] === 201 && bRaceStatuses[1] === 409,
      `Esperava [201, 409] na disputa de estoque do balcão, recebeu [${bRaceStatuses.join(", ")}]`
    );
    const bRaceWinner = bRaceA.status === 201 ? bRaceA : bRaceB;
    createdBalcaoComandaIds.push(bRaceWinner.body.venda.comandaId);

    const prodBalcaoAfterRace = await prisma.produto.findUniqueOrThrow({
      where: { id: prodBalcao.id },
    });
    assert(
      prodBalcaoAfterRace.estoque === 1,
      `Esperava estoque = 1 após disputa, encontrou ${prodBalcaoAfterRace.estoque}`
    );
    console.log(
      "PASS 9: 2 vendas de balcão disputando estoque -> 1 aprovada (201), 1 sem estoque (409), estoque = 1."
    );

    // ------------------------------------------------------------------
    // 10) Balcão: validação de pagamento/cozinha, 2 cancelamentos simultâneos e resumo
    // ------------------------------------------------------------------
    const badValorRes = await postBalcao({
      idempotencyKey: crypto.randomUUID(),
      itens: [{ produtoId: prodBalcao.id, quantidade: 1 }], // 1000
      pagamentos: [{ forma: "PIX", valor: 900 }],
    });
    assert(
      badValorRes.status === 400,
      `Venda de balcão com pagamento divergente deveria retornar 400, recebeu ${badValorRes.status}`
    );

    const multiKey = crypto.randomUUID();
    createdKeys.push(multiKey);
    const multiRes = await postBalcao({
      idempotencyKey: multiKey,
      nomeCliente: "Balcão Cozinha",
      enviarCozinha: true,
      recebidoPor: "Operador Balcão",
      itens: [{ produtoId: prodBalcao.id, quantidade: 1 }], // 1000
      pagamentos: [
        { forma: "PIX", valor: 600 },
        { forma: "DINHEIRO", valor: 400 },
      ],
    });
    assert(
      multiRes.status === 201 &&
        multiRes.body?.venda?.status === "RECEBIDO" &&
        multiRes.body?.venda?.pagamentos?.length === 2,
      `Venda multi-forma com enviarCozinha falhou: status=${multiRes.status}`
    );
    const multiComandaId = multiRes.body.venda.comandaId as string;
    createdBalcaoComandaIds.push(multiComandaId);

    // 2 cancelamentos simultâneos da mesma venda -> apenas 1 passa e devolve estoque uma vez
    const cancelBalcaoCall = async () => {
      const r = await fetch(
        `${BASE_URL}/api/admin/balcao/vendas/${multiComandaId}/cancelar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: adminCookie,
          },
          body: JSON.stringify({ motivo: "Teste cancelamento simultâneo" }),
        }
      );
      return { status: r.status, body: await r.json() };
    };

    const [cancelResA, cancelResB] = await Promise.all([
      cancelBalcaoCall(),
      cancelBalcaoCall(),
    ]);
    const cancelStatuses = [cancelResA.status, cancelResB.status].sort();
    assert(
      cancelStatuses[0] === 200 && cancelStatuses[1] === 409,
      `Esperava [200, 409] em 2 cancelamentos simultâneos de balcão, recebeu [${cancelStatuses.join(", ")}]`
    );

    const prodBalcaoRestocked = await prisma.produto.findUniqueOrThrow({
      where: { id: prodBalcao.id },
    });
    assert(
      prodBalcaoRestocked.estoque === 1,
      `Estoque deveria voltar para 1 (uma única devolução), encontrou ${prodBalcaoRestocked.estoque}`
    );

    const estornadosCount = await prisma.pagamento.count({
      where: { comandaId: multiComandaId, status: "ESTORNADO" },
    });
    assert(
      estornadosCount === 2,
      `Os 2 pagamentos da venda cancelada deveriam estar ESTORNADO, encontrou ${estornadosCount}`
    );

    const resumoRes = await fetch(`${BASE_URL}/api/admin/resumo?periodo=hoje`, {
      headers: { Cookie: adminCookie },
    });
    assert(resumoRes.status === 200, `Resumo retornou ${resumoRes.status}`);
    const resumoBody = await resumoRes.json();
    assert(
      Array.isArray(resumoBody.vendasBalcaoCanceladas) &&
        resumoBody.vendasBalcaoCanceladas.some(
          (v: { comandaId: string }) => v.comandaId === multiComandaId
        ),
      "Venda de balcão cancelada deveria constar na lista vendasBalcaoCanceladas do resumo"
    );
    assert(
      Array.isArray(resumoBody.estornos) &&
        resumoBody.estornos.some(
          (e: { comandaId: string }) => e.comandaId === multiComandaId
        ),
      "Estornos da venda de balcão cancelada deveriam constar em estornos do resumo"
    );
    console.log(
      "PASS 10: Venda multi-forma + cozinha, 2 cancelamentos simultâneos (1x estorno/estoque) e resumo de caixa validados."
    );

    // ------------------------------------------------------------------
    // 11) POST /api/minha-conta -> retorna apenas pedidos deste aparelho, sem vazar terceiros/telefone
    // ------------------------------------------------------------------
    const mesaClienteFlow = testMesaNumbers[6];
    const mcKeyA = crypto.randomUUID();
    const mcKeyB = crypto.randomUUID();
    createdKeys.push(mcKeyA, mcKeyB);

    const [mcPedA, mcPedB] = await Promise.all([
      postOrder({
        idempotencyKey: mcKeyA,
        nomeCliente: "Cliente Conta A",
        telefone: "11944440001",
        mesaNumero: mesaClienteFlow,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 2 }], // 2400
        ipHeader: "198.51.100.231",
      }),
      postOrder({
        idempotencyKey: mcKeyB,
        nomeCliente: "Cliente Conta B",
        telefone: "11944440002",
        mesaNumero: mesaClienteFlow,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 1 }], // 1200
        ipHeader: "198.51.100.232",
      }),
    ]);

    assert(
      mcPedA.status === 201 && mcPedB.status === 201,
      `Pedidos para Minha Conta falharam: [${mcPedA.status}, ${mcPedB.status}]`
    );

    const mcComanda = await prisma.comanda.findUniqueOrThrow({
      where: { mesaAberta: mesaClienteFlow },
    });

    const mcPayA = await postAdminPagamento(adminCookie, mcComanda.id, {
      tipo: "PESSOA",
      idempotencyKey: crypto.randomUUID(),
      telefone: "11944440001",
      forma: "PIX",
    });
    assert(
      mcPayA.status === 201,
      `Pagamento da pessoa A falhou com status ${mcPayA.status}`
    );

    const minhaContaRes = await fetch(`${BASE_URL}/api/minha-conta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedidoIds: [mcPedA.body.pedido.id],
        mesaNumero: mesaClienteFlow,
      }),
    });
    assert(
      minhaContaRes.status === 200,
      `POST /api/minha-conta retornou ${minhaContaRes.status}`
    );
    const minhaContaText = await minhaContaRes.text();
    const minhaContaJson = JSON.parse(minhaContaText);

    assert(
      minhaContaJson.pedidos?.length === 1 &&
        minhaContaJson.pedidos[0].id === mcPedA.body.pedido.id &&
        minhaContaJson.pedidos[0].itens?.[0]?.pago === true,
      "Minha conta deveria retornar somente o pedido A com item marcado pago"
    );
    assert(
      minhaContaJson.totalConsumido === 2400 &&
        minhaContaJson.totalPago === 2400 &&
        minhaContaJson.totalPendente === 0,
      `Totais incorretos em Minha Conta: ${JSON.stringify(minhaContaJson)}`
    );
    assert(
      !minhaContaText.includes("11944440001") &&
        !minhaContaText.includes("11944440002") &&
        !minhaContaText.includes("telefone") &&
        !minhaContaText.includes("198.51.100") &&
        !minhaContaText.includes(mcPedB.body.pedido.id),
      "Minha conta vazou telefone, IP ou pedido de terceiro!"
    );
    console.log(
      "PASS 11: POST /api/minha-conta retornou apenas os pedidos do aparelho, com status pago e sem vazar terceiros."
    );

    // ------------------------------------------------------------------
    // 12) POST /api/comandas/pedir-conta -> 5 chamadas simultâneas (1 passa 200, 4 caem no cooldown 429)
    // ------------------------------------------------------------------
    const pedirContaCalls = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${BASE_URL}/api/comandas/pedir-conta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mesaNumero: mesaClienteFlow,
            escopo: "INDIVIDUAL",
            nomeCliente: "João",
          }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
      )
    );

    const pcOk = pedirContaCalls.filter((r) => r.status === 200);
    const pc429 = pedirContaCalls.filter((r) => r.status === 429);
    assert(
      pcOk.length === 1 && pc429.length === 4,
      `Esperava [1x 200, 4x 429] em 5 pedidos de conta simultâneos, recebeu ${pcOk.length}x 200 e ${pc429.length}x 429`
    );

    const afterPedirComanda = await prisma.comanda.findUniqueOrThrow({
      where: { id: mcComanda.id },
    });
    assert(
      afterPedirComanda.pediuConta === true &&
        afterPedirComanda.pediuContaDetalhes === "Só João" &&
        afterPedirComanda.pediuContaEm !== null,
      `Campos pediuConta não foram gravados corretamente: ${JSON.stringify(afterPedirComanda)}`
    );

    const immediateMesaReq = await fetch(
      `${BASE_URL}/api/comandas/pedir-conta`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mesaNumero: mesaClienteFlow,
          escopo: "MESA",
        }),
      }
    );
    assert(
      immediateMesaReq.status === 429,
      `Novo pedir-conta em menos de 2 min deveria retornar 429, recebeu ${immediateMesaReq.status}`
    );
    console.log(
      "PASS 12: POST /api/comandas/pedir-conta respeitou concorrência e limite de 1 chamada a cada 2 minutos por mesa."
    );

    // ------------------------------------------------------------------
    // 13) Modo Garçom: 10 envios simultâneos com MESMA idempotencyKey -> 1 pedido, estoque = 1
    // ------------------------------------------------------------------
    const mesaGarcom = testMesaNumbers[7]!;
    const postGarcom = async (payload: Record<string, unknown>) => {
      const r = await fetch(`${BASE_URL}/api/admin/garcom/pedidos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify(payload),
      });
      return { status: r.status, body: await r.json() };
    };

    const gSameKey = crypto.randomUUID();
    createdKeys.push(gSameKey);
    const gSameResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        postGarcom({
          idempotencyKey: gSameKey,
          mesaNumero: mesaGarcom,
          nomeCliente: "João",
          enviarCozinha: true,
          lancadoPor: "Garçom Teste",
          itens: [{ produtoId: prodGarcom.id, quantidade: 2 }], // 2000
        })
      )
    );

    const gSameOk = gSameResults.filter(
      (r) => r.status === 200 || r.status === 201
    );
    assert(
      gSameOk.length === 10,
      `Esperava 10 respostas 200/201 no modo garçom idempotente, recebeu ${gSameOk.length}`
    );
    const gUniqueIds = new Set(gSameOk.map((r) => r.body?.pedido?.id));
    assert(
      gUniqueIds.size === 1,
      `Esperava exatamente 1 pedido de garçom único, recebeu ${gUniqueIds.size}`
    );
    const gPedidoDb = await prisma.pedido.findUniqueOrThrow({
      where: { idempotencyKey: gSameKey },
    });
    assert(
      gPedidoDb.origem === "GARCOM" &&
        gPedidoDb.status === "RECEBIDO" &&
        gPedidoDb.lancadoPor === "Garçom Teste" &&
        gPedidoDb.telefone === "garcom:joao",
      `Campos do pedido de garçom incorretos: ${JSON.stringify(gPedidoDb)}`
    );

    const prodGarcomAfterSame = await prisma.produto.findUniqueOrThrow({
      where: { id: prodGarcom.id },
    });
    assert(
      prodGarcomAfterSame.estoque === 1,
      `Esperava estoque garçom = 1 após 2 un., encontrou ${prodGarcomAfterSame.estoque}`
    );
    console.log(
      "PASS 13: Modo Garçom idempotente (10 envios -> 1 pedido RECEBIDO, origem=GARCOM, estoque=1)."
    );

    // ------------------------------------------------------------------
    // 14) Duas pessoas SEM telefone na mesma mesa -> separadas na comanda + mesmo nome reaproveitado
    // ------------------------------------------------------------------
    const gJoao2Key = crypto.randomUUID();
    const gMariaKey = crypto.randomUUID();
    createdKeys.push(gJoao2Key, gMariaKey);

    const [gJoao2Res, gMariaRes] = await Promise.all([
      postGarcom({
        idempotencyKey: gJoao2Key,
        mesaNumero: mesaGarcom,
        nomeCliente: "joao", // deve reaproveitar garcom:joao
        enviarCozinha: false, // bebidas sem cozinha -> ENTREGUE
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 1 }], // 1200
      }),
      postGarcom({
        idempotencyKey: gMariaKey,
        mesaNumero: mesaGarcom,
        nomeCliente: "Maria", // garcom:maria
        enviarCozinha: false,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 2 }], // 2400
      }),
    ]);

    assert(
      gJoao2Res.status === 201 &&
        gJoao2Res.body?.pedido?.status === "ENTREGUE" &&
        gMariaRes.status === 201 &&
        gMariaRes.body?.pedido?.status === "ENTREGUE",
      `Pedidos sem cozinha do garçom falharam: [${gJoao2Res.status}, ${gMariaRes.status}]`
    );

    const gComandaId = gJoao2Res.body.comandaId as string;
    const gComandaDetailRes = await fetch(
      `${BASE_URL}/api/admin/comandas/${gComandaId}`,
      { headers: { Cookie: adminCookie } }
    );
    assert(
      gComandaDetailRes.status === 200,
      `Detalhe da comanda de garçom falhou: ${gComandaDetailRes.status}`
    );
    const gComandaDetail = (await gComandaDetailRes.json()).comanda;
    assert(
      gComandaDetail.pessoas?.length === 2,
      `Esperava 2 pessoas separadas na mesa (${gComandaDetail.pessoas?.length} encontradas)`
    );

    const joaoEntry = gComandaDetail.pessoas.find(
      (p: { telefone: string }) => p.telefone === "garcom:joao"
    );
    const mariaEntry = gComandaDetail.pessoas.find(
      (p: { telefone: string }) => p.telefone === "garcom:maria"
    );
    assert(
      joaoEntry &&
        joaoEntry.subtotal === 3200 &&
        mariaEntry &&
        mariaEntry.subtotal === 2400,
      "Agrupamento por chave garcom:<nome> não separou/somou corretamente João e Maria"
    );

    // Paga só a parte de João (garcom:joao) e verifica que Maria continua pendente
    const payJoaoRes = await postAdminPagamento(adminCookie, gComandaId, {
      tipo: "PESSOA",
      idempotencyKey: crypto.randomUUID(),
      telefone: "garcom:joao",
      forma: "PIX",
    });
    assert(
      payJoaoRes.status === 201 &&
        payJoaoRes.body?.comanda?.saldo === 2400,
      `Pagamento da parte de garcom:joao falhou: status=${payJoaoRes.status}, saldo=${payJoaoRes.body?.comanda?.saldo}`
    );
    console.log(
      "PASS 14: Duas pessoas sem telefone separadas na mesma comanda + reaproveitamento de chave + pagamento individual."
    );

    // ------------------------------------------------------------------
    // 15) Modo Garçom: disputa pela última unidade do estoque (estoque=1 -> 1x 201, 1x 409)
    // ------------------------------------------------------------------
    const gLastKeyA = crypto.randomUUID();
    const gLastKeyB = crypto.randomUUID();
    createdKeys.push(gLastKeyA, gLastKeyB);

    const [gLastA, gLastB] = await Promise.all([
      postGarcom({
        idempotencyKey: gLastKeyA,
        mesaNumero: mesaGarcom,
        nomeCliente: "Maria",
        enviarCozinha: true,
        itens: [{ produtoId: prodGarcom.id, quantidade: 1 }],
      }),
      postGarcom({
        idempotencyKey: gLastKeyB,
        mesaNumero: mesaGarcom,
        nomeCliente: "Carlos",
        enviarCozinha: true,
        itens: [{ produtoId: prodGarcom.id, quantidade: 1 }],
      }),
    ]);

    const gLastStatuses = [gLastA.status, gLastB.status].sort();
    assert(
      gLastStatuses[0] === 201 && gLastStatuses[1] === 409,
      `Esperava [201, 409] na disputa pela última unidade no modo garçom, recebeu [${gLastStatuses.join(", ")}]`
    );

    const prodGarcomFinal = await prisma.produto.findUniqueOrThrow({
      where: { id: prodGarcom.id },
    });
    assert(
      prodGarcomFinal.estoque === 0,
      `Estoque final garçom deveria ser 0, encontrou ${prodGarcomFinal.estoque}`
    );
    console.log(
      "PASS 15: Disputa pela última unidade no Modo Garçom -> 1 aprovado (201), 1 bloqueado (409), estoque = 0."
    );

    // ------------------------------------------------------------------
    // 16) Segurança de Cookie (sem cookie -> 401; cookie adulterado -> 401)
    // ------------------------------------------------------------------
    const atendentePassword = process.env.ATENDENTE_PASSWORD;
    assert(
      atendentePassword && atendentePassword.length > 0,
      "ATENDENTE_PASSWORD precisa estar definido no ambiente para testar permissões"
    );
    const atendenteCookie = await loginAs(atendentePassword, "ATENDENTE");

    const noCookieRes = await fetch(`${BASE_URL}/api/admin/pedidos`);
    assert(
      noCookieRes.status === 401,
      `Requisição sem cookie deveria retornar 401, recebeu ${noCookieRes.status}`
    );

    const tokenValue = atendenteCookie.split("=")[1] ?? "";
    const tokenParts = tokenValue.split(".");
    assert(tokenParts.length === 4, "Token de sessão deveria ter 4 partes");

    const forgedRoleCookie = `ahb_admin_session=${tokenParts[0]}.DONO.${tokenParts[2]}.${tokenParts[3]}`;
    const forgedRes = await fetch(`${BASE_URL}/api/admin/resumo`, {
      headers: { Cookie: forgedRoleCookie },
    });
    assert(
      forgedRes.status === 401,
      `Cookie com perfil adulterado para DONO deveria retornar 401, recebeu ${forgedRes.status}`
    );

    const badSigCookie = `ahb_admin_session=${tokenParts[0]}.${tokenParts[1]}.${tokenParts[2]}.${tokenParts[3]}X`;
    const badSigRes = await fetch(`${BASE_URL}/api/admin/pedidos`, {
      headers: { Cookie: badSigCookie },
    });
    assert(
      badSigRes.status === 401,
      `Cookie com assinatura adulterada deveria retornar 401, recebeu ${badSigRes.status}`
    );
    console.log(
      "PASS 16: Cookie ausente, perfil adulterado e assinatura adulterada recusados com 401."
    );

    // ------------------------------------------------------------------
    // 17) Permissões ATENDENTE -> 403 em TODAS as rotas restritas + 200/201 nas permitidas
    // ------------------------------------------------------------------
    const mesaPermRecord = await prisma.mesa.findUniqueOrThrow({
      where: { numero: mesaGarcom },
    });

    // Cria uma comanda com saldo e pagamento + 1 venda de balcão como ATENDENTE para testar rotas restritas neles
    const permOrderKey = crypto.randomUUID();
    createdKeys.push(permOrderKey);
    const permOrderRes = await fetch(`${BASE_URL}/api/admin/garcom/pedidos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: atendenteCookie,
      },
      body: JSON.stringify({
        idempotencyKey: permOrderKey,
        mesaNumero: mesaGarcom,
        nomeCliente: "Cliente Perm",
        enviarCozinha: false,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 2 }], // 2400
      }),
    });
    assert(
      permOrderRes.status === 201,
      `Atendente deveria conseguir lançar pedido (201), recebeu ${permOrderRes.status}`
    );
    const permOrderBody = await permOrderRes.json();
    const permComandaId = permOrderBody.comandaId as string;

    const permPayRes = await postAdminPagamento(atendenteCookie, permComandaId, {
      tipo: "VALOR_LIVRE",
      idempotencyKey: crypto.randomUUID(),
      valor: 400,
      forma: "PIX",
    });
    assert(
      permPayRes.status === 201 &&
        permPayRes.body?.pagamento?.executadoPorPerfil === "ATENDENTE",
      `Atendente deveria registrar pagamento com executadoPorPerfil=ATENDENTE (status=${permPayRes.status})`
    );
    const permPagId = permPayRes.body.pagamento.id as string;

    const permBalcaoKey = crypto.randomUUID();
    createdKeys.push(permBalcaoKey);
    const permBalcaoRes = await fetch(`${BASE_URL}/api/admin/balcao/vendas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: atendenteCookie,
      },
      body: JSON.stringify({
        idempotencyKey: permBalcaoKey,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 1 }], // 1200
        pagamentos: [{ forma: "DINHEIRO", valor: 1200 }],
      }),
    });
    const permBalcaoBody = await permBalcaoRes.json();
    assert(
      permBalcaoRes.status === 201 &&
        permBalcaoBody?.venda?.pagamentos?.[0]?.executadoPorPerfil ===
          "ATENDENTE",
      `Atendente deveria registrar venda de balcão com perfil ATENDENTE (status=${permBalcaoRes.status})`
    );
    const permBalcaoComandaId = permBalcaoBody.venda.comandaId as string;
    createdBalcaoComandaIds.push(permBalcaoComandaId);

    const restrictedChecks: Array<{
      label: string;
      path: string;
      method: string;
      body?: Record<string, unknown>;
    }> = [
      { label: "GET /api/admin/resumo", path: "/api/admin/resumo", method: "GET" },
      { label: "GET /api/admin/produtos", path: "/api/admin/produtos", method: "GET" },
      {
        label: "POST /api/admin/produtos",
        path: "/api/admin/produtos",
        method: "POST",
        body: { nome: "Teste", preco: 500 },
      },
      {
        label: "PATCH /api/admin/produtos/[id]",
        path: `/api/admin/produtos/${prodUncontrolled.id}`,
        method: "PATCH",
        body: { nome: "Alterado" },
      },
      {
        label: "DELETE /api/admin/produtos/[id]",
        path: `/api/admin/produtos/${prodUncontrolled.id}`,
        method: "DELETE",
      },
      { label: "GET /api/admin/estoque", path: "/api/admin/estoque", method: "GET" },
      {
        label: "PATCH /api/admin/produtos/[id]/estoque",
        path: `/api/admin/produtos/${prodUncontrolled.id}/estoque`,
        method: "PATCH",
        body: { delta: 1 },
      },
      { label: "GET /api/admin/mesas", path: "/api/admin/mesas", method: "GET" },
      {
        label: "PUT /api/admin/mesas",
        path: "/api/admin/mesas",
        method: "PUT",
        body: { quantidade: 10 },
      },
      {
        label: "PATCH /api/admin/mesas/[id]",
        path: `/api/admin/mesas/${mesaPermRecord.id}`,
        method: "PATCH",
        body: { ativa: true },
      },
      { label: "POST /api/admin/upload", path: "/api/admin/upload", method: "POST" },
      {
        label: "POST /api/admin/push/test",
        path: "/api/admin/push/test",
        method: "POST",
      },
      {
        label: "POST estornar pagamento",
        path: `/api/admin/comandas/${permComandaId}/pagamentos/${permPagId}/estornar`,
        method: "POST",
        body: { motivo: "Teste atendente" },
      },
      {
        label: "POST cancelar venda balcão",
        path: `/api/admin/balcao/vendas/${permBalcaoComandaId}/cancelar`,
        method: "POST",
        body: { motivo: "Teste atendente" },
      },
      {
        label: "POST fechar mesa com saldo pendente",
        path: `/api/admin/comandas/${permComandaId}/fechar`,
        method: "POST",
        body: { forcarComSaldo: true, motivo: "Tentativa atendente" },
      },
      {
        label: "GET balcão período 7d",
        path: "/api/admin/balcao/vendas?periodo=7d",
        method: "GET",
      },
    ];

    for (const check of restrictedChecks) {
      const r = await fetch(`${BASE_URL}${check.path}`, {
        method: check.method,
        headers: {
          Cookie: atendenteCookie,
          ...(check.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(check.body ? { body: JSON.stringify(check.body) } : {}),
      });
      assert(
        r.status === 403,
        `ATENDENTE deveria receber 403 em ${check.label}, recebeu ${r.status}`
      );
    }

    // Verifica rotas permitidas ao ATENDENTE
    const allowedAtendente = await Promise.all([
      fetch(`${BASE_URL}/api/admin/pedidos`, { headers: { Cookie: atendenteCookie } }),
      fetch(`${BASE_URL}/api/admin/comandas?status=ABERTA`, {
        headers: { Cookie: atendenteCookie },
      }),
      fetch(`${BASE_URL}/api/admin/garcom/catalogo`, {
        headers: { Cookie: atendenteCookie },
      }),
      fetch(`${BASE_URL}/api/admin/balcao/vendas?periodo=hoje`, {
        headers: { Cookie: atendenteCookie },
      }),
    ]);
    for (const r of allowedAtendente) {
      assert(
        r.status === 200,
        `Rota permitida ao ATENDENTE retornou ${r.status} (${r.url})`
      );
    }

    // ATENDENTE pode fechar comanda com saldo zerado (usa a mesa do mcComanda ou quita uma comanda nova)
    const mesaZeroKey = crypto.randomUUID();
    createdKeys.push(mesaZeroKey);
    const zeroOrderRes = await fetch(`${BASE_URL}/api/admin/garcom/pedidos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: atendenteCookie,
      },
      body: JSON.stringify({
        idempotencyKey: mesaZeroKey,
        mesaNumero: testMesaNumbers[4]!,
        nomeCliente: "Fecha Zero",
        enviarCozinha: false,
        itens: [{ produtoId: prodUncontrolled.id, quantidade: 1 }],
      }),
    });
    const zeroComandaId = (await zeroOrderRes.json()).comandaId as string;
    const payZeroRes = await postAdminPagamento(atendenteCookie, zeroComandaId, {
      tipo: "SALDO_TOTAL",
      idempotencyKey: crypto.randomUUID(),
      forma: "CARTAO_DEBITO",
    });
    assert(payZeroRes.status === 201, "Falha ao quitar comanda de saldo zero");
    const fecharZeroAtendente = await fetch(
      `${BASE_URL}/api/admin/comandas/${zeroComandaId}/fechar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: atendenteCookie,
        },
        body: JSON.stringify({}),
      }
    );
    assert(
      fecharZeroAtendente.status === 200,
      `ATENDENTE deveria conseguir fechar comanda zerada, recebeu ${fecharZeroAtendente.status}`
    );
    const zeroComandaDb = await prisma.comanda.findUniqueOrThrow({
      where: { id: zeroComandaId },
    });
    assert(
      zeroComandaDb.fechadaPorPerfil === "ATENDENTE",
      `Esperava fechadaPorPerfil=ATENDENTE, recebeu ${zeroComandaDb.fechadaPorPerfil}`
    );
    console.log(
      `PASS 17: ATENDENTE recebeu 403 em todas as ${restrictedChecks.length} rotas restritas e 200/201 nas permitidas.`
    );

    // ------------------------------------------------------------------
    // 18) Permissões DONO -> acessa todas + grava perfil em estorno, cancelamento e fechamento pendente
    // ------------------------------------------------------------------
    const donoAllowed = await Promise.all([
      fetch(`${BASE_URL}/api/admin/resumo?periodo=hoje`, {
        headers: { Cookie: adminCookie },
      }),
      fetch(`${BASE_URL}/api/admin/produtos`, { headers: { Cookie: adminCookie } }),
      fetch(`${BASE_URL}/api/admin/estoque`, { headers: { Cookie: adminCookie } }),
      fetch(`${BASE_URL}/api/admin/mesas`, { headers: { Cookie: adminCookie } }),
    ]);
    for (const r of donoAllowed) {
      assert(r.status === 200, `DONO deveria receber 200 em ${r.url}, recebeu ${r.status}`);
    }

    const donoEstornoRes = await fetch(
      `${BASE_URL}/api/admin/comandas/${permComandaId}/pagamentos/${permPagId}/estornar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({ motivo: "Teste estorno DONO" }),
      }
    );
    assert(
      donoEstornoRes.status === 200,
      `DONO deveria estornar pagamento (200), recebeu ${donoEstornoRes.status}`
    );
    const estornoPagDb = await prisma.pagamento.findUniqueOrThrow({
      where: { id: permPagId },
    });
    assert(
      estornoPagDb.estornadoPorPerfil === "DONO",
      `Esperava estornadoPorPerfil=DONO, recebeu ${estornoPagDb.estornadoPorPerfil}`
    );

    const donoCancelBalcaoRes = await fetch(
      `${BASE_URL}/api/admin/balcao/vendas/${permBalcaoComandaId}/cancelar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({ motivo: "Teste cancelamento balcão DONO" }),
      }
    );
    assert(
      donoCancelBalcaoRes.status === 200,
      `DONO deveria cancelar venda de balcão (200), recebeu ${donoCancelBalcaoRes.status}`
    );
    const cancelBalcaoPedidoDb = await prisma.pedido.findUniqueOrThrow({
      where: { idempotencyKey: permBalcaoKey },
    });
    assert(
      cancelBalcaoPedidoDb.canceladoPorPerfil === "DONO",
      `Esperava canceladoPorPerfil=DONO, recebeu ${cancelBalcaoPedidoDb.canceladoPorPerfil}`
    );

    const donoFecharPendenteRes = await fetch(
      `${BASE_URL}/api/admin/comandas/${permComandaId}/fechar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          forcarComSaldo: true,
          motivo: "Teste fechamento pendente DONO",
        }),
      }
    );
    assert(
      donoFecharPendenteRes.status === 200,
      `DONO deveria fechar mesa com saldo pendente + motivo (200), recebeu ${donoFecharPendenteRes.status}`
    );
    const permComandaDb = await prisma.comanda.findUniqueOrThrow({
      where: { id: permComandaId },
    });
    assert(
      permComandaDb.fechadaPorPerfil === "DONO",
      `Esperava fechadaPorPerfil=DONO, recebeu ${permComandaDb.fechadaPorPerfil}`
    );
    console.log(
      "PASS 18: DONO acessou todas as rotas restritas e gravou perfil DONO em estorno, cancelamento e fechamento pendente."
    );

    console.log("\nTODOS OS TESTES DE CONCORRÊNCIA E PERMISSÕES PASSARAM!");
  } finally {
    await prisma.pedido.deleteMany({
      where: { idempotencyKey: { in: createdKeys } },
    });
    await prisma.comanda.deleteMany({
      where: {
        OR: [
          { mesaNumero: { in: testMesaNumbers } },
          { id: { in: createdBalcaoComandaIds } },
        ],
      },
    });
    await prisma.produto.deleteMany({
      where: {
        id: {
          in: [
            prod30.id,
            prodLast.id,
            prodUncontrolled.id,
            prodBalcao.id,
            prodGarcom.id,
          ],
        },
      },
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
