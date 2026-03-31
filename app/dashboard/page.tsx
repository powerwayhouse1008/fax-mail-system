import Link from "next/link";

const actions = [
   {
    title: "名刺アップロード",
    description: "送信先として使う名刺画像やPDFを登録します。",
    href: "/business-card-upload",
    cta: "名刺をアップロード",
  },
  {
    title: "FAX一括送信",
    description: "FAX送信用の見送付状をテンプレートから作成します。",
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
