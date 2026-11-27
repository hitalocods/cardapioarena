import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { ensureOpenComandaForMesa } from "@/lib/comandas";
import {
  buildGarcomPessoaKey,
  isGarcomPessoaKey,
  isValidBrPhone,
  normalizeBrPhone,
} from "@/lib/phone";
import { sendNewOrderPush } from "@/lib/push";

const garcomCreateOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  mesaNumero: z
    .number()
    .int("Mesa inválida.")
    .min(1, "Mesa inválida.")
    .max(9999, "Mesa inválida."),
  nomeCliente: z
    .string()
    .trim()
    .min(2, "Informe o nome da pessoa.")
    .max(80, "Nome muito longo."),
  telefone: z.string().trim().max(80).optional().nullable(),
  observacao: z
    .string()
    .trim()
    .max(300, "Observação deve ter no máximo 300 caracteres.")
    .optional()
    .nullable(),
  enviarCozinha: z.boolean().optional().default(true),
  lancadoPor: z.string().trim().max(80).optional().nullable(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().trim().min(1),
        quantidade: z.number().int().min(1).max(100),
      })
    )
    .min(1, "Adicione ao menos um item ao pedido.")
    .max(60, "Quantidade máxima de itens excedida."),
});

class OutOfStockError extends Error {
  itens: Array<{ produtoId: string; nome: string }>;
  constructor(itens: Array<{ produtoId: string; nome: string }>) {
    super("Itens esgotados");
    this.itens = itens;
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados do pedido inválidos." },
      { status: 400 }
    );
  }

  const parsed = garcomCreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;
  const rawPhone = data.telefone?.trim() ?? "";

  let pessoaKey: string;
  if (rawPhone.length > 0 && isGarcomPessoaKey(rawPhone)) {
    pessoaKey = rawPhone.toLowerCase();
  } else if (rawPhone.length > 0) {
    if (!isValidBrPhone(rawPhone)) {
      return NextResponse.json(
        {
          error:
            "Informe um telefone brasileiro válido com DDD ou deixe em branco.",
        },
        { status: 400 }
      );
    }
    pessoaKey = normalizeBrPhone(rawPhone);
  } else {
    pessoaKey = buildGarcomPessoaKey(data.nomeCliente);
  }

  const lancadoPor = data.lancadoPor?.trim() || null;
  const observacao = data.observacao?.trim() || null;

  // Agrega itens repetidos por produtoId e ordena para prevenir deadlocks
  const aggregatedMap = new Map<string, number>();
  for (const item of data.itens) {
    aggregatedMap.set(
      item.produtoId,
      (aggregatedMap.get(item.produtoId) ?? 0) + item.quantidade
    );
  }
  const sortedItems = Array.from(aggregatedMap.entries())
    .map(([produtoId, quantidade]) => ({ produtoId, quantidade }))
    .sort((a, b) => a.produtoId.localeCompare(b.produtoId));

  // Caminho rápido de idempotência
  const existingFast = await db.pedido.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: { itens: true },
  });
  if (existingFast) {
    return NextResponse.json(
      {
        pedido: existingFast,
        comandaId: existingFast.comandaId,
      },
      { status: 200 }
    );
  }

  const mesaRecord = await db.mesa.findFirst({
    where: { numero: data.mesaNumero, ativa: true },
    select: { id: true, numero: true },
  });
  if (!mesaRecord) {
    return NextResponse.json(
      { error: "Mesa não encontrada ou inativa no momento." },
      { status: 400 }
    );
  }

  try {
    const txResult = await db.$transaction(
      async (tx) => {
        const existingInside = await tx.pedido.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: { itens: true },
        });
        if (existingInside) {
          return {
            created: false,
            pedido: existingInside,
          };
        }

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

        // Usa a comanda ABERTA da mesa ou cria uma nova (nunca entra em comanda FECHADA)
        const comanda = await ensureOpenComandaForMesa(tx, mesaRecord.numero);

        const createdPedido = await tx.pedido.create({
          data: {
            idempotencyKey: data.idempotencyKey,
            comandaId: comanda.id,
            origem: "GARCOM",
            nomeCliente: data.nomeCliente,
            telefone: pessoaKey,
            mesaNumero: mesaRecord.numero,
            observacao,
            lancadoPor,
            status: data.enviarCozinha ? "RECEBIDO" : "ENTREGUE",
            total: totalCentavos,
            ip: "garcom",
            itens: {
              create: orderItemsData,
            },
          },
          include: { itens: true },
        });

        return {
          created: true,
          pedido: createdPedido,
        };
      },
      { maxWait: 20000, timeout: 20000 }
    );

    if (txResult.created && data.enviarCozinha) {
      after(async () => {
        await sendNewOrderPush(txResult.pedido);
      });
    }

    return NextResponse.json(
      {
        pedido: txResult.pedido,
        comandaId: txResult.pedido.comandaId,
      },
      { status: txResult.created ? 201 : 200 }
    );
  } catch (error) {
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
          {
            pedido: existing,
            comandaId: existing.comandaId,
          },
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

    console.error("Erro ao lançar pedido pelo modo garçom:", error);
    return NextResponse.json(
      { error: "Não foi possível lançar o pedido." },
      { status: 500 }
    );
  }
}
