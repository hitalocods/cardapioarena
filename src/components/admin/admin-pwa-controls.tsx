"use client";

import * as React from "react";
import { Bell, BellOff, Download, Loader2, Send, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const emptySubscribe = () => () => {};

export function AdminPwaControls() {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [installedNow, setInstalledNow] = React.useState(false);
  const isStandaloneSnapshot = React.useSyncExternalStore(
    emptySubscribe,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as { standalone?: boolean }).standalone),
    () => true
  );
  const isStandalone = installedNow || isStandaloneSnapshot;
  const isIos = React.useSyncExternalStore(
    emptySubscribe,
    () =>
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream,
    () => false
  );
  const [iosGuideOpen, setIosGuideOpen] = React.useState(false);

  const [swRegistration, setSwRegistration] =
    React.useState<ServiceWorkerRegistration | null>(null);
  const [pushConfigured, setPushConfigured] = React.useState(false);
  const [vapidPublicKey, setVapidPublicKey] = React.useState<string | null>(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null
  );
  const [pushSubscribed, setPushSubscribed] = React.useState(false);
  const [pushLoading, setPushLoading] = React.useState(false);
  const [pushMessage, setPushMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onAppInstalled = () => {
      setInstalledNow(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onAppInstalled);

    // Registra Service Worker estritamente no escopo /admin
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/admin/sw.js", { scope: "/admin" })
        .then(async (reg) => {
          setSwRegistration(reg);
          if ("pushManager" in reg) {
            const sub = await reg.pushManager.getSubscription();
            setPushSubscribed(Boolean(sub));
          }
        })
        .catch(() => {
          // Navegador pode bloquear SW em HTTP sem localhost
        });
    }

    fetch("/api/admin/push/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            configured?: boolean;
            publicKey?: string | null;
          } | null
        ) => {
          if (data) {
            setPushConfigured(Boolean(data.configured));
            if (data.publicKey) {
              setVapidPublicKey(data.publicKey);
            }
          }
        }
      )
      .catch(() => {});

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setInstalledNow(true);
      }
      return;
    }

    if (isIos) {
      setIosGuideOpen(true);
    }
  };

  const handleEnablePush = async () => {
    setPushMessage(null);
    if (!("Notification" in window) || !swRegistration) {
      setPushMessage(
        "Este navegador não suporta notificações push neste contexto."
      );
      return;
    }

    if (!pushConfigured || !vapidPublicKey) {
      setPushMessage(
        "Chaves VAPID não configuradas no ambiente do servidor."
      );
      return;
    }

    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage("Permissão de notificação negada no navegador.");
        return;
      }

      const existing = await swRegistration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setPushMessage("Não foi possível obter as chaves da inscrição push.");
        return;
      }

      const res = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setPushMessage(err.error ?? "Erro ao salvar inscrição.");
        return;
      }

      setPushSubscribed(true);
      setPushMessage("Notificações ativadas neste dispositivo.");
    } catch {
      setPushMessage("Falha ao ativar notificações neste navegador.");
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    if (!swRegistration) return;
    setPushLoading(true);
    setPushMessage(null);
    try {
      const sub = await swRegistration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
      setPushMessage("Notificações desativadas neste dispositivo.");
    } catch {
      setPushMessage("Erro ao desativar notificações.");
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestPush = async () => {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const res = await fetch("/api/admin/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPushMessage(data.error ?? "Erro ao enviar teste.");
        return;
      }
      setPushMessage(`Teste enviado (${data.sent ?? 0} dispositivo(s)).`);
    } catch {
      setPushMessage("Falha de conexão ao testar push.");
    } finally {
      setPushLoading(false);
    }
  };

  const showInstallButton = !isStandalone && (Boolean(deferredPrompt) || isIos);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showInstallButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleInstallClick()}
          >
            <Download className="h-4 w-4" />
            Instalar painel
          </Button>
        )}

        {!pushSubscribed ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pushLoading}
            onClick={() => void handleEnablePush()}
          >
            {pushLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            Ativar notificações
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={pushLoading}
              onClick={() => void handleTestPush()}
            >
              <Send className="h-4 w-4" />
              Testar push
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pushLoading}
              onClick={() => void handleDisablePush()}
            >
              <BellOff className="h-4 w-4" />
              Desativar notificações
            </Button>
          </>
        )}
      </div>

      {pushMessage && (
        <p className="text-xs font-medium text-[var(--muted-foreground)]">
          {pushMessage}
        </p>
      )}

      <Dialog
        open={iosGuideOpen}
        onOpenChange={setIosGuideOpen}
        title="Instalar painel no iPhone / iPad"
        description="Adicione o painel à sua Tela de Início para receber alertas e abrir em tela cheia."
      >
        <ol className="flex flex-col gap-3 text-sm text-[var(--foreground)]">
          <li className="flex items-center gap-2.5 rounded-2xl bg-[var(--surface-subtle)] p-3">
            <Share className="h-5 w-5 shrink-0 text-[var(--brand-primary-strong)]" />
            <span>
              1. Toque em <strong>Compartilhar</strong> na barra do Safari.
            </span>
          </li>
          <li className="rounded-2xl bg-[var(--surface-subtle)] p-3">
            2. Role para baixo e toque em{" "}
            <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li className="rounded-2xl bg-[var(--surface-subtle)] p-3">
            3. Toque em <strong>Adicionar</strong> e abra o ícone do Painel
            Arena Home Beach.
          </li>
        </ol>
      </Dialog>
    </div>
  );
}
