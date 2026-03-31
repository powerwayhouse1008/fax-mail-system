import Link from "next/link";

export default function CampaignsPage() {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <h1>キャンペーン作成</h1>
        <p>配信先リスト管理・配信日時設定は今後ここに追加されます。</p>
        <Link href="/dashboard" className="btn btn-secondary">
          ダッシュボードへ戻る
        </Link>
      </section>
    </main>
  );
}
