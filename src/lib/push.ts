import { sendNotification, setVapidDetails } from "web-push";
import { db } from "@/lib/db";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:contato@arenahomebeach.com.br";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

export function getPublicVapidKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

export async function sendPushToAllAdmins(payload: PushPayload): Promise<{
  sent: number;
  removed: number;
  failed: number;
}> {
  const vapid = getVapidConfig();
  if (!vapid) {
    return { sent: 0, removed: 0, failed: 0 };
  }

  setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const subscriptions = await db.pushSubscription.findMany();
  if (subscriptions.length === 0) {
    return { sent: 0, removed: 0, failed: 0 };
  }

  const serialized = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/admin?tab=pedidos",
    tag: payload.tag ?? "ahb-novo-pedido",
  });

  const staleEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          serialized,
          { TTL: 60 }
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" &&
          err !== null &&
          "statusCode" in err &&
          typeof (err as { statusCode?: unknown }).statusCode === "number"
            ? (err as { statusCode: number }).statusCode
            : null;

        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          failed += 1;
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return {
    sent,
    removed: staleEndpoints.length,
    failed,
  };
}

export async function sendNewOrderPush(pedido: {
  numero: number;
  nomeCliente: string;
  mesaNumero: number;
  itens: Array<{ nomeSnapshot: string; quantidade: number }>;
}): Promise<void> {
  try {
    const resumoItens = pedido.itens
      .slice(0, 3)
      .map((item) => `${item.quantidade}x ${item.nomeSnapshot}`)
      .join(", ");
    const extraCount =
      pedido.itens.length > 3 ? ` +${pedido.itens.length - 3}` : "";

    // Nunca incluir telefone no payload de notificação
    await sendPushToAllAdmins({
      title: `Novo pedido · Mesa ${pedido.mesaNumero}`,
      body: `${resumoItens}${extraCount} · ${pedido.nomeCliente}`,
      url: "/admin?tab=pedidos",
      tag: `pedido-${pedido.numero}`,
    });
  } catch (error) {
    console.error("Falha não-bloqueante ao enviar push de novo pedido:", error);
  }
}
