import Link from "next/link";

const actions = [
   
  {
    title: "FAX一括送信",
   description: "FAX送信テンプレート作成と名刺アップロードをまとめて行います。",
    href: "/fax-template?channel=fax",
    cta: "FAX送付状を作成",
  },
  {
    title: "Gmail配信",
    description: "Gmail配信用の送付状テンプレートを作成します。",
    href: "/fax-template?channel=gmail",
    cta: "Gmail用テンプレートを作成",
  },
];

export default function DashboardPage() {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <h1>送信メニュー</h1>
        <p>以下のボタンから、見送付状テンプレート作成ページへ移動できます。</p>

        <div className="dashboard-grid">
          {actions.map((action) => (
            <article key={action.title} className="dashboard-item">
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
  );
}
