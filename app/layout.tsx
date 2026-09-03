import type { Metadata, Viewport } from "next";
import "../style.css";

const basePath = process.env.GITHUB_ACTIONS === "true" ? "/memo-app" : "";

export const metadata: Metadata = {
  title: "memo — your quiet space",
  description: "考えを静かに整理するためのメモ帳アプリ",
  icons: {
    icon: `${basePath}/icon.svg`,
    apple: `${basePath}/icon.svg`
  },
  manifest: `${basePath}/manifest.webmanifest`
};

export const viewport: Viewport = {
  themeColor: "#e9f5ee",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
