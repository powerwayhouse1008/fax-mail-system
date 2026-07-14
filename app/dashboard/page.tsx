"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import AuthGuard from "../components/auth-guard";
import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/auth";

const actions = [
   
  {
    title: "FAX一括送信",
    description: "FAX送信テンプレート作成と名刺アップロードをまとめて行います。",
    href: "/fax-template?channel=fax",
    cta: "FAX送付状を作成",
  },
  {
    title: "Fax tài liệu",
    description: "Upload PDF/ảnh/tài liệu rồi gửi trực tiếp qua Fax API để đối tác nhận đầy đủ nội dung file.",
    href: "/document-fax",
    cta: "Mở fax tài liệu",
  },
  {
    title: "Gmail配信",
    description: "Gmail配信用の送付状テンプレートを作成します。",
    href: "/fax-template?channel=gmail",
    cta: "Gmail用テンプレートを作成",
  },
  {
    title: "送信履歴管理",
    description: "FAX・Gmailの送信履歴を一覧で確認します。",
    href: "/send-history",
    cta: "送信履歴を確認",
  },
];

export default function DashboardPage() {
   const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok || !mounted) return;

      const payload = (await response.json()) as { user: SessionUser };
      setSession(payload.user);
    };

    loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  const dashboardActions = useMemo(
    () =>
     session?.role === "admin"
        ? [
            ...actions,
            {
              title: "Adminホーム",
              description: "管理者向けのアカウント管理ページを開きます。",
              href: "/admin",
              cta: "Adminホームへ",
            },
           {
              title: "データ収集",
              description: "Powerway Data Spider でURL解析と連絡先収集を行います。",
              href: "/admin/data-spider",
              cta: "データ収集を開く",
            },
          ]
        : actions,
     [session?.role],
  );

const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await signOut({ callbackUrl: "/", redirect: true });
  };

  return (
    <AuthGuard>
      <main className="dashboard-shell">
        <section className="dashboard-card">
          <div className="history-header">
            <div>
              <h1>送信メニュー</h1>
              <p>以下のボタンから、見送付状テンプレート作成ページへ移動できます。</p>
            </div>
            <button className="btn btn-secondary" type="button" onClick={handleLogout}>
              ログアウト
            </button>
          </div>

          <div className="dashboard-grid">
            {dashboardActions.map((action) => (
              <article key={action.title} className="dashboard-item">
                <h2>{action.title}</h2>
                <p>{action.description}</p>
                <Link href={action.href} className="btn btn-primary">
                  {action.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
