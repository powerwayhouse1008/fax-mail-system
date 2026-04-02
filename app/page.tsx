"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ADMIN_CREDENTIAL,
  AUTH_COOKIE_NAME,
  AUTH_SESSION_STORAGE_KEY,
  DEFAULT_USER_ACCOUNTS,
  USER_ACCOUNTS_STORAGE_KEY,
  type UserAccount,
} from "./lib/auth";

export default function HomePage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const accountsJson = window.localStorage.getItem(USER_ACCOUNTS_STORAGE_KEY);
    if (!accountsJson) {
      window.localStorage.setItem(
        USER_ACCOUNTS_STORAGE_KEY,
        JSON.stringify(DEFAULT_USER_ACCOUNTS),
      );
    }
  }, []);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const normalizeCredential = (value: FormDataEntryValue | null) =>
      String(value ?? "")
        .normalize("NFKC")
        .trim()
        .replace(/\u00A0|\u3000/g, " ");

    const username = normalizeCredential(formData.get("username"));
    const password = normalizeCredential(formData.get("password"));

    if (!username || !password) {
      setError("ID.パスワードを入力してください.");
      return;
    }

    const accountsJson = window.localStorage.getItem(USER_ACCOUNTS_STORAGE_KEY);
    const accounts: UserAccount[] = accountsJson
      ? JSON.parse(accountsJson)
      : DEFAULT_USER_ACCOUNTS;

   const matchedAccount = accounts.find(
      (account) => account.username === username && account.password === password,
    );
    const isAdminCredentialMatch =
      username === ADMIN_CREDENTIAL.username && password === ADMIN_CREDENTIAL.password;
    if (!matchedAccount && !isAdminCredentialMatch) {
      setError("ID・パスワードを間違いました");
      return;
    }

     window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      matchedAccount?.username ?? ADMIN_CREDENTIAL.username,
    );
    document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 12}; samesite=lax`;

    const nextUrl =
      new URLSearchParams(window.location.search).get("next") || "/dashboard";
    router.push(nextUrl);
  };

  return (
    <main className="home-shell">
      <section className="hero-card login-card">
        <p className="badge">Adminロクイン</p>
        <h1>FAX &amp; Gmail Portal</h1>

        <p className="description">FAX送信・メール送信・履歴管理の初期構成です。</p>
        <form className="admin-form" onSubmit={handleLogin}>
          <label className="field">
            <span>ID</span>
            <input
              name="username"
              placeholder="ID"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          <label className="field">
            <span>パスワード</span>
             <input
              name="password"
              type="password"
              placeholder="パスワード"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          {error ? <p className="send-notice send-notice-error">{error}</p> : null}
          <button className="btn btn-primary" type="submit">
            ログイン
          </button>
        </form>
      </section>
    </main>
  );
}
