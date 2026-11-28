import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const updateMesaSchema = z.object({
  ativa: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("DONO");
  if (auth.response) return auth.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = updateMesaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const mesa = await db.mesa.update({
      where: { id },
      data: { ativa: parsed.data.ativa },
    });
    return NextResponse.json({ mesa });
  } catch (error) {
    console.error("Erro ao atualizar mesa:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar mesa." },
      { status: 400 }
    );
  }
}
