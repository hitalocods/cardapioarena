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
  RefreshCw,
  Store,
  TableProperties,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsBar } from "@/components/ui/tabs";
import type { AdminRole } from "@/lib/auth";
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

const DONO_ONLY_TABS = new Set<TabId>([
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
  role = "DONO",
}: {
  initialTab?: TabId;
  role?: AdminRole;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as TabId | null;
  const candidateTab: TabId =
    urlTab && VALID_TABS.has(urlTab) ? urlTab : initialTab;
  const tab: TabId =
    role !== "DONO" && DONO_ONLY_TABS.has(candidateTab)
      ? "pedidos"
      : candidateTab;

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mobileComandaDetailOpen, setMobileComandaDetailOpen] =
    React.useState(false);
  const [balcaoModalOpen, setBalcaoModalOpen] = React.useState(false);
  const [balcaoRefreshKey, setBalcaoRefreshKey] = React.useState(0);
  const [balcaoToast, setBalcaoToast] = React.useState<string | null>(null);
  const [openOrdersCount, setOpenOrdersCount] = React.useState<number>(0);
  const [openComandasCount, setOpenComandasCount] = React.useState<number>(0);
  const [billRequestsMesas, setBillRequestsMesas] = React.useState<
    Array<{ mesaNumero: number | null; detalhes: string | null }>
  >([]);
  const [stockAlertsCount, setStockAlertsCount] = React.useState<number>(0);
  const menuTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const closeMenuBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const wasMenuOpenRef = React.useRef(false);

  React.useEffect(() => {
    let active = true;
    const requests: Promise<Response>[] = [
      fetch("/api/admin/comandas?status=ABERTA", { cache: "no-store" }),
    ];
    if (role === "DONO") {
      requests.push(fetch("/api/admin/produtos", { cache: "no-store" }));
    }

    Promise.all(requests)
      .then(async ([comRes, prodRes]) => {
        if (!active) return;
        if (prodRes && prodRes.ok) {
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
        if (comRes && comRes.ok) {
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
  }, [role, tab]);

  React.useEffect(() => {
    if (menuOpen) {
      wasMenuOpenRef.current = true;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const focusTimer = window.setTimeout(() => {
        closeMenuBtnRef.current?.focus();
      }, 0);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMenuOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.clearTimeout(focusTimer);
        window.removeEventListener("keydown", onKey);
      };
    }

    if (wasMenuOpenRef.current) {
      wasMenuOpenRef.current = false;
      menuTriggerRef.current?.focus();
    }
    return undefined;
  }, [menuOpen]);

  const handleTabChange = (nextTab: string) => {
    if (!VALID_TABS.has(nextTab as TabId)) return;
    if (role !== "DONO" && DONO_ONLY_TABS.has(nextTab as TabId)) return;
    setMenuOpen(false);
    if (nextTab !== "comandas") {
      setMobileComandaDetailOpen(false);
    }
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
    alertBadge?: string;
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
      alertBadge:
        billRequestsMesas.length > 0
          ? `${billRequestsMesas.length} conta`
          : undefined,
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

  const visibleNavItems = navItems.filter(
    (item) => role === "DONO" || !DONO_ONLY_TABS.has(item.value)
  );
  const roleLabel = role === "DONO" ? "Dono" : "Atendente";
  const totalAlerts =
    openOrdersCount +
    billRequestsMesas.length +
    (role === "DONO" ? stockAlertsCount : 0);
  const showMobileQuickBar = tab !== "garcom" && !mobileComandaDetailOpen;

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-4 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:gap-5 sm:px-5 sm:py-5 ${
        showMobileQuickBar
          ? "pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-8"
          : "pb-8"
      }`}
    >
      {/* Cabeçalho fixo no mobile com contador de pedidos, alerta de conta e Menu Hambúrguer */}
      <header className="glass-bar sticky top-[calc(0.5rem+env(safe-area-inset-top))] z-30 flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-white p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Arena Home Beach"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Arena Home Beach · {roleLabel}
            </p>
            <h1 className="truncate text-sm font-extrabold text-[var(--foreground)] sm:text-base">
              {TAB_TITLES[tab]}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {billRequestsMesas.length > 0 && (
            <button
              type="button"
              onClick={() => handleTabChange("comandas")}
              aria-label={`${billRequestsMesas.length} mesa(s) pediu a conta`}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-amber-400 bg-amber-100 px-2.5 text-xs font-black text-amber-900 shadow-xs active:scale-95 cursor-pointer"
            >
              <BellRing className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-700" />
              <span className="hidden xs:inline">Conta</span>
              <span>({billRequestsMesas.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleTabChange("pedidos")}
            aria-label={`${openOrdersCount} pedido(s) aberto(s)`}
            className={`inline-flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-xs font-black shadow-xs active:scale-95 cursor-pointer ${
              openOrdersCount > 0
                ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                : "border border-[var(--border)] bg-white/90 text-[var(--foreground)]"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0" />
            <span>{openOrdersCount}</span>
          </button>

          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu do painel"
            aria-expanded={menuOpen}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-white/90 text-[var(--foreground)] shadow-xs active:scale-95 cursor-pointer"
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
          aria-label="Menu do painel administrativo"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="glass-bar flex h-dvh w-[86vw] max-w-sm flex-col justify-between overflow-y-auto rounded-l-[1.75rem] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo.png"
                      alt="Arena Home Beach"
                      className="h-7 w-7 shrink-0 rounded-lg border border-[var(--border)] bg-white object-contain p-0.5"
                    />
                    <span className="text-xs font-bold text-[var(--brand-primary-strong)]">
                      Arena Home Beach
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-extrabold text-[var(--foreground)]">
                    Menu do Painel
                  </h2>
                  <span className="mt-1 inline-flex items-center rounded-full bg-[var(--brand-primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--brand-primary-foreground)]">
                    Perfil: {roleLabel}
                  </span>
                </div>
                <button
                  ref={closeMenuBtnRef}
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/5 text-[var(--foreground)] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex flex-col gap-2" aria-label="Navegação do painel">
                {visibleNavItems.map((item) => {
                  const active = tab === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleTabChange(item.value)}
                      className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl px-4 py-3 text-base font-bold transition cursor-pointer ${
                        active
                          ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-xs"
                          : "border border-[var(--border)] bg-white/80 text-[var(--foreground)] hover:bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.label}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {item.alertBadge && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">
                            <BellRing className="h-3 w-3" />
                            {item.alertBadge}
                          </span>
                        )}
                        {typeof item.badge === "number" && item.badge > 0 && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                              active
                                ? "bg-[var(--brand-primary-foreground)] text-white"
                                : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary-foreground)]"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  App e Alertas
                </p>
                <AdminPwaControls role={role} />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 border-t border-[var(--border)] pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={() => window.location.reload()}
                className="min-h-12 w-full"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar painel
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => void handleLogout()}
                className="min-h-12 w-full border-[var(--destructive)]/30 text-[var(--destructive)]"
              >
                <LogOut className="h-4 w-4" />
                Sair do painel
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Cabeçalho Tablet / Desktop */}
      <header className="glass-card hidden flex-col gap-4 p-5 md:flex">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-1 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Arena Home Beach"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand-primary-foreground)]">
                Arena Home Beach · {roleLabel}
              </div>
              <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                Atendimento e Cardápio
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={tab === "garcom" ? "secondary" : "outline"}
              size="default"
              onClick={() => handleTabChange("garcom")}
            >
              <ClipboardPlus className="h-4 w-4" />
              Lançar pedido
            </Button>

            <Button size="default" onClick={() => setBalcaoModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova venda de balcão
            </Button>

            <Button
              variant="outline"
              size="default"
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>

        <AdminPwaControls role={role} />
      </header>

      <div className="hidden md:block">
        <TabsBar
          value={tab}
          onValueChange={handleTabChange}
          items={visibleNavItems}
        />
      </div>

      {balcaoToast && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-bold text-[var(--brand-primary-foreground)]">
          <span className="break-words">{balcaoToast}</span>
          <button
            type="button"
            onClick={() => setBalcaoToast(null)}
            className="min-h-11 px-2 text-xs underline cursor-pointer sm:min-h-0"
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
          <span className="flex min-w-0 items-center gap-2">
            <BellRing className="h-4 w-4 shrink-0 animate-pulse text-amber-700" />
            <span className="break-words">
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
            setOpenComandasCount((c) => c);
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
        <ComandasTab
          role={role}
          onOpenCountChange={setOpenComandasCount}
          onMobileDetailOpenChange={setMobileComandaDetailOpen}
        />
      )}
      {tab === "balcao" && (
        <BalcaoTab
          role={role}
          refreshKey={balcaoRefreshKey}
          onNewSaleClick={() => setBalcaoModalOpen(true)}
        />
      )}
      {role === "DONO" && tab === "estoque" && (
        <EstoqueTab onAlertsChange={setStockAlertsCount} />
      )}
      {role === "DONO" && tab === "produtos" && <ProdutosTab />}
      {role === "DONO" && tab === "mesas" && <MesasTab />}
      {role === "DONO" && tab === "resumo" && (
        <ResumoTab
          onOpenProdutos={() => handleTabChange("estoque")}
          onStockAlertsChange={setStockAlertsCount}
        />
      )}
      {role === "DONO" && tab === "qrcode" && <QrcodeTab />}

      {/* Ações rápidas fixas no rodapé mobile */}
      {showMobileQuickBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface-glass-strong)] px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleTabChange("garcom")}
              className="min-h-11 w-full bg-white text-xs sm:text-sm"
            >
              <ClipboardPlus className="h-4 w-4 shrink-0" />
              <span className="truncate">Lançar pedido</span>
            </Button>
            <Button
              type="button"
              onClick={() => setBalcaoModalOpen(true)}
              className="min-h-11 w-full text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">Venda balcão</span>
            </Button>
          </div>
        </div>
      )}

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
