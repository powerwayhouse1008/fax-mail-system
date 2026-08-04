"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import AuthGuard from "../components/auth-guard";
import { LANGUAGE_CHANGE_EVENT, LANGUAGE_STORAGE_KEY } from "../components/language-switcher";
import { appendSendHistory } from "../send-history/history-store";

type Locale = "en" | "ja" | "vi" | "zh";

type UploadedDocument = {
  filename: string;
  type: string;
  url: string;
};

type PreparedDocument = {
  filename: string;
  type: string;
  content: string;
};

type SendResponse = {
  total?: number;
  successCount?: number;
  failed?: { to?: string; error?: string }[];
  error?: string;
};

const FAX_IMAGE_MAX_WIDTH = 2480;
const FAX_IMAGE_MAX_HEIGHT = 3508;
const FAX_PDF_RENDER_MAX_WIDTH = 2480;
const FAX_PDF_RENDER_MAX_HEIGHT = 3508;
const WHITE_PIXEL_THRESHOLD = 248;
const PDF_CROP_MARGIN = 32;
const SMALL_PDF_CONTENT_RATIO = 0.55;

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
    removeDocument: "Remove",
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
    removeDocument: "\u524a\u9664",
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
    removeDocument: "Xoa",
  },
  zh: {
    title: "文档传真",
    description: "上传多个文件并通过 Fax API 发送，让收件人收到完整的文档内容。",
    backToDashboard: "返回仪表板",
    faxNumbersLabel: "收件传真号码（每行一个）",
    documentLabel: "要发送的文档",
    emptyDocument: "尚未上传文档。",
    uploading: "正在上传...",
    openDocument: "打开文档",
    subjectLabel: "主题",
    defaultSubject: "文档传真",
    sendButton: "发送文档传真",
    sendingButton: "正在发送...",
    missingDocument: "发送传真前请至少上传一个文档。",
    missingFaxNumber: "请至少输入一个传真号码。",
    uploadFailed: "文件上传失败",
    sendPartial: "传真发送未完全完成。",
    sendSuccess: "已将文档发送到 Fax API，数量:",
    sendFailed: "传真发送失败",
    recipientsUnit: "个传真号码",
  },
} as const;

const detectLocale = (): Locale => {
  if (typeof window === "undefined") return "ja";
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "en" || saved === "ja" || saved === "vi" || saved === "zh") return saved;

  const language = window.navigator.language.toLowerCase();
  if (language.startsWith("en")) return "en";
  if (language.startsWith("vi")) return "vi";
  if (language.startsWith("zh")) return "zh";
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

const isValidMimeType = (value: string) => /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value);

const normalizeMimeType = (value: string, fallback = "application/octet-stream") => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return fallback;
  if (trimmed === "image/jpg" || trimmed === "image/pjpeg" || trimmed === "image/jfif") return "image/jpeg";
  return isValidMimeType(trimmed) ? trimmed : fallback;
};

const inferMimeTypeFromFilename = (filename: string, fallback = "application/octet-stream") => {
  if (/\.pdf$/i.test(filename)) return "application/pdf";
  if (/\.(jpe?g|jfif)$/i.test(filename)) return "image/jpeg";
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.gif$/i.test(filename)) return "image/gif";
  if (/\.bmp$/i.test(filename)) return "image/bmp";
  if (/\.webp$/i.test(filename)) return "image/webp";
  if (/\.csv$/i.test(filename)) return "text/csv";
  if (/\.json$/i.test(filename)) return "application/json";
  if (/\.(txt|md)$/i.test(filename)) return "text/plain";
  return fallback;
};

const getFileMimeType = (file: File) =>
  normalizeMimeType(file.type, inferMimeTypeFromFilename(file.name));

const isRasterImageFile = (file: File) =>
  getFileMimeType(file).startsWith("image/") || /\.(png|jpe?g|jfif)$/i.test(file.name);

const isPdfFile = (file: File) => getFileMimeType(file) === "application/pdf" || /\.pdf$/i.test(file.name);

const replaceFileExtension = (filename: string, extension: string) =>
  filename.replace(/\.[^./\\]+$/, "") + extension;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("File could not be read."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, filename: string, fallbackType: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = normalizeMimeType(blob.type, normalizeMimeType(fallbackType, inferMimeTypeFromFilename(filename)));
  return new File([blob], filename, { type: mimeType });
};

const uploadDocumentFile = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("channel", "fax");
  formData.append("scope", "document-fax");
  formData.append("category", "documents");

  const response = await fetch("/api/storage/upload", {
    method: "POST",
    body: formData,
  });

  const data = (await response.json()) as { url?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "File upload failed");
  }
  if (!data.url) {
    throw new Error("File upload failed");
  }

  return data.url;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be prepared for fax."));
    image.src = src;
  });

const getNonWhiteBounds = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha === 0) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red >= WHITE_PIXEL_THRESHOLD && green >= WHITE_PIXEL_THRESHOLD && blue >= WHITE_PIXEL_THRESHOLD) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    x: Math.max(0, minX - PDF_CROP_MARGIN),
    y: Math.max(0, minY - PDF_CROP_MARGIN),
    width: Math.min(width, maxX + PDF_CROP_MARGIN + 1) - Math.max(0, minX - PDF_CROP_MARGIN),
    height: Math.min(height, maxY + PDF_CROP_MARGIN + 1) - Math.max(0, minY - PDF_CROP_MARGIN),
  };
};

const createFaxPngFromCanvas = (
  sourceCanvas: HTMLCanvasElement,
  sourceContext: CanvasRenderingContext2D,
) => {
  const bounds = getNonWhiteBounds(sourceContext, sourceCanvas.width, sourceCanvas.height) ?? {
    x: 0,
    y: 0,
    width: sourceCanvas.width,
    height: sourceCanvas.height,
  };
  const scale = Math.min(FAX_PDF_RENDER_MAX_WIDTH / bounds.width, FAX_PDF_RENDER_MAX_HEIGHT / bounds.height);
  const width = Math.max(1, Math.round(bounds.width * Math.min(1, scale)));
  const height = Math.max(1, Math.round(bounds.height * Math.min(1, scale)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF could not be prepared for fax.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(sourceCanvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, width, height);
  return canvas.toDataURL("image/png");
};

const createPdfDocumentFromOriginalFile = async (file: File) => {
  const content = await readFileAsDataUrl(file);
  return [
    {
      filename: file.name,
      type: file.type || "application/pdf",
      content,
    },
  ];
};

const prepareImageForFax = async (file: File) => {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(
    1,
    FAX_IMAGE_MAX_WIDTH / image.naturalWidth,
    FAX_IMAGE_MAX_HEIGHT / image.naturalHeight,
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image could not be prepared for fax.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return {
    filename: replaceFileExtension(file.name, ".png"),
    type: "image/png",
    content: canvas.toDataURL("image/png"),
  };
};

const preparePdfForFax = async (file: File) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const documents: PreparedDocument[] = [];
  const baseFilename = file.name.replace(/\.[^./\\]+$/, "");
  let shouldConvertToImage = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(FAX_PDF_RENDER_MAX_WIDTH / viewport.width, FAX_PDF_RENDER_MAX_HEIGHT / viewport.height);
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(scaledViewport.width));
    canvas.height = Math.max(1, Math.round(scaledViewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF could not be prepared for fax.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    const contentBounds = getNonWhiteBounds(context, canvas.width, canvas.height);
    const isSmallContentPdf =
      contentBounds != null &&
      contentBounds.width / canvas.width < SMALL_PDF_CONTENT_RATIO &&
      contentBounds.height / canvas.height < SMALL_PDF_CONTENT_RATIO;

    if (!isSmallContentPdf) {
      await pdf.destroy();
      return createPdfDocumentFromOriginalFile(file);
    }

    shouldConvertToImage = true;

    documents.push({
      filename: `${baseFilename}-page-${pageNumber}.png`,
      type: "image/png",
      content: createFaxPngFromCanvas(canvas, context),
    });
  }

  await pdf.destroy();
  return shouldConvertToImage ? documents : createPdfDocumentFromOriginalFile(file);
};

const prepareFileForFax = async (file: File): Promise<UploadedDocument[]> => {
  const preparedDocuments = isPdfFile(file)
    ? await preparePdfForFax(file)
    : [
        isRasterImageFile(file)
          ? await prepareImageForFax(file)
          : {
              filename: file.name,
              type: getFileMimeType(file),
              content: await readFileAsDataUrl(file),
            },
      ];

  return Promise.all(
    preparedDocuments.map(async (document) => {
      const preparedFile = await dataUrlToFile(document.content, document.filename, document.type);
      const url = await uploadDocumentFile(preparedFile);
      return {
        filename: document.filename,
        type: document.type,
        url,
      };
    }),
  );
};

const readSendResponse = async (response: Response): Promise<SendResponse> => {
  const rawText = await response.text();
  if (!rawText.trim()) return {};

  try {
    return JSON.parse(rawText) as SendResponse;
  } catch {
    return { error: rawText.trim() };
  }
};

const createShortJapaneseError = (value: unknown) => {
  const raw = typeof value === "string" ? value : value instanceof Error ? value.message : "";
  if (!raw.trim()) return "\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002";
  const normalizedRaw = raw.trim();

  if (/0050002|\u7528\u7d19\u30b5\u30a4\u30ba|\\u7528\\u7d19\\u30b5\\u30a4\\u30ba|A4|A3|B4/.test(raw)) {
    return "FAX API\u304c\u539f\u7a3f\u30b5\u30a4\u30ba\u3092\u53d7\u3051\u4ed8\u3051\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5225\u306ePDF\u307e\u305f\u306f\u753b\u50cf\u3067\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002";
  }

  if (
    /configuration is missing|NEXLINK_API_TOKEN が未設定|NEXLINK_API_TOKEN .*missing|Set NEXLINK_API_TOKEN/i.test(
      raw,
    )
  ) {
    return "FAX API\u306e\u8a2d\u5b9a\u304c\u672a\u5b8c\u4e86\u3067\u3059\u3002";
  }

  if (/401|403|unauthorized|forbidden|authentication|authorization/i.test(raw)) {
    return "FAX API\u306e\u8a8d\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002";
  }

  if (/\u6709\u52b9\u306aFAX|fax/i.test(raw) && /\u756a\u53f7|number/i.test(raw)) {
    return "FAX\u756a\u53f7\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
  }

  return normalizedRaw.length > 180
    ? `${normalizedRaw.slice(0, 180)}...`
    : normalizedRaw;
};

export default function DocumentFaxPage() {
  const [locale, setLocale] = useState<Locale>("ja");
  const [faxListInput, setFaxListInput] = useState("");
  const [subject, setSubject] = useState("");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const t = translations[locale];
  const removeDocumentLabel = "removeDocument" in t ? t.removeDocument : "Remove";
  const faxNumbers = useMemo(() => cleanFaxNumbers(faxListInput), [faxListInput]);
  const resolvedSubject = subject.trim() || t.defaultSubject;

  useEffect(() => {
    setLocale(detectLocale());
    const handleLocaleChange = (event: Event) => {
      const nextLocale = (event as CustomEvent<{ locale?: Locale }>).detail?.locale;
      if (nextLocale && translations[nextLocale]) setLocale(nextLocale);
    };
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLocaleChange);

    return () => {
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLocaleChange);
    };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setMessage(null);

    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedDocumentGroups = await Promise.all(files.map(prepareFileForFax));
      setDocuments((currentDocuments) => [...currentDocuments, ...uploadedDocumentGroups.flat()]);
      event.target.value = "";
    } catch (error) {
      setMessage({
        type: "error",
        text: createShortJapaneseError(error),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeDocument = (indexToRemove: number) => {
    setDocuments((currentDocuments) => currentDocuments.filter((_, index) => index !== indexToRemove));
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

      const payload = await readSendResponse(response);
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
                      <div className="document-preview-header">
                        <div>
                          <strong>{document.filename}</strong>
                          <small>{document.type || "application/octet-stream"}</small>
                        </div>
                        <button
                          type="button"
                          className="document-remove-btn"
                          onClick={() => removeDocument(index)}
                          disabled={isSending}
                        >
                          {removeDocumentLabel}
                        </button>
                      </div>
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
