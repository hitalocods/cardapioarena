"use client";

import * as React from "react";

/**
 * Mantém a tela acordada via Screen Wake Lock API enquanto o componente está montado
 * e a aba está visível, reativando automaticamente no visibilitychange.
 */
export function useWakeLock(enabled: boolean): {
  supported: boolean | null;
  active: boolean;
} {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      const timer = window.setTimeout(() => setActive(false), 0);
      return () => window.clearTimeout(timer);
    }

    const hasWakeLock =
      typeof navigator !== "undefined" &&
      "wakeLock" in navigator &&
      Boolean(navigator.wakeLock) &&
      typeof navigator.wakeLock.request === "function";

    const supportTimer = window.setTimeout(() => {
      setSupported(hasWakeLock);
    }, 0);

    if (!hasWakeLock) {
      return () => {
        window.clearTimeout(supportTimer);
      };
    }

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const onRelease = () => {
      if (!cancelled) {
        setActive(false);
      }
      sentinel = null;
    };

    const requestWakeLock = async () => {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }
      if (sentinel && !sentinel.released) {
        return;
      }
      try {
        const nextSentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await nextSentinel.release().catch(() => {});
          return;
        }
        sentinel = nextSentinel;
        sentinel.addEventListener("release", onRelease);
        setActive(true);
      } catch {
        if (!cancelled) {
          setActive(false);
        }
      }
    };

    const initReqTimer = window.setTimeout(() => {
      void requestWakeLock();
    }, 0);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(supportTimer);
      window.clearTimeout(initReqTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel) {
        sentinel.removeEventListener("release", onRelease);
        void sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [enabled]);

  return { supported, active };
}
