import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

function constantTimeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyAdminPassword(inputPassword: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  return constantTimeEqual(inputPassword, expected);
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(getSessionSecret() && getAdminPassword());
}

export function createAdminSessionToken(): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado (mínimo 16 caracteres).");
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${exp}.${nonce}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const secret = getSessionSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, signature] = parts;
  if (!expStr || !nonce || !signature) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const payload = `${expStr}.${nonce}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return constantTimeEqual(signature, expectedSig);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json(
      { error: "Sessão expirada ou não autorizada." },
      { status: 401 }
    );
  }
  return null;
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
