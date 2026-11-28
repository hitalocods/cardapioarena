import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import { isValidBrPhone, normalizeBrPhone } from "@/lib/phone";
import { ACTIVE_ABUSE_STATUSES } from "@/lib/format";
import { toPublicPedidoDTO } from "@/lib/orders";
import { sendNewOrderPush } from "@/lib/push";
import { ensureOpenComandaForMesa } from "@/lib/comandas";

const MAX_UNITS_PER_ITEM = 20;
const MAX_TOTAL_UNITS_PER_ORDER = 30;
const MAX_OPEN_BY_PHONE = 3;
const MAX_OPEN_BY_IP = 60;
const MAX_OPEN_BY_MESA = 20;

const createOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  nomeCliente: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(80, "Nome muito longo."),
  telefone: z.string().trim().min(8, "Informe um telefone válido.").max(25),
  mesaNumero: z
    .number()
    .int("Mesa inválida.")
    .min(1, "Mesa inválida.")
    .max(9999, "Mesa inválida."),
  observacao: z
    .string()
    .trim()
    .max(300, "Observação deve ter no máximo 300 caracteres.")
    .optional()
    .nullable(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().trim().min(1),
        quantidade: z.number().int().min(1).max(MAX_UNITS_PER_ITEM),
      })
    )
    .min(1, "Adicione ao menos um item ao pedido.")
    .max(30, "Quantidade máxima de itens excedida."),
});

class OutOfStockError extends Error {
  itens: Array<{ produtoId: string; nome: string }>;
  constructor(itens: Array<{ produtoId: string; nome: string }>) {
    super("Itens esgotados");
    this.itens = itens;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados do pedido inválidos." },
      { status: 400 }
    );
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;
  if (!isValidBrPhone(data.telefone)) {
    return NextResponse.json(
      {
        error:
          "Informe um telefone brasileiro válido com DDD (ex: (11) 99999-9999).",
      },
      { status: 400 }
    );
  }

  const telefoneDigits = normalizeBrPhone(data.telefone);

  // Agrega itens repetidos por produtoId e valida limites de quantidade
  const aggregatedMap = new Map<string, number>();
  for (const item of data.itens) {
    const nextQty = (aggregatedMap.get(item.produtoId) ?? 0) + item.quantidade;
    if (nextQty > MAX_UNITS_PER_ITEM) {
      return NextResponse.json(
        {
          error: `Limite máximo de ${MAX_UNITS_PER_ITEM} unidades por item excedido.`,
        },
        { status: 400 }
      );
    }
    aggregatedMap.set(item.produtoId, nextQty);
  }

  const totalUnits = Array.from(aggregatedMap.values()).reduce(
    (acc, qty) => acc + qty,
    0
  );
  if (totalUnits > MAX_TOTAL_UNITS_PER_ORDER) {
    return NextResponse.json(
      {
        error: `Limite máximo de ${MAX_TOTAL_UNITS_PER_ORDER} unidades por pedido excedido.`,
      },
      { status: 400 }
    );
  }

  // Caminho rápido de idempotência
  const existingFast = await db.pedido.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: { itens: true },
  });
  if (existingFast) {
    return NextResponse.json(
      { pedido: toPublicPedidoDTO(existingFast) },
      { status: 200 }
    );
  }

  const ip = getClientIp(request);

  // Anti-abuso sem estado em memória: contagem no banco por telefone, IP e mesa
  const [openByPhone, openByIp, openByMesa] = await Promise.all([
    db.pedido.count({
      where: {
        telefone: telefoneDigits,
        status: { in: ACTIVE_ABUSE_STATUSES },
      },
    }),
    db.pedido.count({
      where: {
        ip,
        status: { in: ACTIVE_ABUSE_STATUSES },
      },
    }),
    db.pedido.count({
      where: {
        mesaNumero: data.mesaNumero,
        status: { in: ACTIVE_ABUSE_STATUSES },
      },
    }),
  ]);

  if (openByPhone >= MAX_OPEN_BY_PHONE) {
    return NextResponse.json(
      {
        error:
          "Você já possui 3 pedidos em andamento com este telefone. Aguarde a finalização de um deles para enviar outro.",
      },
      { status: 429 }
    );
  }

  if (openByIp >= MAX_OPEN_BY_IP) {
    return NextResponse.json(
      {
        error:
          "Muitos pedidos abertos nesta rede no momento. Aguarde alguns instantes e tente novamente.",
      },
      { status: 429 }
    );
  }

  if (openByMesa >= MAX_OPEN_BY_MESA) {
    return NextResponse.json(
      {
        error:
          "Esta mesa já possui 20 pedidos em andamento. Aguarde a finalização de um deles para enviar outro.",
      },
      { status: 429 }
    );
  }

  // Ordena por produtoId para evitar deadlocks em transações concorrentes
  const sortedItems = Array.from(aggregatedMap.entries())
    .map(([produtoId, quantidade]) => ({ produtoId, quantidade }))
    .sort((a, b) => a.produtoId.localeCompare(b.produtoId));

  const mesaRecord = await db.mesa.findFirst({
    where: { numero: data.mesaNumero, ativa: true },
    select: { id: true, numero: true },
  });
  if (!mesaRecord) {
    return NextResponse.json(
      {
        error: "Mesa não encontrada ou indisponível no momento.",
      },
      { status: 400 }
    );
  }

  try {
    const createdPedido = await db.$transaction(
      async (tx) => {
        const productIds = sortedItems.map((i) => i.produtoId);
        const dbProducts = await tx.produto.findMany({
          where: { id: { in: productIds } },
        });
        const productMap = new Map(dbProducts.map((p) => [p.id, p]));

        const esgotados: Array<{ produtoId: string; nome: string }> = [];

        for (const item of sortedItems) {
          const product = productMap.get(item.produtoId);
          if (!product || !product.ativo) {
            esgotados.push({
              produtoId: item.produtoId,
              nome: product?.nome ?? "Item indisponível",
            });
            continue;
          }

          if (product.controlaEstoque) {
            const affected = await tx.$executeRaw`
              UPDATE "Produto"
              SET "estoque" = "estoque" - ${item.quantidade}, "updatedAt" = NOW()
              WHERE "id" = ${item.produtoId}
                AND "ativo" = true
                AND "controlaEstoque" = true
                AND "estoque" >= ${item.quantidade}
            `;
            if (affected === 0) {
              esgotados.push({
                produtoId: product.id,
                nome: product.nome,
              });
            }
          }
        }

        if (esgotados.length > 0) {
          throw new OutOfStockError(esgotados);
        }

        let totalCentavos = 0;
        const orderItemsData = sortedItems.map((item) => {
          const product = productMap.get(item.produtoId)!;
          totalCentavos += product.preco * item.quantidade;
          return {
            produtoId: product.id,
            nomeSnapshot: product.nome,
            precoSnapshot: product.preco,
            quantidade: item.quantidade,
          };
        });

        const comanda = await ensureOpenComandaForMesa(tx, mesaRecord.numero);

        return tx.pedido.create({
          data: {
            idempotencyKey: data.idempotencyKey,
            comandaId: comanda.id,
            nomeCliente: data.nomeCliente,
            telefone: telefoneDigits,
            mesaNumero: mesaRecord.numero,
            observacao: data.observacao ? data.observacao : null,
            status: "RECEBIDO",
            total: totalCentavos,
            ip,
            itens: {
              create: orderItemsData,
            },
          },
          include: { itens: true },
        });
      },
      {
        maxWait: 20000,
        timeout: 20000,
      }
    );

    // Notificação push fora do caminho crítico
    after(async () => {
      await sendNewOrderPush(createdPedido);
    });

    return NextResponse.json(
      { pedido: toPublicPedidoDTO(createdPedido) },
      { status: 201 }
    );
  } catch (error) {
    // Se houve corrida de idempotencyKey (P2002, P2028 ou perda de estoque após o gêmeo commitar)
    const isPrismaRaceOrTimeout =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2028");

    if (isPrismaRaceOrTimeout || error instanceof OutOfStockError) {
      const existing = await db.pedido.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: { itens: true },
      });
      if (existing) {
        return NextResponse.json(
          { pedido: toPublicPedidoDTO(existing) },
          { status: 200 }
        );
      }
    }

    if (error instanceof OutOfStockError) {
      const nomes = error.itens.map((i) => i.nome).join(", ");
      return NextResponse.json(
        {
          error: `Sem estoque suficiente para: ${nomes}.`,
          itensEsgotados: error.itens,
        },
        { status: 409 }
      );
    }

    console.error("Erro ao criar pedido:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar o pedido. Tente novamente." },
      { status: 500 }
    );
  }
}
