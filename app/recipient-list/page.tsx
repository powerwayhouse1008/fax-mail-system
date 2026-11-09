"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { appendSendHistory } from "../send-history/history-store";


type RecipientListPageProps = {
  searchParams?: {
    channel?: string;
    faxList?: string;
    gmailList?: string;
  };
};

type FaxTemplateContent = {
  to?: string;
  from?: string;
  faxNumber?: string;
  cc?: string;
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
type AttachmentPayload = { filename: string; content?: string; url?: string; type: string };

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

const OLD_DEFAULT_EMAIL = "mai@powerway.jp";
const NEW_DEFAULT_EMAIL = "nifo@powerway.house";

const replaceDefaultEmail = (value: string) => value.replaceAll(OLD_DEFAULT_EMAIL, NEW_DEFAULT_EMAIL);

const isPdfAttachment = (fileName: string, mimeType: string) =>
  mimeType.toLowerCase() === "application/pdf" || /\.pdf$/i.test(fileName.trim());

const createShortJapaneseSendError = (value: unknown) => {
  const raw = typeof value === "string" ? value : "";
  if (/0050002|用紙サイズ|\\u7528\\u7d19\\u30b5\\u30a4\\u30ba|A4|B4/.test(raw)) {
    return "FAX APIが原稿サイズを受け付けませんでした。別のPDFまたは画像でお試しください。";
  }
  if (/PDFアップロード|upload/i.test(raw)) {
    return "PDFのアップロードに失敗しました。ファイルを確認してください。";
  }
  if (/NEXLINK_API_TOKEN|API_TOKEN|token/i.test(raw)) {
    return "FAX APIの設定が未完了です。";
  }
  if (/有効なFAX|FAX番号|fax number/i.test(raw)) {
    return "FAX番号を確認してください。";
  }
  return raw && raw.length <= 90 ? raw : "送信に失敗しました。ファイルと送信先を確認してください。";
};

export default function RecipientListPage({ searchParams }: RecipientListPageProps) {
  const channel = searchParams?.channel ?? "fax";
  const isGmailChannel = channel === "gmail";
  const [faxListInput, setFaxListInput] = useState("");
  const [gmailListInput, setGmailListInput] = useState("");
  const [mailSubject, setMailSubject] = useState("FAX Mail System からの送信テスト");
  const [mailBodyHtml, setMailBodyHtml] = useState("<p>FAX Mail System からの送信テストです。</p>");
  const [mailBodyText, setMailBodyText] = useState("FAX Mail System からの送信テストです。");
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);
  const [faxDraftContent, setFaxDraftContent] = useState<FaxTemplateContent>({});
  const [uploadedCard, setUploadedCard] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [faxMethod, setFaxMethod] = useState<"api" | "desktop">("desktop");
  const [desktopAgentId, setDesktopAgentId] = useState("office-pc");
  const [sendMessage, setSendMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (typeof searchParams?.faxList === "string" && searchParams.faxList.trim()) {
      setFaxListInput(searchParams.faxList);
    }
    if (typeof searchParams?.gmailList === "string" && searchParams.gmailList.trim()) {
      setGmailListInput(searchParams.gmailList);
    }
  }, [searchParams?.faxList, searchParams?.gmailList]);
  const faxNumbers = useMemo(() => cleanList(faxListInput), [faxListInput]);
  const gmailAddresses = useMemo(() => cleanList(gmailListInput), [gmailListInput]);
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
        const draftContent = {
          ...(parsed.content ?? {}),
          signature: parsed.content?.signature ? replaceDefaultEmail(parsed.content.signature) : parsed.content?.signature,
        };
        setFaxDraftContent(draftContent);
        const subject = draftContent.subject?.trim();
        const bodyFromEditor = parsed.messageBodyHtml ? replaceDefaultEmail(parsed.messageBodyHtml).trim() : "";
        const messageBody = draftContent.messageBody?.trim();
        const signature = draftContent.signature?.trim();

        if (subject) {
          setMailSubject(subject);
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
              [faxSummaryText, uploadedCardUrl ? `名刺: ${uploadedCardName}（画像を本文に挿入）` : ""]
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
  
  const buildFaxPreviewAttachment = async (): Promise<AttachmentPayload | null> => {
    if (isGmailChannel) return null;
    if (typeof window === "undefined") return null;

    if (uploadedCard?.url && isPdfAttachment(uploadedCard.name, uploadedCard.type)) {
      return {
        filename: uploadedCard.name || "fax-document.pdf",
        url: uploadedCard.url,
        type: "application/pdf",
      };
    }

    // Keep the proven PC-Fax-compatible A4 raster dimensions.
    const rasterScale = 1;
    const width = 1240;
    const height = 1754;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#111";

    const drawText = (text: string, x: number, y: number, size = 36, weight = "400") => {
      ctx.font = `${weight} ${size * rasterScale}px sans-serif`;
      ctx.fillText(text, x * rasterScale, y * rasterScale);
    };

    drawText("見積送付状", 70, 90, 52, "700");
    drawText(`TO: ${faxDraftContent.to || ""}`, 70, 160);
    if (faxDraftContent.faxNumber?.trim()) {
      drawText(`FAX: ${faxDraftContent.faxNumber}`, 70, 210);
    }
    drawText(`FROM: ${faxDraftContent.from || ""}`, 70, 260);
    drawText(`${faxDraftContent.greeting || ""}`, 70, 330);
    drawText(`${faxDraftContent.request || ""}`, 70, 390);
    drawText(`連絡事項: ${faxDraftContent.contact || ""}`, 70, 450);

    ctx.strokeStyle = "#111";
    ctx.strokeRect(70 * rasterScale, 500 * rasterScale, width - 140 * rasterScale, 650 * rasterScale);
    drawText("物件名 / 室", 90, 560, 30, "700");
    drawText(faxDraftContent.propertyName || "", 360, 560, 30);
    drawText("内見希望日", 90, 640, 30, "700");
    drawText(faxDraftContent.preferredDate || "", 360, 640, 30);
    drawText("内見希望時間", 90, 720, 30, "700");
    drawText(faxDraftContent.preferredTime || "", 360, 720, 30);
    drawText("名刺", 90, 800, 30, "700");

    ctx.strokeRect(340 * rasterScale, 760 * rasterScale, 760 * rasterScale, 360 * rasterScale);
    if (uploadedCard?.url && uploadedCard.type.startsWith("image/")) {
      const image = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = uploadedCard.url;
      });
      if (image) {
        const ratio = Math.min((740 * rasterScale) / image.width, (340 * rasterScale) / image.height);
        const drawWidth = image.width * ratio;
        const drawHeight = image.height * ratio;
        const x = 350 * rasterScale + (740 * rasterScale - drawWidth) / 2;
        const y = 770 * rasterScale + (340 * rasterScale - drawHeight) / 2;
        ctx.drawImage(image, x, y, drawWidth, drawHeight);
      }
    }

    drawText(`${faxDraftContent.companyName || ""}`, 70, 1260, 36, "700");
    drawText(`${faxDraftContent.address || ""}`, 70, 1320, 32);
    drawText(`${faxDraftContent.phoneAndFax || ""}`, 70, 1380, 32);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.98);
    return {
      filename: "fax-a4-preview.jpg",
      content: dataUrl.split(",")[1] || "",
      type: "image/jpeg",
    };
  };
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
      const faxPreviewAttachment = await buildFaxPreviewAttachment();
      // The desktop PC-Fax path must receive the original attachment bytes.
      // The generated cover preview intentionally scales images down, which
      // makes the received fax blurry. Keep the existing cover behavior for
      // the API path so its current workflow is unchanged.
      const faxAttachments = faxMethod === "desktop"
        ? attachments
        : faxPreviewAttachment
          ? [faxPreviewAttachment]
          : attachments;
      let usedFaxMethod: "api" | "desktop" = faxMethod;
      let usedApiFallback = false;
      const faxRequestBody = JSON.stringify({
        agentId: desktopAgentId,
        faxNumbers,
        subject: mailSubject,
        html: mailBodyHtml,
        text: mailBodyText,
        attachments: faxAttachments,
        fax_quality: 1,
        mapping_columns: JSON.stringify({ fax: 0 }),
        documentUrl: uploadedCard?.url ?? attachments[0]?.url,
        documentName: uploadedCard?.name ?? attachments[0]?.filename,
      });
      const sendFax = async () => {
        if (faxNumbers.length === 0) return null;
        const request = (url: string) => fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: faxRequestBody,
        });
        if (faxMethod === "api") return request("/api/fax/send");
        try {
          const desktopResponse = await request("/api/desktop-fax/jobs");
          if (desktopResponse.ok) return desktopResponse;
        } catch {
          // Fall through to the API only when the desktop job was not accepted.
        }
        usedFaxMethod = "api";
        usedApiFallback = true;
        return request("/api/fax/send");
      };
      const [faxResponse, gmailResponse] = await Promise.all([
        sendFax(),
        gmailAddresses.length > 0
          ? fetch("/api/gmail/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                emails: gmailAddresses,
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
          status: faxFailedRecipients.has(faxNumber) ? ("failed" as const) : ("sending" as const),
        })),
        ...gmailAddresses.map((email) => ({
          channel: "gmail" as const,
          recipient: email,
          subject: mailSubject,
          status: gmailFailedRecipients.has(email) ? ("failed" as const) : ("success" as const),
        })),
      ]);

      const faxSuccessCount = usedFaxMethod === "desktop"
        ? (typeof faxData?.total === "number" ? faxData.total : 0)
        : (typeof faxData?.successCount === "number" ? faxData.successCount : 0);
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
          text: createShortJapaneseSendError(
            errorMessages[0] ?? firstFaxError ?? firstGmailError,
          ),
        });
        return;
      }

      setSendMessage({
        type: "success",
        text: usedFaxMethod === "desktop"
          ? `PC送信キューへ登録しました: FAX ${faxSuccessCount}件（PCエージェントで処理後に送信されます）${gmailSuccessCount ? ` / Gmail送信 ${gmailSuccessCount}件` : ""}`
          : `${usedApiFallback ? "ホストPCへの登録に失敗したため、APIへ自動切替しました。" : ""}送信完了: 成功 ${totalSuccess}件（FAX ${faxSuccessCount}件, Gmail ${gmailSuccessCount}件）`,
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
        <header className="history-header">
          <div>
            <h1>順次送信リスト</h1>
            <p>FAX番号またはGmailアドレスの一覧を入力してください。未入力の項目があっても送信できます。</p>
          </div>
          <div className="history-actions">
            <Link href="/send-history" className="btn btn-primary">
              送信履歴管理
            </Link>
          </div>
        </header>

        <section className="recipient-preview">
          <h2>FAX送信方法</h2>
          <div className="fax-method-options">
            <label><input type="radio" name="fax-method" checked={faxMethod === "api"} onChange={() => setFaxMethod("api")} /> APIで送信</label>
            <label><input type="radio" name="fax-method" checked={faxMethod === "desktop"} onChange={() => setFaxMethod("desktop")} /> ホストPC・複合機で送信</label>
          </div>
          {faxMethod === "desktop" ? (
            <label className="field">
              <span>デスクトップエージェントID</span>
              <input value={desktopAgentId} onChange={(event) => setDesktopAgentId(event.target.value)} placeholder="office-pc" />
              <small>Windowsエージェントと同じIDを指定してください。ジョブはPCが受信してから印刷されます。</small>
            </label>
          ) : null}
        </section>

        <div className="recipient-grid">
          <label className="field">
            <span>FAX番号リスト（1行に1件）</span>
            <textarea
              rows={8}
              value={faxListInput}
              onChange={(event) => setFaxListInput(event.target.value)}
              placeholder={"0312345678\n0398765432"}
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
