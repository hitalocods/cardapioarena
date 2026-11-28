import { NextResponse, after } from "next/server";
import { AdminPerfil, FormaPagamento, PedidoStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { sendNewOrderPush } from "@/lib/push";

export interface BalcaoVendaDTO {
  comandaId: string;
  pedidoId: string;
  numero: number;
  nomeCliente: string;
  observacao: string | null;
  status: PedidoStatus;
  cancelada: boolean;
  motivoCancelamento: string | null;
  total: number;
  createdAt: string;
  itens: Array<{
    id: string;
    produtoId: string | null;
    nomeSnapshot: string;
    precoSnapshot: number;
    quantidade: number;
    subtotal: number;
  }>;
  pagamentos: Array<{
    id: string;
    valor: number;
    forma: FormaPagamento;
    pagador: string | null;
    recebidoPor: string | null;
    executadoPorPerfil?: AdminPerfil | null;
    status: "ATIVO" | "ESTORNADO";
    motivoEstorno: string | null;
    estornadoPorPerfil?: AdminPerfil | null;
    createdAt: string;
  }>;
}

type PeriodoFiltro = "hoje" | "7d" | "30d" | "mes" | "tudo";

function getPeriodStartSP(periodo: PeriodoFiltro): Date | null {
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const startOfToday = new Date(`${todayKey}T00:00:00-03:00`);

  if (periodo === "hoje") return startOfToday;
  if (periodo === "7d") {
    return new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  }
  if (periodo === "30d") {
    return new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);
  }
  if (periodo === "mes") {
    const [year, month] = todayKey.split("-");
    return new Date(`${year}-${month}-01T00:00:00-03:00`);
  }
  return null;
}

const createBalcaoSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  nomeCliente: z.string().trim().max(80).optional().nullable(),
  observacao: z.string().trim().max(300).optional().nullable(),
  enviarCozinha: z.boolean().optional().default(false),
  recebidoPor: z.string().trim().max(80).optional().nullable(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().trim().min(1),
        quantidade: z.number().int().min(1).max(100),
      })
    )
    .min(1, "Adicione ao menos um item na venda.")
    .max(60, "Quantidade máxima de itens excedida."),
  pagamentos: z
    .array(
      z.object({
        forma: z.nativeEnum(FormaPagamento, {
          error: "Escolha a forma de pagamento.",
        }),
        valor: z
          .number()
          .int("Valor inválido.")
          .positive("O valor de cada pagamento deve ser maior que zero."),
      })
    )
    .min(1, "Informe ao menos uma forma de pagamento.")
    .max(10, "Máximo de 10 formas de pagamento por venda."),
});

class OutOfStockError extends Error {
  itens: Array<{ produtoId: string; nome: string }>;
  constructor(itens: Array<{ produtoId: string; nome: string }>) {
    super("Itens esgotados");
    this.itens = itens;
  }
}

class BalcaoValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toBalcaoVendaDTO(comanda: {
  id: string;
  pedidos: Array<{
    id: string;
    numero: number;
    nomeCliente: string;
    observacao: string | null;
    status: PedidoStatus;
    motivoCancelamento: string | null;
    total: number;
    createdAt: Date;
    itens: Array<{
      id: string;
      produtoId: string | null;
      nomeSnapshot: string;
      precoSnapshot: number;
      quantidade: number;
    }>;
  }>;
  pagamentos: Array<{
    id: string;
    valor: number;
    forma: FormaPagamento;
    pagador: string | null;
    recebidoPor: string | null;
    executadoPorPerfil: AdminPerfil | null;
    status: "ATIVO" | "ESTORNADO";
    motivoEstorno: string | null;
    estornadoPorPerfil: AdminPerfil | null;
    createdAt: Date;
  }>;
}): BalcaoVendaDTO | null {
  const pedido = comanda.pedidos[0];
  if (!pedido) return null;

  return {
    comandaId: comanda.id,
    pedidoId: pedido.id,
    numero: pedido.numero,
    nomeCliente: pedido.nomeCliente,
    observacao: pedido.observacao,
    status: pedido.status,
    cancelada: pedido.status === "CANCELADO",
    motivoCancelamento: pedido.motivoCancelamento,
    total: pedido.total,
    createdAt: pedido.createdAt.toISOString(),
    itens: pedido.itens.map((i) => ({
      id: i.id,
      produtoId: i.produtoId,
      nomeSnapshot: i.nomeSnapshot,
      precoSnapshot: i.precoSnapshot,
      quantidade: i.quantidade,
      subtotal: i.precoSnapshot * i.quantidade,
    })),
    pagamentos: comanda.pagamentos.map((pag) => ({
      id: pag.id,
      valor: pag.valor,
      forma: pag.forma,
      pagador: pag.pagador,
      recebidoPor: pag.recebidoPor,
      executadoPorPerfil: pag.executadoPorPerfil,
      status: pag.status,
      motivoEstorno: pag.motivoEstorno,
      estornadoPorPerfil: pag.estornadoPorPerfil,
      createdAt: pag.createdAt.toISOString(),
    })),
  };
}

async function findExistingVendaByKey(idempotencyKey: string) {
  const existingPedido = await db.pedido.findUnique({
    where: { idempotencyKey },
    include: {
      itens: { orderBy: { id: "asc" } },
      comanda: {
        include: {
          pagamentos: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!existingPedido || !existingPedido.comanda) return null;

  return toBalcaoVendaDTO({
    id: existingPedido.comanda.id,
    pedidos: [existingPedido],
    pagamentos: existingPedido.comanda.pagamentos,
  });
}

export async function GET(request: Request) {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const rawPeriodo = (searchParams.get("periodo") ?? "hoje") as PeriodoFiltro;
  const validPeriodos = new Set<PeriodoFiltro>([
    "hoje",
    "7d",
    "30d",
    "mes",
    "tudo",
  ]);
  const periodo: PeriodoFiltro = validPeriodos.has(rawPeriodo)
    ? rawPeriodo
    : "hoje";

  if (auth.role === "ATENDENTE" && periodo !== "hoje") {
    return NextResponse.json(
      { error: "Atendente pode consultar apenas as vendas de balcão de hoje." },
      { status: 403 }
    );
  }

  try {
    const inicioPeriodo = getPeriodStartSP(periodo);
    const comandas = await db.comanda.findMany({
      where: {
        tipo: "BALCAO",
        ...(inicioPeriodo ? { createdAt: { gte: inicioPeriodo } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        pedidos: {
          include: {
            itens: { orderBy: { id: "asc" } },
          },
        },
        pagamentos: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const vendas = comandas
      .map(toBalcaoVendaDTO)
      .filter((v): v is BalcaoVendaDTO => v !== null);

    return NextResponse.json(
      { periodo, vendas },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao listar vendas de balcão:", error);
    return NextResponse.json(
      { error: "Erro ao carregar vendas de balcão." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;
  const executorRole = auth.role;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados da venda inválidos." },
      { status: 400 }
    );
  }

  const parsed = createBalcaoSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;
  const nomeCliente = data.nomeCliente?.trim() || "Balcão";
  const observacao = data.observacao?.trim() || null;
  const recebidoPor = data.recebidoPor?.trim() || null;

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

  try {
    // Caminho rápido de idempotência
    const existingFast = await findExistingVendaByKey(data.idempotencyKey);
    if (existingFast) {
      return NextResponse.json(
        { venda: existingFast },
        { status: 200 }
      );
    }

    const txResult = await db.$transaction(
      async (tx) => {
        const existingInside = await tx.pedido.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: {
            itens: { orderBy: { id: "asc" } },
            comanda: {
              include: { pagamentos: { orderBy: { createdAt: "asc" } } },
            },
          },
        });

        if (existingInside && existingInside.comanda) {
          return {
            created: false,
            pedidoForPush: existingInside,
            venda: toBalcaoVendaDTO({
              id: existingInside.comanda.id,
              pedidos: [existingInside],
              pagamentos: existingInside.comanda.pagamentos,
            }),
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

        const totalPagamentos = data.pagamentos.reduce(
          (acc, pag) => acc + pag.valor,
          0
        );
        if (totalPagamentos !== totalCentavos) {
          throw new BalcaoValidationError(
            400,
            "O total dos pagamentos deve ser exatamente igual ao total da venda."
          );
        }

        // Desconto atômico de estoque ordenado por produtoId
        for (const item of sortedItems) {
          const product = productMap.get(item.produtoId)!;
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

        const now = new Date();
        const comanda = await tx.comanda.create({
          data: {
            tipo: "BALCAO",
            mesaNumero: null,
            mesaAberta: null,
            status: "FECHADA",
            abertaEm: now,
            fechadaEm: now,
            pediuConta: false,
          },
        });

        const pedido = await tx.pedido.create({
          data: {
            idempotencyKey: data.idempotencyKey,
            comandaId: comanda.id,
            origem: "BALCAO",
            mesaNumero: null,
            nomeCliente,
            telefone: "",
            observacao,
            status: data.enviarCozinha ? "RECEBIDO" : "ENTREGUE",
            total: totalCentavos,
            ip: "balcao",
            itens: {
              create: orderItemsData,
            },
          },
          include: {
            itens: { orderBy: { id: "asc" } },
          },
        });

        const pagamentosCriados = [];
        for (let idx = 0; idx < data.pagamentos.length; idx += 1) {
          const pag = data.pagamentos[idx]!;
          const createdPag = await tx.pagamento.create({
            data: {
              comandaId: comanda.id,
              valor: pag.valor,
              forma: pag.forma,
              pagador: nomeCliente,
              recebidoPor,
              executadoPorPerfil: executorRole,
              status: "ATIVO",
              idempotencyKey: `${data.idempotencyKey}:pag:${idx}`,
            },
          });
          pagamentosCriados.push(createdPag);
        }

        const primeiroPagamento = pagamentosCriados[0]!;
        await tx.itemPedido.updateMany({
          where: { pedidoId: pedido.id },
          data: { pagamentoId: primeiroPagamento.id },
        });

        return {
          created: true,
          pedidoForPush: pedido,
          venda: toBalcaoVendaDTO({
            id: comanda.id,
            pedidos: [pedido],
            pagamentos: pagamentosCriados,
          }),
        };
      },
      { maxWait: 20000, timeout: 20000 }
    );

    if (txResult.created && data.enviarCozinha) {
      after(async () => {
        await sendNewOrderPush(txResult.pedidoForPush);
      });
    }

    return NextResponse.json(
      { venda: txResult.venda },
      { status: txResult.created ? 201 : 200 }
    );
  } catch (error) {
    const isPrismaRaceOrTimeout =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2028");

    if (isPrismaRaceOrTimeout || error instanceof OutOfStockError) {
      const existing = await findExistingVendaByKey(data.idempotencyKey);
      if (existing) {
        return NextResponse.json({ venda: existing }, { status: 200 });
      }
    }

    if (error instanceof BalcaoValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
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

    console.error("Erro ao registrar venda de balcão:", error);
    return NextResponse.json(
      { error: "Não foi possível registrar a venda de balcão." },
      { status: 500 }
    );
  }
}
