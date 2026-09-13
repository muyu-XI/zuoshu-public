import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import Pwa from "@/components/layout/Pwa";
export const metadata: Metadata = {
  title: "作数｜专注、记录、复盘",
  description: "计划、专注、回顾，让每一天留下痕迹。",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "作数" },
  icons: { icon: { url: "/brand-logo.png", type: "image/png" }, apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f5ef",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
        <Pwa />
      </body>
    </html>
  );
}
