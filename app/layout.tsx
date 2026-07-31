import type { Metadata } from "next";
import Link from "next/link";
import LanguageSwitcher from "./components/language-switcher";
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
      <body>
        <div className="fixed left-4 top-4 z-50">
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
          >
            ← ホームページ
          </Link>
        </div>
        {children}
        <LanguageSwitcher />
      </body>
    </html>
  );
}
