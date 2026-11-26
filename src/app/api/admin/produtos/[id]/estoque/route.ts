import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";

const estoqueSchema = z.union([
  z.object({
    delta: z.number().int().min(-1000).max(1000),
  }),
  z.object({
    estoque: z.number().int().min(0).max(99999),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = estoqueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valor de estoque inválido." },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;
    if ("estoque" in data) {
      const produto = await db.produto.update({
        where: { id },
        data: { estoque: data.estoque },
      });
      return NextResponse.json({ produto });
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Produto"
        SET "estoque" = GREATEST(0, "estoque" + ${data.delta}), "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      return tx.produto.findUnique({ where: { id } });
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Produto não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ produto: updated });
  } catch (error) {
    console.error("Erro ao ajustar estoque:", error);
    return NextResponse.json(
      { error: "Erro ao ajustar estoque." },
      { status: 500 }
    );
  }
}
