"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Boxes,
  ClipboardList,
  ClipboardPlus,
  LogOut,
  Menu,
  Package,
  Plus,
  QrCode,
  ReceiptText,
  Store,
  Sun,
  TableProperties,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsBar } from "@/components/ui/tabs";
import { PedidosTab } from "@/components/admin/pedidos-tab";
import { GarcomTab } from "@/components/admin/garcom-tab";
import { ComandasTab } from "@/components/admin/comandas-tab";
import { BalcaoTab } from "@/components/admin/balcao-tab";
import { BalcaoVendaModal } from "@/components/admin/balcao-venda-modal";
import { EstoqueTab } from "@/components/admin/estoque-tab";
import { ProdutosTab } from "@/components/admin/produtos-tab";
import { MesasTab } from "@/components/admin/mesas-tab";
import { ResumoTab } from "@/components/admin/resumo-tab";
import { QrcodeTab } from "@/components/admin/qrcode-tab";
import { AdminPwaControls } from "@/components/admin/admin-pwa-controls";

export type TabId =
  | "pedidos"
  | "garcom"
  | "comandas"
  | "balcao"
  | "estoque"
  | "produtos"
  | "mesas"
  | "resumo"
  | "qrcode";

const VALID_TABS = new Set<TabId>([
  "pedidos",
  "garcom",
  "comandas",
  "balcao",
  "estoque",
  "produtos",
  "mesas",
  "resumo",
  "qrcode",
]);

const TAB_TITLES: Record<TabId, string> = {
  pedidos: "Pedidos",
  garcom: "Lançar pedido",
  comandas: "Comandas",
  balcao: "Balcão",
  estoque: "Estoque",
  produtos: "Produtos",
  mesas: "Mesas",
  resumo: "Dashboard",
  qrcode: "QR Code",
};

export function AdminDashboard({
  initialTab = "pedidos",
}: {
  initialTab?: TabId;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as TabId | null;
  const tab: TabId = urlTab && VALID_TABS.has(urlTab) ? urlTab : initialTab;

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [balcaoModalOpen, setBalcaoModalOpen] = React.useState(false);
  const [balcaoRefreshKey, setBalcaoRefreshKey] = React.useState(0);
  const [balcaoToast, setBalcaoToast] = React.useState<string | null>(null);
  const [openOrdersCount, setOpenOrdersCount] = React.useState<number>(0);
  const [openComandasCount, setOpenComandasCount] = React.useState<number>(0);
  const [billRequestsMesas, setBillRequestsMesas] = React.useState<
    Array<{ mesaNumero: number | null; detalhes: string | null }>
  >([]);
  const [stockAlertsCount, setStockAlertsCount] = React.useState<number>(0);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/produtos", { cache: "no-store" }),
      fetch("/api/admin/comandas?status=ABERTA", { cache: "no-store" }),
    ])
      .then(async ([prodRes, comRes]) => {
        if (!active) return;
        if (prodRes.ok) {
          const data = (await prodRes.json()) as {
            produtos: Array<{
              ativo: boolean;
              controlaEstoque: boolean;
              estoque: number;
              estoqueMinimo: number;
            }>;
          };
          if (active) {
            const alerts = data.produtos.filter(
              (p) =>
                p.ativo &&
                p.controlaEstoque &&
                (p.estoque <= 0 || p.estoque <= p.estoqueMinimo)
            ).length;
            setStockAlertsCount(alerts);
          }
        }
        if (comRes.ok) {
          const data = (await comRes.json()) as {
            comandas: Array<{
              id: string;
              mesaNumero: number | null;
              pediuConta: boolean;
              pediuContaDetalhes: string | null;
            }>;
          };
          if (active) {
            setOpenComandasCount(data.comandas.length);
            setBillRequestsMesas(
              data.comandas
                .filter((c) => c.pediuConta)
                .map((c) => ({
                  mesaNumero: c.mesaNumero,
                  detalhes: c.pediuContaDetalhes,
                }))
            );
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tab]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleTabChange = (nextTab: string) => {
    if (!VALID_TABS.has(nextTab as TabId)) return;
    setMenuOpen(false);
    if (nextTab === "estoque") {
      router.push("/admin/estoque");
      return;
    }
    router.replace(`/admin?tab=${nextTab}`, { scroll: false });
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  const navItems: Array<{
    value: TabId;
    label: string;
    badge?: number;
    icon: React.ReactNode;
  }> = [
    {
      value: "pedidos",
      label: "Pedidos",
      badge: openOrdersCount,
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      value: "garcom",
      label: "Lançar pedido",
      icon: <ClipboardPlus className="h-4 w-4" />,
    },
    {
      value: "comandas",
      label: "Comandas",
      badge: openComandasCount,
      icon: <ReceiptText className="h-4 w-4" />,
    },
    {
      value: "balcao",
      label: "Balcão",
      icon: <Store className="h-4 w-4" />,
    },
    {
      value: "estoque",
      label: "Estoque",
      badge: stockAlertsCount,
      icon: <Boxes className="h-4 w-4" />,
    },
    {
      value: "produtos",
      label: "Produtos",
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
  ];

  const totalAlerts = openOrdersCount + stockAlertsCount;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 overflow-x-hidden px-3 pb-8 pt-3 sm:gap-5 sm:px-4 sm:py-5">
      {/* Cabeçalho compacto no mobile com Menu Hambúrguer */}
      <header className="glass-bar sticky top-2 z-30 flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 md:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]">
            <Sun className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Arena Home Beach
            </p>
            <h1 className="truncate text-base font-extrabold text-[var(--foreground)]">
              {TAB_TITLES[tab]}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBalcaoModalOpen(true)}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-[var(--brand-primary)] px-2.5 text-xs font-extrabold text-[var(--brand-primary-foreground)] shadow-xs active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Balcão
          </button>

          {openOrdersCount > 0 && tab !== "pedidos" && (
            <button
              type="button"
              onClick={() => handleTabChange("pedidos")}
              className="rounded-full bg-[var(--brand-primary)] px-2.5 py-1 text-xs font-black text-[var(--brand-primary-foreground)] cursor-pointer"
            >
              {openOrdersCount} pedido{openOrdersCount > 1 ? "s" : ""}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu do painel"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white/90 text-[var(--foreground)] shadow-xs active:scale-95 cursor-pointer"
          >
            <Menu className="h-5 w-5" />
            {totalAlerts > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-primary-strong)] px-1 text-[10px] font-black text-white">
                {totalAlerts}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Drawer do menu hambúrguer mobile */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs md:hidden"
          role="dialog"
          aria-modal="true"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="glass-bar flex h-full w-80 max-w-[86vw] flex-col justify-between overflow-y-auto rounded-l-[1.75rem] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary-strong)]">
                    <Sun className="h-3.5 w-3.5" />
                    Arena Home Beach
                  </span>
                  <h2 className="text-lg font-extrabold text-[var(--foreground)]">
                    Menu do Painel
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-[var(--foreground)] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex flex-col gap-2">
                {navItems.map((item) => {
                  const active = tab === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleTabChange(item.value)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-base font-bold transition cursor-pointer ${
                        active
                          ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                          : "bg-white/75 text-[var(--foreground)] border border-[var(--border)] hover:bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {item.icon}
                        {item.label}
                      </span>
                      {typeof item.badge === "number" && item.badge > 0 && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-black ${
                            active
                              ? "bg-[var(--brand-primary-foreground)] text-white"
                              : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary-foreground)]"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  App e Alertas
                </p>
                <AdminPwaControls />
              </div>
            </div>

            <Button
              variant="outline"
              size="lg"
              onClick={() => void handleLogout()}
              className="mt-6 w-full"
            >
              <LogOut className="h-4 w-4" />
              Sair do painel
            </Button>
          </aside>
        </div>
      )}

      {/* Cabeçalho Desktop */}
      <header className="glass-card hidden flex-col gap-4 p-5 md:flex">
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

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setBalcaoModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova venda de balcão
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>

        <AdminPwaControls />
      </header>

      <div className="hidden md:block">
        <TabsBar
          value={tab}
          onValueChange={handleTabChange}
          items={navItems}
        />
      </div>

      {balcaoToast && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--brand-primary-foreground)]">
          <span>{balcaoToast}</span>
          <button
            type="button"
            onClick={() => setBalcaoToast(null)}
            className="text-xs underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {billRequestsMesas.length > 0 && (
        <button
          type="button"
          onClick={() => handleTabChange("comandas")}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400 bg-amber-50 px-4 py-3 text-left text-sm font-bold text-amber-900 shadow-xs transition hover:bg-amber-100 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <BellRing className="h-4 w-4 shrink-0 animate-pulse text-amber-700" />
            <span>
              Conta solicitada:{" "}
              {billRequestsMesas
                .map(
                  (m) =>
                    `Mesa ${m.mesaNumero ?? "-"}${
                      m.detalhes ? ` (${m.detalhes})` : ""
                    }`
                )
                .join(" · ")}
            </span>
          </span>
          <span className="text-xs underline">Ver comandas</span>
        </button>
      )}

      {tab === "pedidos" && <PedidosTab onCountChange={setOpenOrdersCount} />}
      {tab === "garcom" && (
        <GarcomTab
          onOrderCreated={() => {
            setOpenComandasCount((c) => c); // dispara refresh de contagem via callback se necessário
            fetch("/api/admin/comandas?status=ABERTA", { cache: "no-store" })
              .then(async (r) => {
                if (!r.ok) return;
                const d = (await r.json()) as { comandas: Array<{ id: string }> };
                setOpenComandasCount(d.comandas.length);
              })
              .catch(() => {});
          }}
        />
      )}
      {tab === "comandas" && (
        <ComandasTab onOpenCountChange={setOpenComandasCount} />
      )}
      {tab === "balcao" && (
        <BalcaoTab
          refreshKey={balcaoRefreshKey}
          onNewSaleClick={() => setBalcaoModalOpen(true)}
        />
      )}
      {tab === "estoque" && (
        <EstoqueTab onAlertsChange={setStockAlertsCount} />
      )}
      {tab === "produtos" && <ProdutosTab />}
      {tab === "mesas" && <MesasTab />}
      {tab === "resumo" && (
        <ResumoTab
          onOpenProdutos={() => handleTabChange("estoque")}
          onStockAlertsChange={setStockAlertsCount}
        />
      )}
      {tab === "qrcode" && <QrcodeTab />}

      <BalcaoVendaModal
        open={balcaoModalOpen}
        onOpenChange={setBalcaoModalOpen}
        onSuccess={(venda) => {
          setBalcaoRefreshKey((k) => k + 1);
          setBalcaoToast(
            `Venda de balcão #${venda.numero} registrada!${
              venda.status === "RECEBIDO"
                ? " Enviada para a fila da cozinha."
                : ""
            }`
          );
        }}
      />
    </div>
  );
}
