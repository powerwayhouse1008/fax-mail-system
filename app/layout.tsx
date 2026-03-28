import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAX・Gmail一括送信システム",
  description: "FAX送信・メール送信・履歴管理のためのスターターダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
     <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
