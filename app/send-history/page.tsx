"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadSendHistory, SendChannel, SendHistoryItem, SendStatus } from "./history-store";

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
   const [historyItems, setHistoryItems] = useState<SendHistoryItem[]>([]);

  useEffect(() => {
    setHistoryItems(loadSendHistory());
  }, []);

  const total = historyItems.length;
  const faxCount = useMemo(() => historyItems.filter((item) => item.channel === "fax").length, [historyItems]);
  const gmailCount = useMemo(() => historyItems.filter((item) => item.channel === "gmail").length, [historyItems]);

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
               {historyItems.length === 0 ? (
                <tr>
                  <td colSpan={6}>まだ送信履歴がありません。</td>
                    <span className={`status-chip status-${item.status}`}>{statusLabel[item.status]}</span>
                  </td>
                </tr>
              ))}
              ) : (
                historyItems.map((item) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
