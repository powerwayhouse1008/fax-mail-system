"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function HomePage() {
  const router = useRouter();
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextUrl = params.get("next") || "/dashboard";

    const checkSession = async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.ok) {
        router.replace(nextUrl);
      }
    };

    checkSession();
  }, [router]);
  const [error, setError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);


  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setPasswordLoading(true);
    
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

   const nextUrl = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      router.push(nextUrl);
    } finally {
      setPasswordLoading(false);
    }
  };
   const handleMicrosoftLogin = async () => {
    setMicrosoftLoading(true);
    const nextUrl = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      await signIn("microsoft-entra-id", { callbackUrl: nextUrl });
    setMicrosoftLoading(false);
  };

  return (
    <main className="home-shell">
      <section className="hero-card login-card">
        <p className="badge">社内システムログイン</p>
        <h1>FAX &amp; Gmail Portal</h1>
        <p className="description">Microsoft Outlookまたは従来ID/パスワードでログインしてください。</p>

        <button className="btn btn-primary" type="button" onClick={handleMicrosoftLogin} disabled={microsoftLoading}>
          {microsoftLoading ? "Redirecting..." : "Microsoftでログイン"}
        </button>

        <div style={{ margin: "14px 0", opacity: 0.75 }}>— または —</div>

        <form className="admin-form" onSubmit={handlePasswordLogin}>
          <label className="field">
            <span>ID</span>
            <input name="username" placeholder="ID" autoComplete="username" required />
          </label>
          <label className="field">
            <span>パスワード</span>
             <input name="password" type="password" placeholder="パスワード" autoComplete="current-password" required />
          </label>
          {error ? <p className="send-notice send-notice-error">{error}</p> : null}
          <button className="btn" type="submit" disabled={passwordLoading}>
            {passwordLoading ? "Đang đăng nhập..." : "ID/パスワードでログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
