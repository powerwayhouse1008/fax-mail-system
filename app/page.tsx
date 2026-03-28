import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
      <div className="card w-full max-w-3xl p-8 lg:p-12">
        <p className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          日本語版スターター
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl">
          FAX・Gmail一括送信システム
        </h1>
        <p className="mt-4 text-slate-600">
          Next.js + Supabase を前提にした、FAX送信・メール送信・履歴管理の初期構成です。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn-primary">
            ダッシュボードへ
          </Link>
          <Link href="/campaigns" className="btn-secondary">
            キャンペーン作成
          </Link>
        </div>
      </div>
    </div>
  );
}
