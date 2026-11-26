import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { isPushConfigured, sendPushToAllAdmins } from "@/lib/push";

export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Chaves VAPID não configuradas no servidor." },
      { status: 500 }
    );
  }

  try {
    const result = await sendPushToAllAdmins({
      title: "Arena Home Beach — Teste",
      body: "As notificações de novos pedidos estão funcionando!",
      url: "/admin?tab=pedidos",
      tag: "ahb-teste",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Erro ao enviar push de teste:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar notificação de teste." },
      { status: 500 }
    );
  }
}
