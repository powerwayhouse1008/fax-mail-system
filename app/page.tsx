import Link from "next/link";

const features = ["FAX一括送信", "Gmail配信", "送信履歴管理"];

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero-card">
        <p className="badge">日本語版スターター</p>

        <h1>FAX・Gmail一括送信システム</h1>

        <p className="description">
          Next.js + Supabase を前提にした、FAX送信・メール送信・履歴管理の初期構成です。
        </p>
       
        <ul className="feature-list" aria-label="主な機能">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>

        <div className="actions">
          <Link href="/dashboard" className="btn btn-primary">
            ダッシュボードへ
          </Link>
          <Link href="/campaigns" className="btn btn-secondary">
            キャンペーン作成
          </Link>
        </div>
      </section>
    </main>
  );
}
