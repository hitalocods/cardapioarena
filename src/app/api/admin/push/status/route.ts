import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getPublicVapidKey, isPushConfigured } from "@/lib/push";

export async function GET() {
  const auth = await requireRole("DONO", "ATENDENTE");
  if (auth.response) return auth.response;

  try {
    const subscriptionCount = await db.pushSubscription.count();
    return NextResponse.json(
      {
        configured: isPushConfigured(),
        publicKey: getPublicVapidKey(),
        subscriptionCount,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Erro ao consultar status de push:", error);
    return NextResponse.json(
      { error: "Erro ao consultar notificações." },
      { status: 500 }
    );
  }
}
