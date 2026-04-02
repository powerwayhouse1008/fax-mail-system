import Link from "next/link";

type SendChannel = "fax" | "gmail";
type SendStatus = "success" | "failed" | "sending";

type SendHistoryItem = {
  id: string;
  channel: SendChannel;
  recipient: string;
  subject: string;
  sentAt: string;
  status: SendStatus;
};

const historyItems: SendHistoryItem[] = [
  {
    id: "FAX-20260401-001",
    channel: "fax",
    recipient: "03-9876-5432",
    subject: "新サービスご案内",
    sentAt: "2026-04-01 10:03",
    status: "success",
  },
  {
    id: "GMAIL-20260401-014",
    channel: "gmail",
    recipient: "tanaka@example.com",
    subject: "4月キャンペーンのお知らせ",
    sentAt: "2026-04-01 09:41",
    status: "success",
  },
  {
    id: "FAX-20260331-125",
    channel: "fax",
    recipient: "06-1234-0000",
    subject: "定期メンテナンス通知",
    sentAt: "2026-03-31 17:22",
    status: "failed",
  },
  {
    id: "GMAIL-20260331-047",
    channel: "gmail",
    recipient: "sales-team@example.com",
    subject: "週次レポート",
    sentAt: "2026-03-31 16:30",
    status: "sending",
  },
];

const channelLabel: Record<SendChannel, string> = {
  fax: "FAX",
  gmail: "Gmail",
};

const statusLabel: Record<SendStatus, string> = {
  success: "送信完了",
  failed: "送信失敗",
  sending: "送信中",
};

export default function SendHistoryPage() {
  const total = historyItems.length;
  const faxCount = historyItems.filter((item) => item.channel === "fax").length;
  const gmailCount = historyItems.filter((item) => item.channel === "gmail").length;

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card history-card">
        <header className="history-header">
          <div>
            <h1>送信履歴管理</h1>
            <p>FAX と Gmail の送信履歴を一覧で確認できます。</p>
          </div>
          <Link href="/dashboard" className="btn btn-secondary">
            ダッシュボードへ戻る
          </Link>
        </header>

        <section className="history-stats" aria-label="送信履歴サマリー">
          <article>
            <p>合計送信件数</p>
            <strong>{total}件</strong>
          </article>
          <article>
            <p>FAX</p>
            <strong>{faxCount}件</strong>
          </article>
          <article>
            <p>Gmail</p>
            <strong>{gmailCount}件</strong>
          </article>
        </section>

        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>送信ID</th>
                <th>チャネル</th>
                <th>送信先</th>
                <th>件名・タイトル</th>
                <th>送信日時</th>
                <th>ステータス</th>
              </tr>
            </thead>
            <tbody>
              {historyItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{channelLabel[item.channel]}</td>
                  <td>{item.recipient}</td>
                  <td>{item.subject}</td>
                  <td>{item.sentAt}</td>
                  <td>
                    <span className={`status-chip status-${item.status}`}>{statusLabel[item.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
