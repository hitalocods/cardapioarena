import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isPushConfigured } from "@/lib/push";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export async function POST(request: Request) {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Chaves VAPID não configuradas no servidor." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Assinatura push inválida." },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    await db.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      update: {
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
      },
      create: {
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao salvar inscrição push:", error);
    return NextResponse.json(
      { error: "Erro ao ativar notificações." },
      { status: 500 }
    );
  }
}
