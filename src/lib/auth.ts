import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export type AdminRole = "DONO" | "ATENDENTE";

export const ADMIN_COOKIE_NAME = "ahb_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_LOGIN_ATTEMPTS = 5;

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function getAdminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length > 0 ? password : null;
}

function getAtendentePassword(): string | null {
  const password = process.env.ATENDENTE_PASSWORD;
  return password && password.length > 0 ? password : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Resolve o perfil autenticado comparando a senha em tempo constante contra
 * ADMIN_PASSWORD (DONO) e ATENDENTE_PASSWORD (ATENDENTE).
 */
export function resolveAdminRoleByPassword(
  inputPassword: string
): AdminRole | null {
  const donoExpected = getAdminPassword();
  const atendenteExpected = getAtendentePassword();

  const matchesDono = donoExpected
    ? constantTimeEqual(inputPassword, donoExpected)
    : false;
  const matchesAtendente = atendenteExpected
    ? constantTimeEqual(inputPassword, atendenteExpected)
    : false;

  if (matchesDono) return "DONO";
  if (matchesAtendente) return "ATENDENTE";
  return null;
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(getSessionSecret() && getAdminPassword());
}

export function createAdminSessionToken(role: AdminRole): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado (mínimo 16 caracteres).");
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${exp}.${role}.${nonce}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(
  token: string | undefined | null
): { role: AdminRole } | null {
  if (!token) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [expStr, roleRaw, nonce, signature] = parts;
  if (!expStr || !roleRaw || !nonce || !signature) return null;
  if (roleRaw !== "DONO" && roleRaw !== "ATENDENTE") return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${expStr}.${roleRaw}.${nonce}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  if (!constantTimeEqual(signature, expectedSig)) {
    return null;
  }

  return { role: roleRaw };
}

export async function getAdminSession(): Promise<{ role: AdminRole } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return Boolean(await getAdminSession());
}

export async function requireRole(
  ...allowedRoles: AdminRole[]
): Promise<
  | { role: AdminRole; response: null }
  | { role: null; response: NextResponse }
> {
  const session = await getAdminSession();
  if (!session) {
    return {
      role: null,
      response: NextResponse.json(
        { error: "Sessão expirada ou não autorizada." },
        { status: 401 }
      ),
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      role: null,
      response: NextResponse.json(
        { error: "Acesso restrito ao perfil Dono." },
        { status: 403 }
      ),
    };
  }

  return { role: session.role, response: null };
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  const auth = await requireRole("DONO", "ATENDENTE");
  return auth.response;
}

export async function isLoginRateLimited(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const attempts = await db.loginAttempt.count({
    where: {
      ip,
      createdAt: { gte: since },
    },
  });
  return attempts >= MAX_LOGIN_ATTEMPTS;
}

export async function recordFailedLoginAttempt(ip: string): Promise<void> {
  await db.loginAttempt.create({
    data: { ip },
  });
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  await db.loginAttempt.deleteMany({
    where: { ip },
  });
}
