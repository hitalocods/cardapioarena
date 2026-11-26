import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Endpoint inválido." }, { status: 400 });
  }

  try {
    await db.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover inscrição push:", error);
    return NextResponse.json(
      { error: "Erro ao desativar notificações." },
      { status: 500 }
    );
  }
}
