export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  let raw = "";

  if (xff) {
    raw = xff.split(",")[0]?.trim() ?? "";
  }

  if (!raw) {
    raw = request.headers.get("x-real-ip")?.trim() ?? "";
  }

  if (!raw) {
    return "unknown";
  }

  if (raw.startsWith("::ffff:")) {
    raw = raw.slice(7);
  }

  return raw.slice(0, 64) || "unknown";
}
