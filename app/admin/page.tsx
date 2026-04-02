"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { USER_ACCOUNTS_STORAGE_KEY, type UserAccount } from "../lib/auth";

type PersonalAccount = {
  id: string;
   name: string;
  loginId: string;
  password: string;
};

const ACCOUNTS_STORAGE_KEY = "admin_personal_accounts_v1";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const defaultAccounts: PersonalAccount[] = [
  {
    id: "person-1",
    name: "山田 太郎",
    loginId: "yamada.t",
    password: "pass1234",
  },
  {
    id: "person-2",
    name: "田中 花子",
    loginId: "tanaka.h",
    password: "welcome2026",
  },
];

export default function AdminHomePage() {
 const [accounts, setAccounts] = useState<PersonalAccount[]>(defaultAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccounts[0].id);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      const sharedRaw = localStorage.getItem(USER_ACCOUNTS_STORAGE_KEY);
      if (!sharedRaw) return;

      try {
        const parsedShared = JSON.parse(sharedRaw) as UserAccount[];
        if (!Array.isArray(parsedShared) || parsedShared.length === 0) return;
        const mappedAccounts = parsedShared.map((account) => ({
          id: account.id,
          name: account.username.toUpperCase(),
          loginId: account.username,
          password: account.password,
        }));
        setAccounts(mappedAccounts);
        setSelectedAccountId(mappedAccounts[0].id);
      } catch {
        // ignore broken localStorage data
      }
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersonalAccount[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      setAccounts(parsed);
      setSelectedAccountId(parsed[0].id);
    } catch {
      // ignore broken localStorage data
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    const sharedAccounts: UserAccount[] = accounts.map((account) => ({
      id: account.id,
      username: account.loginId,
      password: account.password,
      createdAt: new Date().toISOString(),
    }));
    localStorage.setItem(USER_ACCOUNTS_STORAGE_KEY, JSON.stringify(sharedAccounts));
  }, [accounts]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0],
    [accounts, selectedAccountId],
  );

  const handleCreateAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const loginId = String(formData.get("loginId") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();

    if (!name || !loginId || !password) return;


      const nextAccount: PersonalAccount = {
      id: createId(),
      name,
      loginId,
      password,
    };

    setAccounts((prev) => [...prev, nextAccount]);
     setSelectedAccountId(nextAccount.id);
    event.currentTarget.reset();
  };

  const updateSelectedAccount = (field: "loginId" | "password", value: string) => {
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
   const handleDeleteAccount = (accountId: string) => {
    setAccounts((prev) => {
      const remaining = prev.filter((account) => account.id !== accountId);
      setSelectedAccountId((current) => {
        if (current !== accountId) return current;
        return remaining[0]?.id ?? "";
      });
      return remaining;
    });
  };

  return (
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
              <span>ID</span>
              <input
                value={selectedAccount.loginId}
                onChange={(event) => updateSelectedAccount("loginId", event.target.value)}
              />
            </label>

            <label className="field">
              <span>パスワード</span>
              <input
                type={isPasswordVisible ? "text" : "password"}
                value={selectedAccount.password}
                onChange={(event) => updateSelectedAccount("password", event.target.value)}
              />
            </label>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setIsPasswordVisible((prev) => !prev)}
            >
              {isPasswordVisible ? "パスワードを隠す" : "パスワードを表示"}
            </button>
          </article>
         ) : null}
      </section>
    </main>
  );
}
