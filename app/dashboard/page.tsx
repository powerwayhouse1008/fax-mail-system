"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../components/auth-guard";
import { useMemo } from "react";
import {
  ADMIN_CREDENTIAL,
  AUTH_COOKIE_NAME,
  AUTH_SESSION_STORAGE_KEY,
} from "../lib/auth";

const actions = [
   
  {
    title: "FAX一括送信",
    description: "FAX送信テンプレート作成と名刺アップロードをまとめて行います。",
    href: "/fax-template?channel=fax",
    cta: "FAX送付状を作成",
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

  const isAdmin = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) === ADMIN_CREDENTIAL.username
    );
  }, []);

  const dashboardActions = useMemo(
    () =>
      isAdmin
        ? [
            ...actions,
            {
              title: "Adminホーム",
              description: "管理者向けのアカウント管理ページを開きます。",
              href: "/admin",
              cta: "Adminホームへ",
            },
          ]
        : actions,
    [isAdmin],
  );


  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
    router.push("/");
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
              Đăng xuất
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
