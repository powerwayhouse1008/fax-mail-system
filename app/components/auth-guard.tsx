"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type AuthGuardProps = {
  children: ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!mounted) return;
    

     if (!response.ok) {
        router.replace(`/?next=${encodeURIComponent(pathname || "/dashboard")}`);
        return;
      }

      setAuthorized(true);
    };

    checkSession();

    return () => {
      mounted = false;
    };
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
