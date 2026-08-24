import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大屁竞速王",
  description: "双人自动消消乐竞速试玩：真实三连消除转化为屁能量，率先冲线成为史诗级大屁王。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
