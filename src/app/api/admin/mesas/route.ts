import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";

const setMesasQuantitySchema = z.object({
  quantidade: z
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Quantidade mínima é 0.")
    .max(200, "Quantidade máxima é 200 mesas."),
});

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const mesas = await db.mesa.findMany({
      orderBy: { numero: "asc" },
    });
    return NextResponse.json(
      { mesas },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao listar mesas:", error);
    return NextResponse.json(
      { error: "Erro ao listar mesas." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = setMesasQuantitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Quantidade inválida." },
      { status: 400 }
    );
  }

  const { quantidade } = parsed.data;

  try {
    const mesas = await db.$transaction(async (tx) => {
      for (let numero = 1; numero <= quantidade; numero += 1) {
        await tx.mesa.upsert({
          where: { numero },
          update: { ativa: true },
          create: { numero, ativa: true },
        });
      }

      await tx.mesa.updateMany({
        where: { numero: { gt: quantidade } },
        data: { ativa: false },
      });

      return tx.mesa.findMany({
        orderBy: { numero: "asc" },
      });
    });

    return NextResponse.json({ mesas });
  } catch (error) {
    console.error("Erro ao atualizar quantidade de mesas:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar quantidade de mesas." },
      { status: 500 }
    );
  }
}
