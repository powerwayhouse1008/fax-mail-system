"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type RecipientListPageProps = {
  searchParams?: {
    channel?: string;
  };
};

const cleanList = (value: string) =>
  value
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function RecipientListPage({ searchParams }: RecipientListPageProps) {
  const channel = searchParams?.channel ?? "fax";
  const [faxListInput, setFaxListInput] = useState("");
  const [gmailListInput, setGmailListInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const faxNumbers = useMemo(() => cleanList(faxListInput), [faxListInput]);
  const gmailAddresses = useMemo(() => cleanList(gmailListInput), [gmailListInput]);
  const maxLength = Math.max(faxNumbers.length, gmailAddresses.length);
  
  const handleSend = async () => {
    if (maxLength === 0) {
      setSendMessage({
        type: "error",
        text: "送信先がありません。FAX番号とGmailアドレスを入力してください。",
      });
      return;
    }

    if (gmailAddresses.length === 0) {
      setSendMessage({
        type: "error",
        text: "Gmailアドレスを1件以上入力してください。",
      });
      return;
    }

    setIsSending(true);
    setSendMessage(null);

    try {
      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emails: gmailAddresses }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSendMessage({
          type: "error",
          text: data?.error ?? "Gmail送信に失敗しました。",
        });
        return;
      }

      const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
      if (failedCount > 0) {
        setSendMessage({
          type: "error",
          text: `${data.successCount}件送信成功 / ${failedCount}件送信失敗。`,
        });
        return;
      }

      setSendMessage({
        type: "success",
        text: `${data.successCount}件のGmail送信に成功しました。`,
      });
    } catch {
      setSendMessage({
        type: "error",
        text: "通信エラーが発生しました。しばらくしてから再度お試しください。",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <h1>順次送信リスト</h1>
        <p>FAX番号またはGmailアドレスの一覧を入力してください。未入力の項目があっても送信できます。</p>

        <div className="recipient-grid">
          <label className="field">
            <span>FAX番号リスト（1行に1件）</span>
            <textarea
              rows={8}
              value={faxListInput}
              onChange={(event) => setFaxListInput(event.target.value)}
              placeholder={"03-1234-5678\n03-9876-5432"}
            />
          </label>

          <label className="field">
            <span>Gmailリスト（1行に1件）</span>
            <textarea
              rows={8}
              value={gmailListInput}
              onChange={(event) => setGmailListInput(event.target.value)}
              placeholder={"first@gmail.com\nsecond@gmail.com"}
            />
          </label>
        </div>

        <section className="recipient-preview">
         <h2>送信順のプレビュー</h2>
          {maxLength === 0 ? (
           <p>表示するデータがまだありません。</p>
          ) : (
            <ol>
              {Array.from({ length: maxLength }).map((_, index) => (
                <li key={`${faxNumbers[index] ?? "fax-empty"}-${gmailAddresses[index] ?? "gmail-empty"}-${index}`}>
                  <strong>FAX:</strong> {faxNumbers[index] ?? "（未入力）"} | <strong>Gmail:</strong>{" "}
                  {gmailAddresses[index] ?? "（未入力）"}
                </li>
              ))}
            </ol>
          )}
        </section>
        {sendMessage ? (
          <p
            className={`send-notice ${sendMessage.type === "success" ? "send-notice-success" : "send-notice-error"}`}
            role="status"
            aria-live="polite"
          >
            {sendMessage.text}
          </p>
        ) : null}

        <div className="actions">
          <Link href={`/fax-template?channel=${channel}`} className="btn btn-secondary">
             テンプレート入力に戻る
          </Link>
         <button type="button" className="btn btn-primary" onClick={handleSend} disabled={isSending}>
            {isSending ? "送信中..." : "リスト送信を開始"}
          </button>
        </div>
      </section>
    </main>
  );
}
