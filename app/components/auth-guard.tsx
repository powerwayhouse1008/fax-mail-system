"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type AuthGuardProps = {
  children: ReactNode;
  requiredRole?: "admin" | "user";
};

export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
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
       const payload = (await response.json()) as {
        user?: {
          role?: "admin" | "user";
        };
      };

      if (requiredRole && payload.user?.role !== requiredRole) {
        router.replace("/dashboard");
        return;
      }


      setAuthorized(true);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, [pathname, requiredRole, router]);


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
