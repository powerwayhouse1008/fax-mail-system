"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import AuthGuard from "../components/auth-guard";
import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/auth";

type Locale = "en" | "ja" | "vi";

type DashboardAction = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

const detectLocale = (): Locale => {
  if (typeof window === "undefined") return "en";
  const language = window.navigator.language.toLowerCase();
  if (language.startsWith("vi")) return "vi";
  if (language.startsWith("ja")) return "ja";
  return "en";
};

const translations: Record<
  Locale,
  {
    heading: string;
    description: string;
    logout: string;
    actions: DashboardAction[];
    adminActions: DashboardAction[];
  }
> = {
  en: {
    heading: "Send menu",
    description: "Choose a workflow to create templates, send documents, or review sending history.",
    logout: "Log out",
    actions: [
      {
        title: "Bulk fax",
        description: "Create a fax cover template and attach a business card for bulk fax sending.",
        href: "/fax-template?channel=fax",
        cta: "Create fax cover",
      },
      {
        title: "Document fax",
        description: "Upload a PDF, image, or document and send the full file directly through the Fax API.",
        href: "/document-fax",
        cta: "Open document fax",
      },
      {
        title: "Gmail delivery",
        description: "Create a template for Gmail delivery.",
        href: "/fax-template?channel=gmail",
        cta: "Create Gmail template",
      },
      {
        title: "Send history",
        description: "Review fax and Gmail sending history in one place.",
        href: "/send-history",
        cta: "Open send history",
      },
    ],
    adminActions: [
      {
        title: "Admin home",
        description: "Open the account management page for administrators.",
        href: "/admin",
        cta: "Open admin home",
      },
      {
        title: "Data collection",
        description: "Use Powerway Data Spider to analyze URLs and collect contacts.",
        href: "/admin/data-spider",
        cta: "Open data collection",
      },
    ],
  },
  ja: {
    heading: "\u9001\u4fe1\u30e1\u30cb\u30e5\u30fc",
    description:
      "\u30c6\u30f3\u30d7\u30ec\u30fc\u30c8\u4f5c\u6210\u3001\u6587\u66f8\u9001\u4fe1\u3001\u9001\u4fe1\u5c65\u6b74\u78ba\u8a8d\u306e\u6a5f\u80fd\u3092\u9078\u629e\u3067\u304d\u307e\u3059\u3002",
    logout: "\u30ed\u30b0\u30a2\u30a6\u30c8",
    actions: [
      {
        title: "FAX\u4e00\u62ec\u9001\u4fe1",
        description:
          "FAX\u9001\u4fe1\u30c6\u30f3\u30d7\u30ec\u30fc\u30c8\u4f5c\u6210\u3068\u540d\u523a\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3092\u307e\u3068\u3081\u3066\u884c\u3044\u307e\u3059\u3002",
        href: "/fax-template?channel=fax",
        cta: "FAX\u9001\u4ed8\u72b6\u3092\u4f5c\u6210",
      },
      {
        title: "\u6587\u66f8FAX",
        description:
          "PDF\u30fb\u753b\u50cf\u30fb\u6587\u66f8\u3092\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3057\u3001Fax API\u7d4c\u7531\u3067\u6587\u66f8\u5168\u4f53\u3092\u9001\u4fe1\u3057\u307e\u3059\u3002",
        href: "/document-fax",
        cta: "\u6587\u66f8FAX\u3092\u958b\u304f",
      },
      {
        title: "Gmail\u914d\u4fe1",
        description: "Gmail\u914d\u4fe1\u7528\u306e\u9001\u4ed8\u72b6\u30c6\u30f3\u30d7\u30ec\u30fc\u30c8\u3092\u4f5c\u6210\u3057\u307e\u3059\u3002",
        href: "/fax-template?channel=gmail",
        cta: "Gmail\u7528\u30c6\u30f3\u30d7\u30ec\u30fc\u30c8\u3092\u4f5c\u6210",
      },
      {
        title: "\u9001\u4fe1\u5c65\u6b74\u7ba1\u7406",
        description: "FAX\u30fbGmail\u306e\u9001\u4fe1\u5c65\u6b74\u3092\u4e00\u89a7\u3067\u78ba\u8a8d\u3057\u307e\u3059\u3002",
        href: "/send-history",
        cta: "\u9001\u4fe1\u5c65\u6b74\u3092\u78ba\u8a8d",
      },
    ],
    adminActions: [
      {
        title: "Admin\u30db\u30fc\u30e0",
        description: "\u7ba1\u7406\u8005\u5411\u3051\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u7ba1\u7406\u30da\u30fc\u30b8\u3092\u958b\u304d\u307e\u3059\u3002",
        href: "/admin",
        cta: "Admin\u30db\u30fc\u30e0\u3078",
      },
      {
        title: "\u30c7\u30fc\u30bf\u53ce\u96c6",
        description: "Powerway Data Spider\u3067URL\u89e3\u6790\u3068\u9023\u7d61\u5148\u53ce\u96c6\u3092\u884c\u3044\u307e\u3059\u3002",
        href: "/admin/data-spider",
        cta: "\u30c7\u30fc\u30bf\u53ce\u96c6\u3092\u958b\u304f",
      },
    ],
  },
  vi: {
    heading: "Menu g\u1eedi",
    description: "Ch\u1ecdn ch\u1ee9c n\u0103ng \u0111\u1ec3 t\u1ea1o m\u1eabu, fax t\u00e0i li\u1ec7u ho\u1eb7c xem l\u1ecbch s\u1eed g\u1eedi.",
    logout: "\u0110\u0103ng xu\u1ea5t",
    actions: [
      {
        title: "G\u1eedi fax h\u00e0ng lo\u1ea1t",
        description: "T\u1ea1o m\u1eabu b\u00eca fax v\u00e0 upload danh thi\u1ebfp \u0111\u1ec3 g\u1eedi fax h\u00e0ng lo\u1ea1t.",
        href: "/fax-template?channel=fax",
        cta: "T\u1ea1o b\u00eca fax",
      },
      {
        title: "Fax t\u00e0i li\u1ec7u",
        description:
          "Upload PDF, \u1ea3nh ho\u1eb7c t\u00e0i li\u1ec7u r\u1ed3i g\u1eedi \u0111\u1ea7y \u0111\u1ee7 file qua Fax API.",
        href: "/document-fax",
        cta: "M\u1edf fax t\u00e0i li\u1ec7u",
      },
      {
        title: "G\u1eedi Gmail",
        description: "T\u1ea1o m\u1eabu n\u1ed9i dung \u0111\u1ec3 g\u1eedi qua Gmail.",
        href: "/fax-template?channel=gmail",
        cta: "T\u1ea1o m\u1eabu Gmail",
      },
      {
        title: "L\u1ecbch s\u1eed g\u1eedi",
        description: "Xem l\u1ecbch s\u1eed g\u1eedi FAX v\u00e0 Gmail trong m\u1ed9t danh s\u00e1ch.",
        href: "/send-history",
        cta: "Xem l\u1ecbch s\u1eed",
      },
    ],
    adminActions: [
      {
        title: "Trang admin",
        description: "M\u1edf trang qu\u1ea3n l\u00fd t\u00e0i kho\u1ea3n cho qu\u1ea3n tr\u1ecb vi\u00ean.",
        href: "/admin",
        cta: "M\u1edf admin",
      },
      {
        title: "Thu th\u1eadp d\u1eef li\u1ec7u",
        description: "D\u00f9ng Powerway Data Spider \u0111\u1ec3 ph\u00e2n t\u00edch URL v\u00e0 thu th\u1eadp li\u00ean h\u1ec7.",
        href: "/admin/data-spider",
        cta: "M\u1edf thu th\u1eadp",
      },
    ],
  },
};

export default function DashboardPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    setLocale(detectLocale());
    let mounted = true;

    const loadSession = async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok || !mounted) return;

      const payload = (await response.json()) as { user: SessionUser };
      setSession(payload.user);
    };

    loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  const t = translations[locale];
  const dashboardActions = useMemo(
    () => (session?.role === "admin" ? [...t.actions, ...t.adminActions] : t.actions),
    [session?.role, t],
  );

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await signOut({ callbackUrl: "/", redirect: true });
  };

  return (
    <AuthGuard>
      <main className="dashboard-shell">
        <section className="dashboard-card">
          <div className="history-header">
            <div>
              <h1>{t.heading}</h1>
              <p>{t.description}</p>
            </div>
            <button className="btn btn-secondary" type="button" onClick={handleLogout}>
              {t.logout}
            </button>
          </div>

          <div className="dashboard-grid">
            {dashboardActions.map((action) => (
              <article key={action.href} className="dashboard-item">
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
