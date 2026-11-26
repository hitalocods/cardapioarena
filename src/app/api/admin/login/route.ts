import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  clearLoginAttempts,
  createAdminSessionToken,
  isAdminAuthConfigured,
  isLoginRateLimited,
  recordFailedLoginAttempt,
  verifyAdminPassword,
} from "@/lib/auth";
import { getClientIp } from "@/lib/ip";

const loginSchema = z.object({
  password: z.string().min(1, "Informe a senha."),
});

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "ADMIN_PASSWORD ou SESSION_SECRET não estão configurados no servidor.",
      },
      { status: 500 }
    );
  }

  const ip = getClientIp(request);

  if (await isLoginRateLimited(ip)) {
    return NextResponse.json(
      {
        error:
          "Muitas tentativas incorretas. Aguarde 10 minutos para tentar novamente.",
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe a senha." }, { status: 400 });
  }

  if (!verifyAdminPassword(parsed.data.password)) {
    await recordFailedLoginAttempt(ip);
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  await clearLoginAttempts(ip);
  const token = createAdminSessionToken();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
