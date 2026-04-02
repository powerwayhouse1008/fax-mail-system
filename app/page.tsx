"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });

    if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "ログインに失敗しました。");
        return;
      }

   const nextUrl =
        new URLSearchParams(window.location.search).get("next") || "/dashboard";
      router.push(nextUrl);
    } finally {
      setLoading(false);
    }
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
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "ログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
