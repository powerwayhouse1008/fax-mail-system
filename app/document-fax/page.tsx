"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import AuthGuard from "../components/auth-guard";
import { appendSendHistory } from "../send-history/history-store";

type Locale = "en" | "ja" | "vi";

type UploadedDocument = {
  filename: string;
  type: string;
  url: string;
};

type UploadResponse = {
  url?: string;
  filename?: string;
  contentType?: string;
  error?: string;
};

type SendResponse = {
  total?: number;
  successCount?: number;
  failed?: { to?: string; error?: string }[];
  error?: string;
};

const translations = {
  en: {
    title: "Document fax",
    description: "Upload files and send them through the Fax API so the recipient receives the full documents.",
    backToDashboard: "Back to dashboard",
    faxNumbersLabel: "Recipient fax numbers (one per line)",
    documentLabel: "Documents to fax",
    emptyDocument: "No documents uploaded.",
    uploading: "Uploading...",
    openDocument: "Open document",
    subjectLabel: "Subject",
    defaultSubject: "Document fax",
    sendButton: "Send document fax",
    sendingButton: "Sending...",
    missingDocument: "Please upload at least one document before sending fax.",
    missingFaxNumber: "Please enter at least one fax number.",
    uploadFailed: "File upload failed",
    sendPartial: "Fax sending did not fully complete.",
    sendSuccess: "Documents were sent to the Fax API for",
    sendFailed: "Fax sending failed",
    recipientsUnit: "fax number(s)",
  },
  ja: {
    title: "FAX \u8cc7\u6599",
    description:
      "\u8907\u6570\u30d5\u30a1\u30a4\u30eb\u3092\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3057\u3001Fax API\u7d4c\u7531\u3067\u8cc7\u6599\u5168\u4f53\u3092\u9001\u4fe1\u3057\u307e\u3059\u3002",
    backToDashboard: "\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u3078",
    faxNumbersLabel: "\u9001\u4fe1\u5148FAX\u756a\u53f7\uff081\u884c\u306b1\u4ef6\uff09",
    documentLabel: "\u9001\u4fe1\u3059\u308b\u8cc7\u6599",
    emptyDocument: "\u8cc7\u6599\u306f\u307e\u3060\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002",
    uploading: "\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u4e2d...",
    openDocument: "\u8cc7\u6599\u3092\u958b\u304f",
    subjectLabel: "\u4ef6\u540d",
    defaultSubject: "FAX \u8cc7\u6599",
    sendButton: "FAX \u8cc7\u6599\u3092\u9001\u4fe1",
    sendingButton: "\u9001\u4fe1\u4e2d...",
    missingDocument: "\u9001\u4fe1\u524d\u306b\u8cc7\u6599\u30921\u4ef6\u4ee5\u4e0a\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    missingFaxNumber: "FAX\u756a\u53f7\u30921\u4ef6\u4ee5\u4e0a\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    uploadFailed: "\u30d5\u30a1\u30a4\u30eb\u306e\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
    sendPartial: "FAX\u9001\u4fe1\u306f\u5b8c\u5168\u306b\u306f\u5b8c\u4e86\u3057\u307e\u305b\u3093\u3067\u3057\u305f\u3002",
    sendSuccess: "\u8cc7\u6599\u3092Fax API\u306b\u9001\u4fe1\u3057\u307e\u3057\u305f:",
    sendFailed: "FAX\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
    recipientsUnit: "\u4ef6",
  },
  vi: {
    title: "Fax t\u00e0i li\u1ec7u",
    description:
      "Upload nhi\u1ec1u file r\u1ed3i g\u1eedi qua Fax API \u0111\u1ec3 \u0111\u1ed1i t\u00e1c nh\u1eadn \u0111\u1ea7y \u0111\u1ee7 n\u1ed9i dung t\u00e0i li\u1ec7u.",
    backToDashboard: "V\u1ec1 dashboard",
    faxNumbersLabel: "S\u1ed1 fax nh\u1eadn (m\u1ed7i d\u00f2ng m\u1ed9t s\u1ed1)",
    documentLabel: "T\u00e0i li\u1ec7u c\u1ea7n fax",
    emptyDocument: "Ch\u01b0a upload t\u00e0i li\u1ec7u.",
    uploading: "\u0110ang upload...",
    openDocument: "M\u1edf t\u00e0i li\u1ec7u",
    subjectLabel: "Ti\u00eau \u0111\u1ec1",
    defaultSubject: "Fax t\u00e0i li\u1ec7u",
    sendButton: "G\u1eedi fax t\u00e0i li\u1ec7u",
    sendingButton: "\u0110ang g\u1eedi...",
    missingDocument: "Vui l\u00f2ng upload \u00edt nh\u1ea5t m\u1ed9t t\u00e0i li\u1ec7u tr\u01b0\u1edbc khi g\u1eedi fax.",
    missingFaxNumber: "Vui l\u00f2ng nh\u1eadp \u00edt nh\u1ea5t m\u1ed9t s\u1ed1 fax.",
    uploadFailed: "Upload file th\u1ea5t b\u1ea1i",
    sendPartial: "G\u1eedi fax ch\u01b0a ho\u00e0n t\u1ea5t.",
    sendSuccess: "\u0110\u00e3 g\u1eedi t\u00e0i li\u1ec7u t\u1edbi Fax API cho",
    sendFailed: "G\u1eedi fax th\u1ea5t b\u1ea1i",
    recipientsUnit: "s\u1ed1 fax",
  },
} as const;

const detectLocale = (): Locale => {
  if (typeof window === "undefined") return "ja";
  const language = window.navigator.language.toLowerCase();
  if (language.startsWith("vi")) return "vi";
  if (language.startsWith("ja")) return "ja";
  return "ja";
};

const cleanFaxNumbers = (value: string) =>
  value
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const isImageDocument = (document: UploadedDocument) =>
  document.type.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp)$/i.test(document.filename);

const isPdfDocument = (document: UploadedDocument) =>
  document.type.toLowerCase() === "application/pdf" || /\.pdf$/i.test(document.filename);

const createShortJapaneseError = (value: unknown) => {
  const raw = typeof value === "string" ? value : value instanceof Error ? value.message : "";
  if (!raw.trim()) return "\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002";

  if (/0050002|\u7528\u7d19\u30b5\u30a4\u30ba|\\u7528\\u7d19\\u30b5\\u30a4\\u30ba|A4|A3|B4/.test(raw)) {
    return "FAX API\u304c\u539f\u7a3f\u30b5\u30a4\u30ba\u3092\u53d7\u3051\u4ed8\u3051\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5225\u306ePDF\u307e\u305f\u306f\u753b\u50cf\u3067\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002";
  }

  if (/NEXLINK_API_TOKEN|API_TOKEN|token/i.test(raw)) {
    return "FAX API\u306e\u8a2d\u5b9a\u304c\u672a\u5b8c\u4e86\u3067\u3059\u3002";
  }

  if (/\u6709\u52b9\u306aFAX|fax/i.test(raw) && /\u756a\u53f7|number/i.test(raw)) {
    return "FAX\u756a\u53f7\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
  }

  if (/\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9|upload/i.test(raw)) {
    return "\u30d5\u30a1\u30a4\u30eb\u306e\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002";
  }

  return "\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u5185\u5bb9\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
};

export default function DocumentFaxPage() {
  const [locale, setLocale] = useState<Locale>("ja");
  const [scope, setScope] = useState("guest");
  const [faxListInput, setFaxListInput] = useState("");
  const [subject, setSubject] = useState("");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const t = translations[locale];
  const faxNumbers = useMemo(() => cleanFaxNumbers(faxListInput), [faxListInput]);
  const resolvedSubject = subject.trim() || t.defaultSubject;

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok || !mounted) return;
        const session = (await response.json()) as { user?: { username?: string } };
        setScope(session.user?.username?.trim() || "guest");
      } catch {
        setScope("guest");
      }
    };

    loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setDocuments([]);
    setMessage(null);

    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedDocuments = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("channel", "fax");
          formData.append("scope", scope);
          formData.append("category", "documents");

          const response = await fetch("/api/storage/upload", {
            method: "POST",
            body: formData,
          });
          const payload = (await response.json()) as UploadResponse;

          if (!response.ok || !payload.url) {
            throw new Error(payload.error || "Upload failed");
          }

          return {
            filename: payload.filename || file.name,
            type: payload.contentType || file.type || "application/octet-stream",
            url: payload.url,
          };
        }),
      );
      setDocuments(uploadedDocuments);
    } catch (error) {
      setMessage({
        type: "error",
        text: createShortJapaneseError(error),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (documents.length === 0) {
      setMessage({ type: "error", text: t.missingDocument });
      return;
    }

    if (faxNumbers.length === 0) {
      setMessage({ type: "error", text: t.missingFaxNumber });
      return;
    }

    setIsSending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/fax/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          faxNumbers,
          subject: resolvedSubject,
          text: resolvedSubject,
          attachments: documents.map((document) => ({
              filename: document.filename,
              url: document.url,
              type: isPdfDocument(document) ? "application/pdf" : document.type,
          })),
          paper_size: "A4",
          fax_quality: 1,
          mapping_columns: JSON.stringify({ fax: 0 }),
        }),
      });

      const payload = (await response.json()) as SendResponse;
      const failed = Array.isArray(payload.failed) ? payload.failed : [];
      const failedRecipients = new Set(
        failed.filter((item) => typeof item.to === "string").map((item) => item.to as string),
      );

      appendSendHistory(
        faxNumbers.map((faxNumber) => ({
          channel: "fax",
          recipient: faxNumber,
          subject: resolvedSubject || documents[0]?.filename || t.defaultSubject,
          status: failedRecipients.has(faxNumber) ? "failed" : "sending",
        })),
      );

      if (!response.ok || payload.error || failed.length > 0) {
        const firstDetail = failed.find((item) => item.error)?.error;
        setMessage({
          type: "error",
          text: createShortJapaneseError(payload.error || firstDetail || t.sendPartial),
        });
        return;
      }

      setMessage({
        type: "success",
        text: `${t.sendSuccess} ${payload.successCount ?? faxNumbers.length} ${t.recipientsUnit}.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: createShortJapaneseError(error),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AuthGuard>
      <main className="dashboard-shell">
        <section className="dashboard-card document-fax-card">
          <header className="history-header">
            <div>
              <h1>{t.title}</h1>
              <p>{t.description}</p>
            </div>
            <Link href="/dashboard" className="btn btn-secondary">
              {t.backToDashboard}
            </Link>
          </header>

          <div className="recipient-grid">
            <label className="field">
              <span>{t.faxNumbersLabel}</span>
              <textarea
                rows={8}
                value={faxListInput}
                onChange={(event) => setFaxListInput(event.target.value)}
                placeholder={"03-1234-5678\n03-9876-5432"}
              />
            </label>

            <div className="document-upload-panel">
              <label className="field">
                <span>{t.documentLabel}</span>
                <input
                  type="file"
                  accept="application/pdf,image/*,.txt,.csv,.json,.md"
                  multiple
                  onChange={handleFileChange}
                  disabled={isUploading || isSending}
                />
              </label>

              {documents.length > 0 ? (
                <div className="document-preview-list">
                  {documents.map((document, index) => (
                    <div className="document-preview" key={`${document.filename}-${index}`}>
                      <strong>{document.filename}</strong>
                      <small>{document.type || "application/octet-stream"}</small>
                      {isImageDocument(document) ? (
                        <img src={document.url} alt={document.filename} />
                      ) : isPdfDocument(document) ? (
                        <iframe title={`PDF preview ${index + 1}`} src={document.url} />
                      ) : (
                        <a href={document.url} target="_blank" rel="noreferrer">
                          {t.openDocument}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="document-empty">{isUploading ? t.uploading : t.emptyDocument}</p>
              )}
            </div>
          </div>

          <label className="field">
            <span>{t.subjectLabel}</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t.defaultSubject}
            />
          </label>

          {message ? (
            <p
              className={`send-notice ${message.type === "success" ? "send-notice-success" : "send-notice-error"}`}
              role="status"
              aria-live="polite"
            >
              {message.text}
            </p>
          ) : null}

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSend}
              disabled={isUploading || isSending}
            >
              {isSending ? t.sendingButton : t.sendButton}
            </button>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
