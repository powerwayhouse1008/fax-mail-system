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
  const [sendMessage, setSendMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const faxNumbers = useMemo(() => cleanList(faxListInput), [faxListInput]);
  const gmailAddresses = useMemo(() => cleanList(gmailListInput), [gmailListInput]);
  const maxLength = Math.max(faxNumbers.length, gmailAddresses.length);
const handleSend = () => {
    if (maxLength === 0) {
      setSendMessage({
        type: "error",
        text: "送信先がありません。FAX番号とGmailアドレスを入力してください。",
      });
      return;
    }

    if (faxNumbers.length !== gmailAddresses.length) {
      setSendMessage({
        type: "error",
        text: "FAXとGmailの件数が一致していません。行数をそろえてください。",
      });
      return;
    }

    setSendMessage({
      type: "success",
      text: `${maxLength}件の送信を開始しました。送信処理は正常に受け付けられました。`,
    });
  };

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <h1>順次送信リスト</h1>
        <p>FAX番号とGmailアドレスの一覧を入力してください。上から順に1件ずつ組み合わせます。</p>

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
          <button type="button" className="btn btn-primary" onClick={handleSend}>
            リスト送信を開始
          </button>
        </div>
      </section>
    </main>
  );
}
