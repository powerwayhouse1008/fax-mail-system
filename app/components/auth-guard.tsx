"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_COOKIE_NAME, AUTH_SESSION_STORAGE_KEY } from "../lib/auth";

type AuthGuardProps = {
  children: ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const sessionUser = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!sessionUser) {
      router.replace(`/?next=${encodeURIComponent(pathname || "/dashboard")}`);
      return;
    }

    document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 12}; samesite=lax`;
    setAuthorized(true);
  }, [pathname, router]);

  if (!authorized) {
    return (
      <main className="home-shell">
        <section className="hero-card">
          <h1>Đang kiểm tra đăng nhập...</h1>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
