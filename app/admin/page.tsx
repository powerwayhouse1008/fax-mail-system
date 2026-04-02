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
  const [notice, setNotice] = useState("");

  const loadAccounts = async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (!response.ok) {
      setNotice("アカウント一覧の読み込みに失敗しました。");
      return;
    }

    const payload = (await response.json()) as {
      users: Array<Omit<UserAccount, "password">>;
    };

    const mapped = payload.users.map((account) => ({
      id: account.id,
      name: account.name || account.username,
      loginId: account.username,
      password: "",
    }));

    setAccounts(mapped);
    setSelectedAccountId((current) => current || mapped[0]?.id || "");
    setNotice("");
  };

  useEffect(() => {
    loadAccounts();
  }, []);

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
      setNotice(payload?.message ?? "アカウント作成に失敗しました。");
      return;
    }

    event.currentTarget.reset();
    await loadAccounts();
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
      setNotice(payload?.message ?? "アカウント更新に失敗しました。");
      return;
    }

    setNotice("保存しました。");
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
      setNotice(payload?.message ?? "アカウント削除に失敗しました。");
      return;
    }

    await loadAccounts();
  };

  return (
    <AuthGuard>
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
          </header>

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

          {notice ? <p className="send-notice send-notice-error">{notice}</p> : null}
        </section>
      </main>
    </AuthGuard>
  );
}
