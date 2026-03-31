"use client";

import { useMemo, useState } from "react";

type FaxTemplatePageProps = {
  searchParams?: {
    channel?: string;
  };
};
type FaxTemplateContent = {
  to: string;
  from: string;
  greeting: string;
  cc: string;
  bcc: string;
  subject: string;
  request: string;
  messageBody: string;
  signature: string;
  contact: string;
  propertyName: string;
  preferredDate: string;
  preferredTime: string;
  companyName: string;
  address: string;
  phoneAndFax: string;
};

const channelLabels: Record<string, string> = {
  fax: "FAX一括送信",
  gmail: "Gmail配信",
};
const faxTemplateContent: FaxTemplateContent = {
  to: "有限会社 栄商事 御中 / ご担当者様",
  from: "株式会社パワーウェイ / マイ",
   cc: "",
  bcc: "",
  subject: "【内見申込】杉並ハイツ 101",
  greeting: "貴社いよいよご清栄のこととお喜び申し上げます。",
  request: "さて、下記物件の内見申込をさせて頂きますので、宜しくお願いします。",
  messageBody: "何卒よろしくお願いいたします。",
  signature:
    "株式会社パワーウェイ\n〒101-0041 東京都千代田区神田須田町2-23-1 老崎ビル4F\nTEL: 03-5207-2378 FAX: 03-5207-2768\nEmail: mai@powerway.jp",
  contact: "090-6659-1306",
  propertyName: "杉並ハイツ 101",
  preferredDate: "2025/12/02",
  preferredTime: "18 時 30 〜",
  companyName: "株式会社パワーウェイ",
  address: "〒101-0041 東京都千代田区神田須田町2-23-1 老崎ビル 4F",
  phoneAndFax: "TEL: 03-5207-2378 FAX: 03-5207-2768",
};

export default function FaxTemplatePage({ searchParams }: FaxTemplatePageProps) {
  const channel = searchParams?.channel ?? "fax";
  const [content, setContent] = useState<FaxTemplateContent>(faxTemplateContent);
  const channelLabel = useMemo(() => channelLabels[channel] ?? "FAX一括送信", [channel]);

  const updateField = <K extends keyof FaxTemplateContent>(key: K, value: FaxTemplateContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };
     const isGmailChannel = channel === "gmail";

  return (
    <main className="template-shell">
      <article className="fax-sheet fax-editor">
        <div className="editor-heading">
          <p>Live editor</p>
          <h2>入力フォーム</h2>
        </div>
        
          {isGmailChannel ? (
          <div className="gmail-editor">
            <label className="field">
              <span>宛先</span>
              <input value={content.to} onChange={(e) => updateField("to", e.target.value)} />
            </label>
            <div className="gmail-row-inline">
              <label className="field">
                <span>Cc</span>
                <input value={content.cc} onChange={(e) => updateField("cc", e.target.value)} />
              </label>
              <label className="field">
                <span>Bcc</span>
                <input value={content.bcc} onChange={(e) => updateField("bcc", e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>件名</span>
              <input value={content.subject} onChange={(e) => updateField("subject", e.target.value)} />
            </label>
            <label className="field">
              <span>本文</span>
              <textarea
                value={content.messageBody}
                onChange={(e) => updateField("messageBody", e.target.value)}
                rows={6}
              />
            </label>
            <label className="field">
              <span>署名（固定情報）</span>
              <textarea
                value={content.signature}
                onChange={(e) => updateField("signature", e.target.value)}
                rows={6}
              />
            </label>
          </div>
        ) : (
          <div className="editor-grid">
            <label className="field">
              <span>TO</span>
              <input value={content.to} onChange={(e) => updateField("to", e.target.value)} />
            </label>
            <label className="field">
              <span>FROM</span>
              <input value={content.from} onChange={(e) => updateField("from", e.target.value)} />
            </label>
            <label>
              連絡事項
              <input value={content.contact} onChange={(e) => updateField("contact", e.target.value)} />
            </label>
            <label className="field">
              <span>物件名 / 室</span>
              <input
                value={content.propertyName}
                onChange={(e) => updateField("propertyName", e.target.value)}
              />
            </label>
            <label className="field">
              <span>内見希望日</span>
              <input
                value={content.preferredDate}
                onChange={(e) => updateField("preferredDate", e.target.value)}
              />
            </label>
            <label className="field">
              <span>内見希望時間</span>
              <input
                value={content.preferredTime}
                onChange={(e) => updateField("preferredTime", e.target.value)}
              />
            </label>
            <label className="field field-full">
              <span>挨拶文</span>
              <textarea
                value={content.greeting}
                onChange={(e) => updateField("greeting", e.target.value)}
                rows={3}
              />
            </label>
            <label className="field field-full">
              <span>依頼文</span>
              <textarea
                value={content.request}
                onChange={(e) => updateField("request", e.target.value)}
                rows={3}
              />
            </label>
            <label className="field field-full">
              <span>会社名</span>
              <input value={content.companyName} onChange={(e) => updateField("companyName", e.target.value)} />
            </label>
            <label className="field field-full">
              <span>住所</span>
              <input value={content.address} onChange={(e) => updateField("address", e.target.value)} />
            </label>
            <label className="field field-full">
              <span>電話/FAX</span>
              <input value={content.phoneAndFax} onChange={(e) => updateField("phoneAndFax", e.target.value)} />
            </label>
          </div>
        )}
      </article>
      
      <article className="fax-sheet">
        {isGmailChannel ? (
          <section className="gmail-preview">
            <header className="gmail-preview-header">
              <h1>新規メッセージ</h1>
              <p>配信種別：{channelLabel}</p>
            </header>
            <div className="gmail-preview-meta">
              <p>
                <strong>宛先:</strong> {content.to}
              </p>
              <p>
                <strong>Cc:</strong> {content.cc || "（なし）"}
              </p>
              <p>
                <strong>Bcc:</strong> {content.bcc || "（なし）"}
              </p>
              <p>
                <strong>件名:</strong> {content.subject}
              </p>
            </div>
            <div className="gmail-preview-body">
              <p>{content.messageBody}</p>
              <hr />
              <pre>{content.signature}</pre>
            </div>
          </section>
        ) : (
          <>
            <header className="fax-header">
              <h1>見送付状</h1>
              <div className="meta">
                <p>送信日時：26/03/31</p>
                <p>送信枚数：1 枚</p>
                <p>配信種別：{channelLabel}</p>
              </div>
            </header>


        <section className="fax-party">
          <div>
            <strong>TO:</strong> {content.to}
          </div>
          <div>
           <strong>FROM:</strong> {content.from}
          </div>
        </section>

        <section className="fax-body">
          <p>{content.greeting}</p>
          <p>{content.request}</p>
          <p>連絡事項：{content.contact}</p>
        </section>

        <table className="fax-table">
          <tbody>
            <tr>
              <th>物件名 / 室</th>
               <td>{content.propertyName}</td>
            </tr>
            <tr>
              <th>内見希望日</th>
              <td>{content.preferredDate}</td>
            </tr>
            <tr>
              <th>内見希望時間</th>
              <td>{content.preferredTime}</td>
            </tr>
          </tbody>
        </table>

       <section className="fax-signature">
              <h2>{content.companyName}</h2>
              <p>{content.address}</p>
              <p>{content.phoneAndFax}</p>
            </section>
          </>
        )}
      </article>
    </main>
  );
}
