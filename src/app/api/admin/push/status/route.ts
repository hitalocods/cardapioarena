import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth";
import { getPublicVapidKey, isPushConfigured } from "@/lib/push";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

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
