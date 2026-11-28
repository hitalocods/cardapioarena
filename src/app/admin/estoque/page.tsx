import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

async function AdminEstoqueGate() {
  await connection();
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  if (session.role !== "DONO") {
    redirect("/admin?tab=pedidos");
  }
  return <AdminDashboard initialTab="estoque" role={session.role} />;
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
