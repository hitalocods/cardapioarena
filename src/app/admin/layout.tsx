import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Painel Admin · Arena Home Beach",
  description: "Painel de pedidos, produtos e locais da Arena Home Beach.",
  manifest: "/admin/manifest.webmanifest",
  icons: {
    apple: "/admin-icons/apple-touch-icon-180.png",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
