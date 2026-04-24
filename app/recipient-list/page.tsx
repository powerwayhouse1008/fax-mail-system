"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { appendSendHistory } from "../send-history/history-store";


type RecipientListPageProps = {
  searchParams?: {
    channel?: string;
  };
};

type FaxTemplateContent = {
  to?: string;
  from?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  greeting?: string;
  request?: string;
  messageBody?: string;
  signature?: string;
  contact?: string;
  propertyName?: string;
  preferredDate?: string;
  preferredTime?: string;
  companyName?: string;
  address?: string;
  phoneAndFax?: string;
};

type SavedDraft = {
  content?: FaxTemplateContent;
  messageBodyHtml?: string;
  gmailAttachments?: {
    name?: string;
    type?: string;
    url?: string;
    dataUrl?: string;
  }[];
   uploadedCard?: {
    name?: string;
    type?: string;
    url?: string;
    dataUrl?: string;
  };
};

const cleanList = (value: string) =>
  value
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

export default function RecipientListPage({ searchParams }: RecipientListPageProps) {
  const channel = searchParams?.channel ?? "fax";
  const isGmailChannel = channel === "gmail";
  const [faxListInput, setFaxListInput] = useState("");
  const [gmailListInput, setGmailListInput] = useState("");
  const [mailSubject, setMailSubject] = useState("FAX Mail System からの送信テスト");
  const [mailBodyHtml, setMailBodyHtml] = useState("<p>FAX Mail System からの送信テストです。</p>");
  const [mailBodyText, setMailBodyText] = useState("FAX Mail System からの送信テストです。");
  const [ccListInput, setCcListInput] = useState("");
  const [bccListInput, setBccListInput] = useState("");
  const [attachments, setAttachments] = useState<
     { filename: string; content?: string; url?: string; type: string }[]
  >([]);
  const [uploadedCard, setUploadedCard] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const faxNumbers = useMemo(() => cleanList(faxListInput), [faxListInput]);
  const gmailAddresses = useMemo(() => cleanList(gmailListInput), [gmailListInput]);
  const ccAddresses = useMemo(() => cleanList(ccListInput), [ccListInput]);
  const bccAddresses = useMemo(() => cleanList(bccListInput), [bccListInput]);
  const maxLength = Math.max(faxNumbers.length, gmailAddresses.length);

    useEffect(() => {
    let mounted = true;
    const loadDraft = async () => {
      let userScope = "guest";
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (response.ok) {
          const session = (await response.json()) as { user?: { username?: string } };
          userScope = session.user?.username?.trim() || "guest";
        }
      } catch {
        userScope = "guest";
      }

      if (!mounted) {
        return;
      }

      const storageKey = `fax-template-draft:${userScope}:${channel}`;
      const savedDraft = window.localStorage.getItem(storageKey);
      if (!savedDraft) {
        return;
      }

      try {
        const parsed = JSON.parse(savedDraft) as SavedDraft;
        const draftContent = parsed.content ?? {};
        const subject = draftContent.subject?.trim();
        const bodyFromEditor = parsed.messageBodyHtml?.trim();
        const messageBody = draftContent.messageBody?.trim();
        const signature = draftContent.signature?.trim();

        if (subject) {
          setMailSubject(subject);
        }
        if (draftContent.cc?.trim()) {
          setCcListInput(draftContent.cc);
        }
        if (draftContent.bcc?.trim()) {
          setBccListInput(draftContent.bcc);
        }

        if (isGmailChannel) {
          const bodyHtml = bodyFromEditor || (messageBody ? `<p>${messageBody}</p>` : "");
          const signatureHtml = signature ? `<hr/><pre>${signature}</pre>` : "";
          const mergedHtml = `${bodyHtml}${signatureHtml}` || "<p>FAX Mail System からの送信テストです。</p>";
          setMailBodyHtml(mergedHtml);
          setMailBodyText([messageBody, signature].filter(Boolean).join("\n\n") || "FAX Mail System からの送信テストです。");
        } else {
          const faxSummaryText = [
            draftContent.to && `TO: ${draftContent.to}`,
            draftContent.from && `FROM: ${draftContent.from}`,
            draftContent.greeting,
            draftContent.request,
            draftContent.propertyName && `物件名: ${draftContent.propertyName}`,
            draftContent.preferredDate && `内見希望日: ${draftContent.preferredDate}`,
            draftContent.preferredTime && `内見希望時間: ${draftContent.preferredTime}`,
            draftContent.contact && `連絡事項: ${draftContent.contact}`,
            messageBody,
            signature,
          ]
            .filter(Boolean)
            .join("\n");
          const faxSummaryHtml = faxSummaryText
            .split("\n")
            .map((line) => `<p>${line}</p>`)
            .join("");

          const uploadedCardUrl = parsed.uploadedCard?.url ?? parsed.uploadedCard?.dataUrl;
          const uploadedCardType = parsed.uploadedCard?.type ?? "";
          const uploadedCardName = parsed.uploadedCard?.name ?? "名刺";
          if (uploadedCardUrl) {
            setUploadedCard({
              url: uploadedCardUrl,
              type: uploadedCardType,
              name: uploadedCardName,
            });
          }
          const businessCardHtml = uploadedCardUrl
            ? uploadedCardType.startsWith("image/")
              ? `<p><strong>名刺:</strong></p><p><img src="${uploadedCardUrl}" alt="${uploadedCardName}" style="max-width:100%;height:auto;border-radius:8px;" /></p>`
              : `<p><strong>名刺:</strong> <a href="${uploadedCardUrl}" target="_blank" rel="noreferrer">${uploadedCardName}</a></p>`
            : "";

          if (faxSummaryText || businessCardHtml) {
            setMailBodyText(
              [faxSummaryText, uploadedCardUrl ? `名刺: ${uploadedCardName} (${uploadedCardUrl})` : ""]
                .filter(Boolean)
                .join("\n"),
            );
            setMailBodyHtml(`${faxSummaryHtml}${businessCardHtml}`);
          }
        }

        if (Array.isArray(parsed.gmailAttachments)) {
          const normalizedAttachments = parsed.gmailAttachments
            .filter((file) => file?.name && (file?.url || file?.dataUrl))
            .map((file) => ({
              filename: file.name ?? "attachment",
              content: file.dataUrl ? (file.dataUrl ?? "").split(",")[1] ?? "" : undefined,
              url: file.url,
              type: file.type || "application/octet-stream",
            }))
            .filter((file) => Boolean(file.content || file.url));
          setAttachments(normalizedAttachments);
        }
      } catch {
        // noop
      }
    };

    loadDraft();
    return () => {
      mounted = false;
    };
  }, [channel, isGmailChannel]);
  const handleSend = async () => {
    if (maxLength === 0) {
      setSendMessage({
        type: "error",
        text: "送信先がありません。FAX番号またはGmailアドレスを1件以上入力してください。",
      });
      return;
    }
    
    setIsSending(true);
    setSendMessage(null);

    try {
      const [faxResponse, gmailResponse] = await Promise.all([
        faxNumbers.length > 0
          ? fetch("/api/fax/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                faxNumbers,
                subject: mailSubject,
                html: mailBodyHtml,
                text: mailBodyText,
                attachments,
                uploadedCardUrl: uploadedCard?.url,
                uploadedCardName: uploadedCard?.name,
                uploadedCardType: uploadedCard?.type,
              }),
            })
          : Promise.resolve(null),
        gmailAddresses.length > 0
          ? fetch("/api/gmail/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                emails: gmailAddresses,
                cc: ccAddresses,
                bcc: bccAddresses,
                subject: mailSubject,
                html: mailBodyHtml,
                text: mailBodyText,
                attachments,
                mappingColumns: {},
              }),
            })
          : Promise.resolve(null),
      ]);

      const faxData = faxResponse ? await faxResponse.json() : null;
      const gmailData = gmailResponse ? await gmailResponse.json() : null;

      const faxFailedRecipients = new Set(
        Array.isArray(faxData?.failed)
          ? faxData.failed
              .filter((item: { to?: unknown }) => typeof item?.to === "string")
              .map((item: { to: string }) => item.to)
          : [],
      );
      const gmailFailedRecipients = new Set(
        Array.isArray(gmailData?.failed)
          ? gmailData.failed
              .filter((item: { to?: unknown }) => typeof item?.to === "string")
              .map((item: { to: string }) => item.to)
          : [],
      );

      appendSendHistory([
        ...faxNumbers.map((faxNumber) => ({
          channel: "fax" as const,
          recipient: faxNumber,
          subject: mailSubject,
          status: faxFailedRecipients.has(faxNumber) ? ("failed" as const) : ("success" as const),
        })),
        ...gmailAddresses.map((email) => ({
          channel: "gmail" as const,
          recipient: email,
          subject: mailSubject,
          status: gmailFailedRecipients.has(email) ? ("failed" as const) : ("success" as const),
        })),
      ]);

      const faxSuccessCount = typeof faxData?.successCount === "number" ? faxData.successCount : 0;
      const gmailSuccessCount = typeof gmailData?.successCount === "number" ? gmailData.successCount : 0;
      const faxFailedCount = Array.isArray(faxData?.failed) ? faxData.failed.length : 0;
      const gmailFailedCount = Array.isArray(gmailData?.failed) ? gmailData.failed.length : 0;
       const faxTotalCount = typeof faxData?.total === "number" ? faxData.total : faxNumbers.length;
      const gmailTotalCount = typeof gmailData?.total === "number" ? gmailData.total : gmailAddresses.length;
      const totalSuccess = faxSuccessCount + gmailSuccessCount;
      const totalFailed = faxFailedCount + gmailFailedCount;

      const errorMessages = [
        !faxResponse?.ok ? faxData?.error : null,
        !gmailResponse?.ok ? gmailData?.error : null,
      ].filter((value): value is string => Boolean(value));
      
      if (errorMessages.length > 0 || totalFailed > 0) {
         const firstFaxError =
          Array.isArray(faxData?.failed) && typeof faxData.failed[0]?.error === "string"
            ? faxData.failed[0].error
            : null;
        const firstGmailError =
          Array.isArray(gmailData?.failed) && typeof gmailData.failed[0]?.error === "string"
            ? gmailData.failed[0].error
            : null;

        setSendMessage({
          type: "error",
          text:
            errorMessages[0] ??
           `送信結果: 成功 ${totalSuccess}件 / 失敗 ${totalFailed}件（FAX ${faxSuccessCount}/${faxTotalCount}, Gmail ${gmailSuccessCount}/${gmailTotalCount}）${
              firstFaxError || firstGmailError ? ` / 詳細: ${firstFaxError ?? firstGmailError}` : ""
            }`,
        });
        return;
      }

      setSendMessage({
        type: "success",
        text: `送信完了: 成功 ${totalSuccess}件（FAX ${faxSuccessCount}件, Gmail ${gmailSuccessCount}件）`,
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
 <div className="recipient-grid">
          <label className="field">
            <span>Cc（任意）</span>
            <textarea
              rows={3}
              value={ccListInput}
              onChange={(event) => setCcListInput(event.target.value)}
              placeholder={"cc1@gmail.com\ncc2@gmail.com"}
            />
          </label>
          <label className="field">
            <span>Bcc（任意）</span>
            <textarea
              rows={3}
              value={bccListInput}
              onChange={(event) => setBccListInput(event.target.value)}
              placeholder={"bcc1@gmail.com\nbcc2@gmail.com"}
            />
          </label>
        </div>
        <label className="field">
          <span>件名</span>
          <input value={mailSubject} onChange={(event) => setMailSubject(event.target.value)} />
        </label>
        
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
        <section className="recipient-preview">
          <h2>メール本文プレビュー</h2>
          <div dangerouslySetInnerHTML={{ __html: mailBodyHtml }} />
          {attachments.length > 0 ? (
            <p>添付ファイル: {attachments.map((file) => file.filename).join(", ")}</p>
          ) : null}
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
