function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "0.0.0.0"
  );
}

export function isValidHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Garante que a URL base dos QR Codes seja sempre http(s):// válida.
 * Rejeita textos soltos (ex: "AtlasSoftware") e evita apontar para localhost
 * quando o painel estiver rodando em um domínio público real.
 */
export function resolveQrBaseUrl(
  candidate: string | undefined | null,
  fallbackOrigin: string
): string {
  const cleanFallback = fallbackOrigin.trim().replace(/\/+$/, "");
  const trimmed = candidate?.trim().replace(/\/+$/, "") ?? "";

  if (!trimmed) {
    return cleanFallback;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname
    ) {
      return cleanFallback;
    }

    if (cleanFallback && isValidHttpUrl(cleanFallback)) {
      const fallbackParsed = new URL(cleanFallback);
      if (
        isLocalHostname(parsed.hostname) &&
        !isLocalHostname(fallbackParsed.hostname)
      ) {
        return cleanFallback;
      }
    }

    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return cleanFallback;
  }
}
