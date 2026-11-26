import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

async function AdminEstoqueGate() {
  await connection();
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect("/admin/login");
  }
  return <AdminDashboard initialTab="estoque" />;
}

export default function AdminEstoquePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-5">
          <div className="glass-card h-24 animate-pulse" />
          <div className="glass-card h-64 animate-pulse" />
        </div>
      }
    >
      <AdminEstoqueGate />
    </Suspense>
  );
}
