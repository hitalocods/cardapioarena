"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  LogOut,
  Package,
  QrCode,
  Sun,
  TableProperties,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsBar } from "@/components/ui/tabs";
import { PedidosTab } from "@/components/admin/pedidos-tab";
import { ProdutosTab } from "@/components/admin/produtos-tab";
import { MesasTab } from "@/components/admin/mesas-tab";
import { ResumoTab } from "@/components/admin/resumo-tab";
import { QrcodeTab } from "@/components/admin/qrcode-tab";
import { AdminPwaControls } from "@/components/admin/admin-pwa-controls";

type TabId = "pedidos" | "produtos" | "mesas" | "resumo" | "qrcode";

const VALID_TABS = new Set<TabId>([
  "pedidos",
  "produtos",
  "mesas",
  "resumo",
  "qrcode",
]);

export function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as TabId | null;
  const tab: TabId = urlTab && VALID_TABS.has(urlTab) ? urlTab : "pedidos";
  const [openOrdersCount, setOpenOrdersCount] = React.useState<number>(0);
  const [stockAlertsCount, setStockAlertsCount] = React.useState<number>(0);

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin/produtos", { cache: "no-store" })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const data = (await res.json()) as {
          produtos: Array<{
            ativo: boolean;
            controlaEstoque: boolean;
            estoque: number;
            estoqueMinimo: number;
          }>;
        };
        if (!active) return;
        const alerts = data.produtos.filter(
          (p) =>
            p.ativo &&
            p.controlaEstoque &&
            (p.estoque <= 0 || p.estoque <= p.estoqueMinimo)
        ).length;
        setStockAlertsCount(alerts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tab]);

  const handleTabChange = (nextTab: string) => {
    if (VALID_TABS.has(nextTab as TabId)) {
      router.replace(`/admin?tab=${nextTab}`, { scroll: false });
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 py-5">
      {/* Cabeçalho */}
      <header className="glass-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary-foreground)]">
              <Sun className="h-3.5 w-3.5 text-[var(--brand-primary-strong)]" />
              Arena Home Beach · Painel
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
              Atendimento e Cardápio
            </h1>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>

        <AdminPwaControls />
      </header>

      <TabsBar
        value={tab}
        onValueChange={handleTabChange}
        items={[
          {
            value: "pedidos",
            label: "Pedidos",
            badge: openOrdersCount,
            icon: <ClipboardList className="h-4 w-4" />,
          },
          {
            value: "produtos",
            label: "Produtos",
            badge: stockAlertsCount,
            icon: <Package className="h-4 w-4" />,
          },
          {
            value: "mesas",
            label: "Mesas",
            icon: <TableProperties className="h-4 w-4" />,
          },
          {
            value: "resumo",
            label: "Dashboard",
            icon: <BarChart3 className="h-4 w-4" />,
          },
          {
            value: "qrcode",
            label: "QR Code",
            icon: <QrCode className="h-4 w-4" />,
          },
        ]}
      />

      {tab === "pedidos" && <PedidosTab onCountChange={setOpenOrdersCount} />}
      {tab === "produtos" && <ProdutosTab />}
      {tab === "mesas" && <MesasTab />}
      {tab === "resumo" && (
        <ResumoTab
          onOpenProdutos={() => handleTabChange("produtos")}
          onStockAlertsChange={setStockAlertsCount}
        />
      )}
      {tab === "qrcode" && <QrcodeTab />}
    </div>
  );
}
