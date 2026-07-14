"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import AuthGuard from "../components/auth-guard";
import { appendSendHistory } from "../send-history/history-store";

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

const cleanFaxNumbers = (value: string) =>
  value
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const isImageDocument = (document: UploadedDocument) =>
  document.type.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp)$/i.test(document.filename);

const isPdfDocument = (document: UploadedDocument) =>
  document.type.toLowerCase() === "application/pdf" || /\.pdf$/i.test(document.filename);

export default function DocumentFaxPage() {
  const [scope, setScope] = useState("guest");
  const [faxListInput, setFaxListInput] = useState("");
  const [subject, setSubject] = useState("Fax tài liệu");
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const faxNumbers = useMemo(() => cleanFaxNumbers(faxListInput), [faxListInput]);

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
    const file = event.target.files?.[0];
    setDocument(null);
    setMessage(null);

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("channel", "fax");
    formData.append("scope", scope);
    formData.append("category", "documents");

    setIsUploading(true);
    try {
      const response = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as UploadResponse;

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Upload failed");
      }

      setDocument({
        filename: payload.filename || file.name,
        type: payload.contentType || file.type || "application/octet-stream",
        url: payload.url,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: `Upload file thất bại${error instanceof Error ? `: ${error.message}` : ""}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!document) {
      setMessage({ type: "error", text: "Vui lòng upload tài liệu trước khi gửi fax." });
      return;
    }

    if (faxNumbers.length === 0) {
      setMessage({ type: "error", text: "Vui lòng nhập ít nhất một số fax." });
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
          subject,
          text: subject,
          attachments: [
            {
              filename: document.filename,
              url: document.url,
              type: isPdfDocument(document) ? "application/pdf" : document.type,
            },
          ],
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
          subject: subject || document.filename,
          status: failedRecipients.has(faxNumber) ? "failed" : "sending",
        })),
      );

      if (!response.ok || payload.error || failed.length > 0) {
        const firstDetail = failed.find((item) => item.error)?.error;
        setMessage({
          type: "error",
          text:
            payload.error ||
            `Gửi fax chưa hoàn tất. Thành công ${payload.successCount ?? 0}/${payload.total ?? faxNumbers.length}${
              firstDetail ? `: ${firstDetail}` : ""
            }`,
        });
        return;
      }

      setMessage({
        type: "success",
        text: `Đã gửi tài liệu tới Fax API cho ${payload.successCount ?? faxNumbers.length} số fax.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: `Gửi fax thất bại${error instanceof Error ? `: ${error.message}` : ""}`,
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
              <h1>Fax tài liệu</h1>
              <p>Upload file rồi gửi trực tiếp qua Fax API để đối tác nhận đầy đủ nội dung tài liệu.</p>
            </div>
            <Link href="/dashboard" className="btn btn-secondary">
              Về dashboard
            </Link>
          </header>

          <div className="recipient-grid">
            <label className="field">
              <span>Số fax nhận (mỗi dòng một số)</span>
              <textarea
                rows={8}
                value={faxListInput}
                onChange={(event) => setFaxListInput(event.target.value)}
                placeholder={"03-1234-5678\n03-9876-5432"}
              />
            </label>

            <div className="document-upload-panel">
              <label className="field">
                <span>Tài liệu cần fax</span>
                <input
                  type="file"
                  accept="application/pdf,image/*,.txt,.csv,.json,.md"
                  onChange={handleFileChange}
                  disabled={isUploading || isSending}
                />
              </label>

              {document ? (
                <div className="document-preview">
                  <strong>{document.filename}</strong>
                  <small>{document.type || "application/octet-stream"}</small>
                  {isImageDocument(document) ? (
                    <img src={document.url} alt={document.filename} />
                  ) : isPdfDocument(document) ? (
                    <iframe title="PDF preview" src={document.url} />
                  ) : (
                    <a href={document.url} target="_blank" rel="noreferrer">
                      Mở tài liệu
                    </a>
                  )}
                </div>
              ) : (
                <p className="document-empty">{isUploading ? "Đang upload..." : "Chưa upload tài liệu."}</p>
              )}
            </div>
          </div>

          <label className="field">
            <span>Tiêu đề</span>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} />
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
              {isSending ? "Đang gửi..." : "Gửi fax tài liệu"}
            </button>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
