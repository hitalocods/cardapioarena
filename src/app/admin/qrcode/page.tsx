import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/auth";
import { isValidHttpUrl } from "@/lib/qr-url";
import { PrintableQrClient } from "@/components/admin/printable-qr-client";

async function PrintableQrGate({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  await connection();
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect("/admin/login");
  }

  const [{ url }, mesas] = await Promise.all([
    searchParams,
    db.mesa.findMany({
      where: { ativa: true },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true },
    }),
  ]);

  const paramUrl = url?.trim();
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const initialBaseUrl = isValidHttpUrl(paramUrl)
    ? paramUrl
    : isValidHttpUrl(envUrl)
    ? envUrl
    : undefined;

  return (
    <PrintableQrClient mesas={mesas} initialBaseUrl={initialBaseUrl} />
  );
}

export default function PrintableQrPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-8">
          <div className="glass-card h-96 animate-pulse" />
        </div>
      }
    >
      <PrintableQrGate searchParams={searchParams} />
    </Suspense>
  );
}
