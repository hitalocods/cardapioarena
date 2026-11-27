import { NextResponse } from "next/server";
import { FormaPagamento, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import {
  computeComandaTotals,
  loadComandaDetail,
  lockComandaForUpdate,
  splitEquallyCentavos,
} from "@/lib/comandas";

const idempotencyKeySchema = z.string().trim().min(8).max(128);
const formaSchema = z.nativeEnum(FormaPagamento, {
  error: "Escolha a forma de pagamento.",
});
const optionalShortText = z.string().trim().max(80).optional().nullable();

const pagamentoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("PESSOA"),
    idempotencyKey: idempotencyKeySchema,
    telefone: z.string().trim().min(1, "Pessoa inválida."),
    forma: formaSchema,
    pagador: optionalShortText,
    recebidoPor: optionalShortText,
  }),
  z.object({
    tipo: z.literal("ITENS"),
    idempotencyKey: idempotencyKeySchema,
    itemIds: z
      .array(z.string().trim().min(1))
      .min(1, "Selecione ao menos um item.")
      .max(200, "Quantidade máxima de itens por baixa excedida."),
    forma: formaSchema,
    pagador: optionalShortText,
    recebidoPor: optionalShortText,
  }),
  z.object({
    tipo: z.literal("VALOR_LIVRE"),
    idempotencyKey: idempotencyKeySchema,
    valor: z
      .number()
      .int("Informe um valor válido.")
      .positive("Informe um valor maior que zero."),
    forma: formaSchema,
    pagador: optionalShortText,
    recebidoPor: optionalShortText,
  }),
  z.object({
    tipo: z.literal("SALDO_TOTAL"),
    idempotencyKey: idempotencyKeySchema,
    forma: formaSchema,
    pagador: optionalShortText,
    recebidoPor: optionalShortText,
  }),
  z.object({
    tipo: z.literal("DIVISAO_IGUAL"),
    idempotencyKey: idempotencyKeySchema,
    numeroPessoas: z
      .number()
      .int("Número de pessoas inválido.")
      .min(2, "Divida entre pelo menos 2 pessoas.")
      .max(50, "Máximo de 50 pessoas por divisão."),
    cotas: z
      .array(
        z.object({
          forma: formaSchema,
          pagador: optionalShortText,
        })
      )
      .min(2)
      .max(50),
    recebidoPor: optionalShortText,
  }),
]);

class ApiBusinessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function findExistingByIdempotency(
  comandaId: string,
  tipo: z.infer<typeof pagamentoSchema>["tipo"],
  key: string
) {
  if (tipo === "DIVISAO_IGUAL") {
    const first = await db.pagamento.findUnique({
      where: { idempotencyKey: `${key}:0` },
    });
    if (!first || first.comandaId !== comandaId) return null;
    const all = await db.pagamento.findMany({
      where: {
        comandaId,
        idempotencyKey: { startsWith: `${key}:` },
      },
      orderBy: { idempotencyKey: "asc" },
    });
    return all;
  }

  const single = await db.pagamento.findUnique({
    where: { idempotencyKey: key },
  });
  if (!single || single.comandaId !== comandaId) return null;
  return [single];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id: comandaId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados do pagamento inválidos." },
      { status: 400 }
    );
  }

  const parsed = pagamentoSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;
  if (
    data.tipo === "DIVISAO_IGUAL" &&
    data.cotas.length !== data.numeroPessoas
  ) {
    return NextResponse.json(
      { error: "Informe a forma de pagamento de todas as partes da divisão." },
      { status: 400 }
    );
  }

  const recebidoPor = data.recebidoPor?.trim() || null;

  try {
    // Caminho rápido de idempotência
    const existingFast = await findExistingByIdempotency(
      comandaId,
      data.tipo,
      data.idempotencyKey
    );
    if (existingFast && existingFast.length > 0) {
      const comanda = await loadComandaDetail(comandaId);
      return NextResponse.json(
        {
          pagamento: existingFast[0],
          pagamentos: existingFast,
          comanda,
        },
        { status: 200 }
      );
    }

    const result = await db.$transaction(
      async (tx) => {
        const locked = await lockComandaForUpdate(tx, comandaId);
        if (!locked) {
          throw new ApiBusinessError(404, "Comanda não encontrada.");
        }
        if (locked.status !== "ABERTA") {
          throw new ApiBusinessError(409, "Esta comanda já foi fechada.");
        }

        // Recheca idempotência dentro da transação com lock da comanda
        if (data.tipo === "DIVISAO_IGUAL") {
          const existingInside = await tx.pagamento.findMany({
            where: {
              comandaId,
              idempotencyKey: { startsWith: `${data.idempotencyKey}:` },
            },
            orderBy: { idempotencyKey: "asc" },
          });
          if (existingInside.length > 0) {
            const comanda = await loadComandaDetail(comandaId, tx);
            return {
              created: false,
              pagamentos: existingInside,
              comanda,
            };
          }
        } else {
          const existingInside = await tx.pagamento.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
          });
          if (existingInside) {
            if (existingInside.comandaId !== comandaId) {
              throw new ApiBusinessError(
                409,
                "Chave de pagamento já utilizada em outra comanda."
              );
            }
            const comanda = await loadComandaDetail(comandaId, tx);
            return {
              created: false,
              pagamentos: [existingInside],
              comanda,
            };
          }
        }

        const [pedidos, pagamentosAtivos] = await Promise.all([
          tx.pedido.findMany({
            where: { comandaId, status: { not: "CANCELADO" } },
            include: { itens: true },
          }),
          tx.pagamento.findMany({
            where: { comandaId, status: "ATIVO" },
          }),
        ]);

        const { saldo } = computeComandaTotals(pedidos, pagamentosAtivos);
        if (saldo <= 0) {
          throw new ApiBusinessError(409, "Esta comanda já está quitada.");
        }

        const createdPagamentos = [];

        if (data.tipo === "PESSOA") {
          const pedidosPessoa = pedidos.filter(
            (p) => p.telefone === data.telefone
          );
          if (pedidosPessoa.length === 0) {
            throw new ApiBusinessError(
              404,
              "Pessoa não encontrada nesta comanda."
            );
          }

          const itensNaoPagos = pedidosPessoa.flatMap((p) =>
            p.itens.filter((i) => i.pagamentoId === null)
          );
          if (itensNaoPagos.length === 0) {
            throw new ApiBusinessError(
              409,
              "Todos os itens desta pessoa já foram pagos."
            );
          }

          const valor = itensNaoPagos.reduce(
            (acc, item) => acc + item.precoSnapshot * item.quantidade,
            0
          );
          if (valor <= 0) {
            throw new ApiBusinessError(
              409,
              "Não há valor pendente para esta pessoa."
            );
          }
          if (valor > saldo) {
            throw new ApiBusinessError(
              409,
              "O valor dos itens excede o saldo restante da comanda (há pagamento parcial em aberto)."
            );
          }

          const nomePessoa =
            data.pagador?.trim() ||
            pedidosPessoa[pedidosPessoa.length - 1]?.nomeCliente ||
            null;

          const pagamento = await tx.pagamento.create({
            data: {
              comandaId,
              valor,
              forma: data.forma,
              pagador: nomePessoa,
              recebidoPor,
              status: "ATIVO",
              idempotencyKey: data.idempotencyKey,
            },
          });

          const itemIds = itensNaoPagos.map((i) => i.id);
          const affected = await tx.$executeRaw`
            UPDATE "ItemPedido"
            SET "pagamentoId" = ${pagamento.id}
            WHERE "id" IN (${Prisma.join(itemIds)})
              AND "pagamentoId" IS NULL
          `;

          if (affected !== itemIds.length) {
            throw new ApiBusinessError(409, "Um ou mais itens já foram pagos.");
          }

          createdPagamentos.push(pagamento);
        } else if (data.tipo === "ITENS") {
          const uniqueItemIds = Array.from(new Set(data.itemIds));
          const allItemsMap = new Map(
            pedidos.flatMap((p) => p.itens.map((i) => [i.id, i] as const))
          );

          let valor = 0;
          for (const itemId of uniqueItemIds) {
            const item = allItemsMap.get(itemId);
            if (!item) {
              throw new ApiBusinessError(
                400,
                "Um ou mais itens selecionados não pertencem a pedidos válidos desta comanda."
              );
            }
            if (item.pagamentoId !== null) {
              throw new ApiBusinessError(
                409,
                "Um ou mais itens selecionados já foram pagos."
              );
            }
            valor += item.precoSnapshot * item.quantidade;
          }

          if (valor <= 0) {
            throw new ApiBusinessError(400, "Valor inválido para os itens.");
          }
          if (valor > saldo) {
            throw new ApiBusinessError(
              409,
              "O valor dos itens excede o saldo restante da comanda."
            );
          }

          const pagamento = await tx.pagamento.create({
            data: {
              comandaId,
              valor,
              forma: data.forma,
              pagador: data.pagador?.trim() || null,
              recebidoPor,
              status: "ATIVO",
              idempotencyKey: data.idempotencyKey,
            },
          });

          const affected = await tx.$executeRaw`
            UPDATE "ItemPedido"
            SET "pagamentoId" = ${pagamento.id}
            WHERE "id" IN (${Prisma.join(uniqueItemIds)})
              AND "pagamentoId" IS NULL
          `;

          if (affected !== uniqueItemIds.length) {
            throw new ApiBusinessError(409, "Item já foi pago.");
          }

          createdPagamentos.push(pagamento);
        } else if (data.tipo === "VALOR_LIVRE") {
          if (data.valor > saldo) {
            throw new ApiBusinessError(
              409,
              "Valor informado é maior que o saldo restante da comanda."
            );
          }

          const pagamento = await tx.pagamento.create({
            data: {
              comandaId,
              valor: data.valor,
              forma: data.forma,
              pagador: data.pagador?.trim() || null,
              recebidoPor,
              status: "ATIVO",
              idempotencyKey: data.idempotencyKey,
            },
          });
          createdPagamentos.push(pagamento);
        } else if (data.tipo === "SALDO_TOTAL") {
          const pagamento = await tx.pagamento.create({
            data: {
              comandaId,
              valor: saldo,
              forma: data.forma,
              pagador: data.pagador?.trim() || "Saldo total da mesa",
              recebidoPor,
              status: "ATIVO",
              idempotencyKey: data.idempotencyKey,
            },
          });

          const unpaidItemIds = pedidos.flatMap((p) =>
            p.itens.filter((i) => i.pagamentoId === null).map((i) => i.id)
          );
          if (unpaidItemIds.length > 0) {
            const affected = await tx.$executeRaw`
              UPDATE "ItemPedido"
              SET "pagamentoId" = ${pagamento.id}
              WHERE "id" IN (${Prisma.join(unpaidItemIds)})
                AND "pagamentoId" IS NULL
            `;
            if (affected !== unpaidItemIds.length) {
              throw new ApiBusinessError(
                409,
                "Alguns itens foram pagos simultaneamente. Atualize a comanda."
              );
            }
          }

          createdPagamentos.push(pagamento);
        } else if (data.tipo === "DIVISAO_IGUAL") {
          if (saldo < data.numeroPessoas) {
            throw new ApiBusinessError(
              400,
              "O saldo restante é menor que a quantidade de pessoas na divisão."
            );
          }

          const valores = splitEquallyCentavos(saldo, data.numeroPessoas);
          for (let idx = 0; idx < data.numeroPessoas; idx += 1) {
            const cota = data.cotas[idx]!;
            const pagamento = await tx.pagamento.create({
              data: {
                comandaId,
                valor: valores[idx]!,
                forma: cota.forma,
                pagador:
                  cota.pagador?.trim() ||
                  `Divisão ${idx + 1}/${data.numeroPessoas}`,
                recebidoPor,
                status: "ATIVO",
                idempotencyKey: `${data.idempotencyKey}:${idx}`,
              },
            });
            createdPagamentos.push(pagamento);
          }
        }

        const comanda = await loadComandaDetail(comandaId, tx);
        return {
          created: true,
          pagamentos: createdPagamentos,
          comanda,
        };
      },
      {
        maxWait: 20000,
        timeout: 20000,
      }
    );

    return NextResponse.json(
      {
        pagamento: result.pagamentos[0],
        pagamentos: result.pagamentos,
        comanda: result.comanda,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof ApiBusinessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    const isUniqueRace =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (isUniqueRace) {
      const existing = await findExistingByIdempotency(
        comandaId,
        data.tipo,
        data.idempotencyKey
      );
      if (existing && existing.length > 0) {
        const comanda = await loadComandaDetail(comandaId);
        return NextResponse.json(
          {
            pagamento: existing[0],
            pagamentos: existing,
            comanda,
          },
          { status: 200 }
        );
      }
    }

    console.error("Erro ao registrar pagamento na comanda:", error);
    return NextResponse.json(
      { error: "Não foi possível registrar o pagamento." },
      { status: 500 }
    );
  }
}
