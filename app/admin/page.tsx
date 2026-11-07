"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { UserAccount } from "../lib/auth";
import AuthGuard from "../components/auth-guard";

type PersonalAccount = {
  id: string;
  name: string;
  loginId: string;
  password: string;
};

export default function AdminHomePage() {
  const [accounts, setAccounts] = useState<PersonalAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [changingFaxMode, setChangingFaxMode] = useState(false);
  const [faxStats, setFaxStats] = useState<{ enabled: boolean; mode: "server" | "nexlink"; document: number; template: number; failed: number } | null>(null);

  const loadFaxStats = async () => {
    const response = await fetch("/api/admin/fax-control", { cache: "no-store" });
    if (response.ok) setFaxStats(await response.json());
  };

  const loadAccounts = async () => {
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as {
        users?: UserAccount[];
        message?: string;
      } | null;

      if (!response.ok) {
        setNotice({
          type: "error",
          text: payload?.message
            ? `アカウント一覧の読み込みに失敗しました: ${payload.message}`
            : "アカウント一覧の読み込みに失敗しました。Supabase設定とusersテーブルを確認してください。",
        });
        return;
      }

      if (!Array.isArray(payload?.users)) {
        setNotice({ type: "error", text: "サーバーから不正なアカウント一覧が返されました。" });
        return;
      }

      const mapped = payload.users.map((account) => ({
        id: account.id,
        name: account.name || account.username || "(No name)",
        loginId: account.username || "(No ID)",
        // Never preload stored password hash into the editable password field.
        password: "",
      }));

      setAccounts(mapped);
      setSelectedAccountId((current) => current || mapped[0]?.id || "");
    } catch {
      setNotice({ type: "error", text: "サーバーに接続できません。24/7サーバーとSupabase接続を確認してください。" });
    }
  };

  useEffect(() => {
    loadAccounts();
    loadFaxStats();
  }, []);

  const toggleFax = async () => {
    if (!faxStats) return;
    const response = await fetch("/api/admin/fax-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !faxStats.enabled }),
    });
    if (response.ok) {
      setFaxStats(await response.json());
      setNotice({ type: "success", text: faxStats.enabled ? "FAX送信を停止しました。" : "FAX送信を有効にしました。" });
    }
  };

  const changeFaxMode = async (mode: "server" | "nexlink") => {
    if (changingFaxMode || faxStats?.mode === mode) return;

    setChangingFaxMode(true);
    try {
      const response = await fetch("/api/admin/fax-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (typeof faxStats & { message?: string })
        | null;

      if (!response.ok || !payload?.mode) {
        setNotice({ type: "error", text: payload?.message ?? "FAX送信モードの切り替えに失敗しました。" });
        return;
      }

      setFaxStats(payload);
      setNotice({
        type: "success",
        text: mode === "nexlink" ? "NEXLINK Fax APIモードに切り替えました。" : "中央サーバー経由モードに切り替えました。",
      });
    } catch {
      setNotice({ type: "error", text: "サーバーに接続できず、FAX送信モードを切り替えられませんでした。" });
    } finally {
      setChangingFaxMode(false);
    }
  };

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const loginId = String(formData.get("loginId") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();

    if (!name || !loginId || !password) return;

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        payload: { name, username: loginId, password },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: "error", text: payload?.message ?? "アカウント作成に失敗しました。" });
      return;
    }

    event.currentTarget.reset();
    await loadAccounts();
    setNotice({ type: "success", text: "アカウントを作成しました。" });
  };

  const updateSelectedAccount = (field: "name" | "loginId" | "password", value: string) => {
    if (!selectedAccount) return;

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === selectedAccount.id
          ? {
              ...account,
              [field]: value,
            }
          : account,
      ),
    );
  };

  const handleSaveAccount = async () => {
    if (!selectedAccount) return;

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        payload: {
          id: selectedAccount.id,
          name: selectedAccount.name,
          username: selectedAccount.loginId,
          ...(selectedAccount.password ? { password: selectedAccount.password } : {}),
        },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: "error", text: payload?.message ?? "アカウント更新に失敗しました。" });
      return;
    }

    setNotice({ type: "success", text: "保存しました。" });
    await loadAccounts();
  };

  const handleDeleteAccount = async (accountId: string) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", payload: { id: accountId } }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setNotice({ type: "error", text: payload?.message ?? "アカウント削除に失敗しました。" });
      return;
    }

    await loadAccounts();
     setNotice({ type: "success", text: "アカウントを削除しました。" });
  };

  return (
    <AuthGuard requiredRole="technical_admin">
      <main className="admin-shell">
        <section className="admin-card">
          <header className="admin-header">
            <div>
              <p className="badge">Admin Portal</p>
              <h1>アカウント管理</h1>
              <p>名前・ID・パスワードのみ管理し、個人ごとに保存/編集できます。</p>
            </div>
            <Link href="/dashboard" className="btn btn-secondary">
              ダッシュボードに戻る
            </Link>
            <Link href="/document-fax" className="btn btn-primary">
              サーバー/APIでFAX送信
            </Link>
          </header>

          <article className="admin-panel fax-control-panel">
            <div className="fax-control-heading"><div><h2>FAX送信モード</h2><p>全ユーザー共通の送信経路を選択します。</p></div><button type="button" className={`btn ${faxStats?.enabled ? "btn-primary" : "btn-secondary"}`} onClick={toggleFax}>FAX送信 {faxStats?.enabled ? "ON" : "OFF"}</button></div>
            <div className="fax-mode-grid">
              <button type="button" aria-pressed={faxStats?.mode === "server"} disabled={changingFaxMode} className={`fax-mode-option ${faxStats?.mode === "server" ? "active" : ""}`} onClick={() => changeFaxMode("server")}><strong>中央サーバー経由</strong><span>24/7サーバーで処理・送信</span></button>
              <button type="button" aria-pressed={faxStats?.mode === "nexlink"} disabled={changingFaxMode} className={`fax-mode-option ${faxStats?.mode === "nexlink" ? "active" : ""}`} onClick={() => changeFaxMode("nexlink")}><strong>NEXLINK Fax API</strong><span>NEXLINK API経由で送信</span></button>
            </div>
            <p>文書FAX: {faxStats?.document ?? 0}件　/　テンプレートFAX: {faxStats?.template ?? 0}件　/　失敗: {faxStats?.failed ?? 0}件</p>
            <Link href="/document-fax" className="btn btn-secondary">FAX送信画面を開く</Link>
          </article>

          <div className="admin-grid">
            <article className="admin-panel">
              <h2>新規アカウント作成</h2>
              <form className="admin-form" onSubmit={handleCreateAccount}>
                <label className="field">
                  <span>名前</span>
                  <input name="name" placeholder="例: 山田 太郎" required />
                </label>
                <label className="field">
                  <span>ID</span>
                  <input name="loginId" placeholder="例: yamada.t" required />
                </label>
                <label className="field">
                  <span>パスワード</span>
                  <input name="password" placeholder="パスワード" required />
                </label>
                <button className="btn btn-primary" type="submit">
                  アカウントを追加
                </button>
              </form>
            </article>

            <article className="admin-panel">
              <h2>登録済みアカウント一覧</h2>
              {accounts.length === 0 ? (
                <p>登録済みアカウントはありません。</p>
              ) : (
                <ul className="account-list">
                  {accounts.map((account) => (
                    <li key={account.id} className="account-list-item">
                      <button
                        type="button"
                        className={`account-item ${account.id === selectedAccount?.id ? "active" : ""}`}
                        onClick={() => setSelectedAccountId(account.id)}
                      >
                        <strong>{account.name}</strong>
                        <span>ID: {account.loginId}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary account-delete-btn"
                        onClick={() => handleDeleteAccount(account.id)}
                        aria-label={`${account.name}を削除`}
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>

          {selectedAccount ? (
            <article className="admin-panel storage-panel">
              <h2>選択中アカウントの編集</h2>
              <p>
                対象: <strong>{selectedAccount.name}</strong>
              </p>

              <label className="field">
                <span>名前</span>
                <input
                  value={selectedAccount.name}
                  onChange={(event) => updateSelectedAccount("name", event.target.value)}
                />
              </label>

              <label className="field">
                <span>ID</span>
                <input
                  value={selectedAccount.loginId}
                  onChange={(event) => updateSelectedAccount("loginId", event.target.value)}
                />
              </label>

              <label className="field">
                <span>パスワード（変更時のみ入力）</span>
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={selectedAccount.password}
                  placeholder="未変更の場合は空欄のまま"
                  onChange={(event) => updateSelectedAccount("password", event.target.value)}
                />
              </label>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                >
                  {isPasswordVisible ? "パスワードを隠す" : "パスワードを表示"}
                </button>
                <button className="btn btn-primary" type="button" onClick={handleSaveAccount}>
                  保存
                </button>
              </div>
            </article>
          ) : null}

          {notice ? (
            <p className={`send-notice ${notice.type === "success" ? "send-notice-success" : "send-notice-error"}`}>
              {notice.text}
            </p>
          ) : null}
        </section>
      </main>
    </AuthGuard>
  );
}
