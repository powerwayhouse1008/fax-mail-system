"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type FaxTemplatePageProps = {
  searchParams?: {
    channel?: string;
  };
};
type FaxTemplateContent = {
  to: string;
  faxNumber: string;
  recipientEmails: string;
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
type SavedDraft = {
  content?: Partial<FaxTemplateContent>;
  uploadedCard?: {
    name: string;
    type: string;
    dataUrl: string;
  };
  savedAt?: string;
};
const channelLabels: Record<string, string> = {
  fax: "FAX一括送信",
  gmail: "Gmail配信",
};
const faxTemplateContent: FaxTemplateContent = {
  to: "有限会社 栄商事 御中 / ご担当者様",
  faxNumber: "03-1234-5678",
  recipientEmails: "example-a@gmail.com, example-b@gmail.com",
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
  const [uploadedCardName, setUploadedCardName] = useState("");
  const [uploadedCardUrl, setUploadedCardUrl] = useState("");
  const [uploadedCardType, setUploadedCardType] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const channelLabel = useMemo(() => channelLabels[channel] ?? "FAX一括送信", [channel]);
   const sentAtDate = useMemo(() => {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);
  const isFaxChannel = channel === "fax";

  const updateField = <K extends keyof FaxTemplateContent>(key: K, value: FaxTemplateContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };
     const isGmailChannel = channel === "gmail";

  useEffect(() => {
    const storageKey = `fax-template-draft:${channel}`;
    const savedDraft = window.localStorage.getItem(storageKey);

    if (!savedDraft) {
      return;
    }

    try {
       const parsed = JSON.parse(savedDraft) as SavedDraft;
      if (parsed.content) {
        setContent((prev) => ({ ...prev, ...parsed.content }));
      }
    if (parsed.uploadedCard) {
        setUploadedCardName(parsed.uploadedCard.name);
        setUploadedCardType(parsed.uploadedCard.type);
        setUploadedCardUrl(parsed.uploadedCard.dataUrl);
      }
      if (parsed.savedAt) {
        const formatted = new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(parsed.savedAt));
        setSaveMessage(`保存済みデータを読み込みました（${formatted}）。`);
      }
    } catch {
      setSaveMessage("保存済みデータの読み込みに失敗しました。");
    }
  }, [channel]);

 const handleSaveDraft = () => {
    const storageKey = `fax-template-draft:${channel}`;
    const savedAt = new Date().toISOString();

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        content,
        uploadedCard: uploadedCardUrl
          ? {
              name: uploadedCardName,
              type: uploadedCardType,
              dataUrl: uploadedCardUrl,
            }
          : null,
        savedAt,
      }),
    );

    const formatted = new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(savedAt));

    setSaveMessage(`入力内容を保存しました（${formatted}）。`);
  };


  const handleBusinessCardChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setUploadedCardName("");
      setUploadedCardType("");
      setUploadedCardUrl("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        return;
      }
      setUploadedCardName(file.name);
      setUploadedCardType(file.type);
      setUploadedCardUrl(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="template-shell">
      <article className="fax-sheet fax-editor">
        <div className="editor-heading">
          <p>Live editor</p>
          <h2>入力フォーム</h2>
        </div>
        {isFaxChannel && (
            <label className="field field-full" htmlFor="business-card-file">
              <span>名刺ファイル（画像/PDF）</span>
              <input
                id="business-card-file"
                type="file"
                accept="image/*,.pdf"
                onChange={handleBusinessCardChange}
              />
              {uploadedCardName && <small>選択中: {uploadedCardName}</small>}
            </label>
          )}
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
              <span>FAX番号</span>
              <input
                value={content.faxNumber}
                onChange={(e) => updateField("faxNumber", e.target.value)}
                placeholder="03-1234-5678"
              />
            </label>
            <label className="field">
              <span>FROM</span>
              <input value={content.from} onChange={(e) => updateField("from", e.target.value)} />
            </label>
            <label>
              <label className="field field-full">
              <span>Gmail送信先リスト（カンマ区切り）</span>
              <input
                value={content.recipientEmails}
                onChange={(e) => updateField("recipientEmails", e.target.value)}
                placeholder="a@gmail.com, b@gmail.com"
              />
            </label>
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
        <div className="editor-actions">
          <button type="button" className="btn btn-secondary" onClick={handleSaveDraft}>
            入力内容を保存
          </button>
          <Link href={`/recipient-list?channel=${channel}`} className="btn btn-primary">
            順次送信リスト
          </Link>
        </div>
        {saveMessage ? (
          <p className="send-notice send-notice-success" role="status" aria-live="polite">
            {saveMessage}
          </p>
        ) : null}
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
            <strong>FAX:</strong> {content.faxNumber}
          </div>
          <div>
           <strong>FROM:</strong> {content.from}
          </div>
          <div>
            <strong>Gmail配信先:</strong> {content.recipientEmails || "（なし）"}
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
             <tr>
              <th>名刺</th>
              <td>
                {uploadedCardUrl ? (
                  <div className="business-card-preview">
                    {uploadedCardType.startsWith("image/") ? (
                      <img src={uploadedCardUrl} alt="名刺プレビュー" />
                    ) : (
                      <a href={uploadedCardUrl} target="_blank" rel="noreferrer">
                        {uploadedCardName}
                      </a>
                    )}
                  </div>
                ) : (
                  "未添付"
                )}
              </td>
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
