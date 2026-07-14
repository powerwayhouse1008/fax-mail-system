import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

const DEFAULT_BASE_URL = "https://sandbox-hea.nexlink2.jp";
const DEFAULT_FAX_QUALITY = 1;
const DEFAULT_PAPER_SIZE = "A4";
const DEFAULT_MAPPING_COLUMNS: Record<string, number> = { fax: 0 };
const DISALLOWED_MAPPING_COLUMN_KEYS = new Set(["use_print_header"]);
const DISALLOWED_PRINT_HEADER_VALUES = new Set(["use_print_header"]);
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 5;
const TRANSMISSION_POLL_INTERVAL_MS = 10_000;
const TRANSMISSION_POLL_TIMEOUT_MS = 600_000;
const faxPattern = /^[0-9+\-()\s]{6,30}$/;

const API_PATH_CONTACT_LIST = "/api/v1/contact_lists";
const API_PATH_FACSIMILES = "/api/v1/facsimiles";

const AUTH_FALLBACK_ENV_KEYS = [
  "NEXLINK_ENABLE_AUTH_FALLBACK",
  "NEXILINK_ENABLE_AUTH_FALLBACK",
] as const;

type RequestPayload = {
  faxNumbers?: unknown;
  allowInternationalFax?: unknown;
  usePrintHeader?: unknown;
  use_print_header?: unknown;
  faxQuality?: unknown;
  fax_quality?: unknown;
  subject?: unknown;
  printHeaders?: unknown;
  print_headers?: unknown;
  text?: unknown;
  html?: unknown;
  message?: unknown;
  body?: unknown;
  attachments?: unknown;
  attachment?: unknown;
  paperSize?: unknown;
  paper_size?: unknown;
  mapping_columns?: unknown;
  mappingColumns?: unknown;
};

type AttachmentPayload = {
  filename?: unknown;
  content?: unknown;
  data?: unknown;
  base64?: unknown;
  url?: unknown;
  type?: unknown;
  mimeType?: unknown;
  file?: unknown;
};
type BinaryAttachment = {
  filename: string;
  mimeType: string;
  binary: Buffer;
};
type PaperSize = "A3" | "A4";
type PageBox = {
  width: number;
  height: number;
};

type SendResult =
  | {
      to: string;
      success: true;
      id: number | string | null;
      raw?: unknown;
    }
  | {
      to: string;
      success: false;
      error: string;
      raw?: unknown;
    };
type TransmissionRow = Record<string, string>;

type AuthHeader = Record<string, string>;

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeFaxNumber(value: string) {
  const normalized = value
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/[＋－（）]/g, (char) => {
      switch (char) {
        case "＋":
          return "+";
        case "－":
          return "-";
        case "（":
          return "(";
        case "）":
          return ")";
        default:
          return char;
      }
    });

  const candidates = normalized.match(/[+()0-9][0-9+\-()\s]{5,29}/g);
   if (!candidates || candidates.length === 0) return "";

  return candidates[0]
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()\-]/g, "");
}

function normalizeAuthToken(token: string) {
  return token
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/^authorization\s*:\s*/i, "")
    .replace(/^token\s+/i, "")
    .replace(/^bearer\s+/i, "")
    .replace(/^token\s*=\s*/i, "")
    .trim();
}

function readAuthScheme() {
  const scheme = readEnv("NEXLINK_AUTH_SCHEME", "NEXILINK_AUTH_SCHEME")
    .toLowerCase()
    .trim();

  if (scheme === "bearer") return "Bearer";
  if (scheme === "raw") return "";
  return "token";
}

function createAuthorizationHeader(value: string): AuthHeader {
  return { Authorization: value };
}

function parseExplicitAuthHeader(template: string, token: string): AuthHeader {
  const normalizedTemplate = template.trim();
  const resolvedValue = normalizedTemplate.replace(/\{\{?token\}?\}/gi, token);
  const separatorIndex = resolvedValue.indexOf(":");

  if (separatorIndex <= 0) {
    return createAuthorizationHeader(
      resolvedValue.includes(token)
        ? resolvedValue
        : `${resolvedValue} ${token}`.trim(),
    );
  }

  const headerName = resolvedValue.slice(0, separatorIndex).trim();
  const headerValueTemplate = resolvedValue.slice(separatorIndex + 1).trim();
  const headerValue = headerValueTemplate.includes(token)
    ? headerValueTemplate
    : `${headerValueTemplate} ${token}`.trim();

  if (!headerName) {
    return createAuthorizationHeader(headerValue);
  }

  return { [headerName]: headerValue };
}

function buildAuthHeader(token: string): AuthHeader {
  const trimmed = normalizeAuthToken(token);
  const explicitAuthHeader = readEnv(
    "NEXLINK_AUTH_HEADER",
    "NEXILINK_AUTH_HEADER",
  );

  if (explicitAuthHeader) {
    return parseExplicitAuthHeader(explicitAuthHeader, trimmed);
  }

  const scheme = readAuthScheme();
  return createAuthorizationHeader(scheme ? `${scheme} ${trimmed}` : trimmed);
}

function buildAuthHeaderCandidates(token: string) {
  const trimmed = normalizeAuthToken(token);
  const candidates = new Map<string, AuthHeader>();
  const addCandidate = (header: AuthHeader) => {
    const serialized = JSON.stringify(
      Object.keys(header)
        .sort()
        .reduce<Record<string, string>>((acc, key) => {
          acc[key] = header[key];
          return acc;
        }, {}),
    );
    candidates.set(serialized, header);
  };

  const explicitAuthHeader = readEnv(
    "NEXLINK_AUTH_HEADER",
    "NEXILINK_AUTH_HEADER",
  );
  if (explicitAuthHeader) {
    addCandidate(parseExplicitAuthHeader(explicitAuthHeader, trimmed));
  }

  addCandidate(buildAuthHeader(token));

  for (const value of [
    `token ${trimmed}`,
    `Token ${trimmed}`,
    `Bearer ${trimmed}`,
    `token=${trimmed}`,
    `Token token=${trimmed}`,
    trimmed,
  ]) {
    addCandidate(createAuthorizationHeader(value));
  }

  return Array.from(candidates.values());
}

function isTruthyEnvValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function shouldUseAggressiveAuthFallback() {
  for (const key of AUTH_FALLBACK_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return isTruthyEnvValue(value);
    }
  }
  return false;
}

function parseRetryAfterMs(retryAfterHeader: string | null) {
  if (!retryAfterHeader) return 0;

  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds) && Number.isFinite(seconds) && seconds > 0) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const retryAt = Date.parse(retryAfterHeader);
  if (Number.isNaN(retryAt)) return 0;
  return Math.max(0, retryAt - Date.now());
}

function computeRetryDelayMs(attempt: number, retryAfterHeader: string | null) {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs > 0) return Math.min(retryAfterMs, 120_000);

  const baseDelay = 500;
  const jitter = Math.floor(Math.random() * 250);
  const exponentialDelay = baseDelay * 2 ** attempt;
  return Math.min(exponentialDelay + jitter, 15_000);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  rawText: string;
}> {
  let response: Response | null = null;
  let rawText = "";
  let data: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
    });

    rawText = await response.text();

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText || null;
    }

    if (
      RETRYABLE_STATUS_CODES.has(response.status) &&
      attempt < MAX_RETRY_ATTEMPTS - 1
    ) {
      await sleep(computeRetryDelayMs(attempt, response.headers.get("retry-after")));
      continue;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText,
    };
  }

  return {
    ok: false,
    status: response?.status ?? 500,
    data,
    rawText,
  };
}

function resolveFaxQuality(payload: RequestPayload): 0 | 1 {
  const rawFaxQuality = payload.fax_quality ?? payload.faxQuality;
  if (rawFaxQuality === 0 || rawFaxQuality === 1) return rawFaxQuality;
  if (rawFaxQuality === "0") return 0;
  if (rawFaxQuality === "1") return 1;
  return DEFAULT_FAX_QUALITY;
}

function resolvePaperSize(payload: RequestPayload): PaperSize {
  const rawPaperSize = payload.paper_size ?? payload.paperSize;
  if (typeof rawPaperSize !== "string") return DEFAULT_PAPER_SIZE;

  const normalized = rawPaperSize.trim().toUpperCase();
  return normalized === "A3" ? "A3" : "A4";
}

function createPageBox(
  paperSize: PaperSize,
  orientation: "portrait" | "landscape" = "portrait",
): PageBox {
  const base = paperSize === "A3" ? { width: 842, height: 1191 } : { width: 595, height: 842 };
  return orientation === "landscape" ? { width: base.height, height: base.width } : base;
}

function resolvePrintHeaders(payload: RequestPayload): string[] {
  const rawPrintHeaders = payload.print_headers ?? payload.printHeaders;
  const normalizePrintHeaderValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const canonical = trimmed
      .toLowerCase()
      .replace(/\s+/g, "_");

    if (DISALLOWED_PRINT_HEADER_VALUES.has(canonical)) return "";
    return trimmed;
  };
  
  if (Array.isArray(rawPrintHeaders)) {
   return Array.from(
      new Set(
        rawPrintHeaders
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizePrintHeaderValue(item))
          .filter(Boolean),
      ),
    );
  }

  if (typeof rawPrintHeaders === "string") {
    const trimmed = rawPrintHeaders.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => normalizePrintHeaderValue(item))
              .filter(Boolean),
          ),
        );
      }
    } catch {
      const normalizedValue = normalizePrintHeaderValue(trimmed);
      return normalizedValue ? [normalizedValue] : [];
    }
  }

  return [];
}
function resolveBooleanValue(value: unknown, defaultValue: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return defaultValue;
}

function resolveUsePrintHeader(payload: RequestPayload) {
  return resolveBooleanValue(
    payload.use_print_header ?? payload.usePrintHeader,
    false,
  );
}

function normalizeMappingColumns(
  value: unknown,
): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;

  const normalizedEntries: Array<[string, number]> = [];

  for (const [key, rawIndex] of entries) {
    const normalizedKey = key.trim();
    if (!normalizedKey) return null;
    
    let index: number | null = null;
    if (typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0) {
      index = rawIndex;
    } else if (
      typeof rawIndex === "string" &&
      /^\d+$/.test(rawIndex.trim())
    ) {
      index = Number.parseInt(rawIndex.trim(), 10);
    }

    if (index == null) return null;
    normalizedEntries.push([normalizedKey, index]);
  }

  return Object.fromEntries(normalizedEntries);
}
function resolveMappingColumns(payload: RequestPayload): Record<string, unknown> {
  const rawMappingColumns = payload.mapping_columns ?? payload.mappingColumns;
 const isDisallowedMappingColumnKey = (key: string) =>
    DISALLOWED_MAPPING_COLUMN_KEYS.has(key.trim().toLowerCase());
  const sanitizeMappingColumns = (mappingColumns: Record<string, number>) => {
    const sanitized = Object.fromEntries(
      Object.entries(mappingColumns).filter(
        ([key]) => !isDisallowedMappingColumnKey(key),
      ),
    );

    return Object.keys(sanitized).length > 0 ? sanitized : { ...DEFAULT_MAPPING_COLUMNS };
  };
  if (!rawMappingColumns) {
     return { ...DEFAULT_MAPPING_COLUMNS };
  }

  const normalizedObject = normalizeMappingColumns(rawMappingColumns);
  if (normalizedObject) {
    return sanitizeMappingColumns(normalizedObject);
  }

  if (typeof rawMappingColumns === "string") {
    try {
      const parsed = JSON.parse(rawMappingColumns);
     const normalizedParsed = normalizeMappingColumns(parsed);
      if (normalizedParsed) return sanitizeMappingColumns(normalizedParsed);
    } catch {
      // fallback to default mapping below
    }
  }

  return { ...DEFAULT_MAPPING_COLUMNS };
}

function getObjectValue<T = unknown>(data: unknown, key: string): T | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return (record[key] as T) ?? null;
}
function hasAttachmentSource(value: unknown): value is AttachmentPayload {
  if (!value || typeof value !== "object") return false;
  const attachment = value as AttachmentPayload;
  return Boolean(
    (typeof attachment.content === "string" && attachment.content.trim()) ||
     (typeof attachment.data === "string" && attachment.data.trim()) ||
      (typeof attachment.base64 === "string" && attachment.base64.trim()) ||
      (typeof attachment.url === "string" && attachment.url.trim()),
  );
}
function toAttachmentPayload(value: unknown): AttachmentPayload | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      return { url: trimmed };
    }
    return { content: trimmed };
  }

  if (hasAttachmentSource(value)) {
    return value;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = toAttachmentPayload(record.file);
    if (nested) {
      return {
        filename: typeof record.filename === "string" ? record.filename : nested.filename,
        type: typeof record.type === "string" ? record.type : nested.type,
        mimeType:
          typeof record.mimeType === "string" ? record.mimeType : nested.mimeType,
        content: nested.content,
        data: nested.data,
        base64: nested.base64,
        url: nested.url,
      };
    }
  }

  return null;
}

function resolveAttachments(payload: RequestPayload): AttachmentPayload[] {
  const attachments: AttachmentPayload[] = [];

  if (Array.isArray(payload.attachments)) {
    attachments.push(
      ...payload.attachments
      .map((item) => toAttachmentPayload(item))
        .filter((item): item is AttachmentPayload => Boolean(item)),
    );
  }

  const attachmentField = toAttachmentPayload(payload.attachment);
  if (attachmentField) {
    attachments.push(attachmentField);
  }

 const attachmentsField = toAttachmentPayload(payload.attachments);
  if (attachmentsField) {
    attachments.push(attachmentsField);
  }

  return attachments;
}

async function readAttachmentBinary(attachment: AttachmentPayload) {
  const filename = typeof attachment.filename === "string" && attachment.filename.trim()
    ? attachment.filename.trim()
    : "fax-content.pdf";
  const mimeType =
    typeof attachment.mimeType === "string" && attachment.mimeType.trim()
      ? attachment.mimeType.trim()
      : typeof attachment.type === "string" && attachment.type.trim()
      ? attachment.type.trim()
      : "application/pdf";

  const contentSource =
    typeof attachment.content === "string" && attachment.content.trim()
      ? attachment.content
      : typeof attachment.data === "string" && attachment.data.trim()
      ? attachment.data
      : typeof attachment.base64 === "string" && attachment.base64.trim()
      ? attachment.base64
      : "";

  if (contentSource) {
    const rawContent = contentSource.trim();
    const base64 = rawContent.startsWith("data:")
      ? (rawContent.split(",", 2)[1] ?? "")
      : rawContent;
    if (!base64) return null;
    const binary = Buffer.from(base64, "base64");
    return { filename, mimeType, binary };
  }

  if (typeof attachment.url === "string" && attachment.url.trim()) {
    const response = await fetch(attachment.url.trim(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`PDF取得に失敗しました (HTTP ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const responseMimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
    return {
      filename,
      mimeType: responseMimeType || mimeType,
      binary: Buffer.from(arrayBuffer),
    };
  }

  return null;
}

function replaceExtension(filename: string, extension: string) {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, "");
  return `${withoutExtension}${extension}`;
}
function ensurePdfFilename(filename: string) {
  const trimmed = filename.trim();
  const leaf = trimmed.split(/[\\/]/).pop() ?? "";
  const withoutQuery = leaf.split(/[?#]/)[0] ?? "";
  const normalized = withoutQuery.trim();
  if (!normalized) return "fax-content.pdf";

  const pdfNamed = /\.pdf$/i.test(normalized) ? normalized : replaceExtension(normalized, ".pdf");
  return pdfNamed.toLowerCase().endsWith(".pdf") ? pdfNamed : "fax-content.pdf";
}

function isPdfBinary(binary: Buffer) {
  return binary.subarray(0, 4).toString("ascii") === "%PDF";
}
function isLikelyValidPdf(binary: Buffer) {
  if (!isPdfBinary(binary)) return false;

  const tail = binary.subarray(Math.max(0, binary.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) return false;

  const head = binary.subarray(0, Math.min(binary.length, 4096)).toString("latin1");
  return head.includes("xref") || head.includes("/XRef") || head.includes("/Type /Catalog");
}

async function resizePdfToPaperSize(binary: Buffer, paperSize: PaperSize) {
  const source = await PDFDocument.load(binary, { ignoreEncryption: true });
  const target = await PDFDocument.create();

  for (let index = 0; index < source.getPageCount(); index += 1) {
    const [embeddedPage] = await target.embedPdf(source, [index]);
    const originalWidth = embeddedPage.width;
    const originalHeight = embeddedPage.height;
    const orientation = originalWidth > originalHeight ? "landscape" : "portrait";
    const pageBox = createPageBox(paperSize, orientation);
    const scale = Math.min(pageBox.width / originalWidth, pageBox.height / originalHeight);
    const drawWidth = originalWidth * scale;
    const drawHeight = originalHeight * scale;
    const page = target.addPage([pageBox.width, pageBox.height]);

    page.drawPage(embeddedPage, {
      x: (pageBox.width - drawWidth) / 2,
      y: (pageBox.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return Buffer.from(await target.save({ useObjectStreams: false }));
}

function toPdfLiteralString(value: string) {
  const normalized = value
    .replace(/[\r\n]+/g, " ")
    .slice(0, 180)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  return `(${normalized || " "})`;
}

function createSimplePdf(lines: string[], paperSize: PaperSize = DEFAULT_PAPER_SIZE) {
  const page = createPageBox(paperSize);
  const normalizedLines = lines.slice(0, 90);
  const textOps = normalizedLines.length
    ? normalizedLines
                .map((line) => `${toPdfLiteralString(line)} Tj`)
        .join(" T* ")
        : `${toPdfLiteralString(" ")} Tj`;
  const contentStream = `BT /F1 11 Tf 50 ${page.height - 50} Td 14 TL ${textOps} ET`;
  const contentLength = Buffer.byteLength(contentStream, "utf-8");

  const objects: string[] = [
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n`,
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    `5 0 obj << /Length ${contentLength} >> stream
${contentStream}
endstream endobj
`,
  ];

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(output, "utf-8"));
    output += obj;
  }

  const xrefStart = Buffer.byteLength(output, "utf-8");
  output += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;
  for (let i = 1; i < offsets.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n 
`;
  }
  output += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefStart}
%%EOF
`;
  return Buffer.from(output, "utf-8");
}
function createJpegPdf(imageBinary: Buffer, paperSize: PaperSize = DEFAULT_PAPER_SIZE) {
  let width = 1200;
  let height = 1600;

  for (let i = 0; i < imageBinary.length - 9; i += 1) {
    if (imageBinary[i] === 0xff && imageBinary[i + 1] === 0xc0) {
      height = imageBinary.readUInt16BE(i + 5);
      width = imageBinary.readUInt16BE(i + 7);
      break;
    }
  }

  const page = createPageBox(paperSize, width > height ? "landscape" : "portrait");
  const pageWidth = page.width;
  const pageHeight = page.height;
  const scale = Math.min(pageWidth / width, pageHeight / height);
  const drawWidth = Math.max(1, Math.floor(width * scale));
  const drawHeight = Math.max(1, Math.floor(height * scale));
  const x = Math.floor((pageWidth - drawWidth) / 2);
  const y = Math.floor((pageHeight - drawHeight) / 2);

  const contentStream = `q ${drawWidth} 0 0 ${drawHeight} ${x} ${y} cm /Im0 Do Q`;
  const contentLength = Buffer.byteLength(contentStream, "utf-8");
  const imageLength = imageBinary.length;

  const objects: Buffer[] = [
    Buffer.from(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
`, "ascii"),
    Buffer.from(`2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
`, "ascii"),
    Buffer.from(
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >> endobj
`,
      "ascii",
    ),
    Buffer.concat([
      Buffer.from(
        `4 0 obj << /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageLength} >> stream
`,
        "ascii",
      ),
      imageBinary,
      Buffer.from(`
endstream endobj
`, "ascii"),
       ]),
    Buffer.from(`5 0 obj << /Length ${contentLength} >> stream
${contentStream}
endstream endobj
`, "ascii"),
  ];

    let output = Buffer.from(`%PDF-1.4
`, "ascii");
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(output.length);
    output = Buffer.concat([output, obj]);
  }

  const xrefStart = output.length;
  let xref = `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n 
`;
  }
  xref += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefStart}
%%EOF
`;
  return Buffer.concat([output, Buffer.from(xref, "ascii")]);
}
function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPayloadLines(payload: RequestPayload): string[] {
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const textBodyCandidates = [payload.text, payload.message, payload.body];
  const textBody = textBodyCandidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const htmlBody = typeof payload.html === "string" ? payload.html.trim() : "";
  const body = textBody?.trim() || (htmlBody ? htmlToPlainText(htmlBody) : "");

  if (!subject && !body) return [];
  
  return [
    subject ? `件名: ${subject}` : "",
    subject && body ? "" : "",
    body,
  ]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/);
}

function buildPayloadPdfAttachment(payload: RequestPayload, paperSize: PaperSize): BinaryAttachment | null {
  const lines = buildPayloadLines(payload);
  if (!lines.length) return null;
  
  return {
    filename: "fax-content.pdf",
    mimeType: "application/pdf",
    binary: createSimplePdf(lines, paperSize),
  };
}

function textToPdf(binary: Buffer, paperSize: PaperSize) {
  const utf8Text = binary.toString("utf-8");
  const hasReplacementCharacters = utf8Text.includes("\uFFFD");
  const hasMojibakePattern = /[ãâ][\x80-\xBF]/.test(utf8Text);

  let text = utf8Text;
  if (hasReplacementCharacters || hasMojibakePattern) {
    try {
      text = new TextDecoder("shift_jis").decode(binary);
    } catch {
      text = utf8Text;
    }
  }
  return createSimplePdf(text.split(/\r?\n/), paperSize);
}

async function ensurePdfAttachment(
  file: BinaryAttachment,
  paperSize: PaperSize,
): Promise<BinaryAttachment> {
  const mimeType = file.mimeType.toLowerCase();
  
if (mimeType.startsWith("image/")) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      return {
        filename: replaceExtension(file.filename, ".pdf"),
        mimeType: "application/pdf",
        binary: createJpegPdf(file.binary, paperSize),
      };
    }
    return {
      filename: replaceExtension(file.filename, ".pdf"),
      mimeType: "application/pdf",
      binary: createSimplePdf([
        "画像ファイルを受信しました。",
        `元ファイル名: ${file.filename}`,
        "JPEG画像はそのままFAX送信用PDFに変換されます。",
        "PNG/HEIC等は未対応のため、PDF化して添付してください。",
      ], paperSize),
    };
  }

  if (mimeType === "application/pdf" || isPdfBinary(file.binary)) {
    if (!isLikelyValidPdf(file.binary)) {
      return {
        filename: replaceExtension(file.filename, ".pdf"),
        mimeType: "application/pdf",
        binary: createSimplePdf([
          "アップロードされたPDFを検証したところ、FAX送信APIで受理されない形式でした。",
          `元ファイル名: ${file.filename}`,
          "",
          "PDFを再保存（印刷→PDF）して再アップロードしてください。",
        ], paperSize),
      };
    }
    return {
      filename: ensurePdfFilename(file.filename),
      mimeType: "application/pdf",
      binary: await resizePdfToPaperSize(file.binary, paperSize),
    };
  }

  if (
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "application/json" ||
    mimeType === "text/markdown"
  ) {
    return {
      filename: replaceExtension(file.filename, ".pdf"),
      mimeType: "application/pdf",
      binary: textToPdf(file.binary, paperSize),
    };
  }

  return {
    filename: replaceExtension(file.filename, ".pdf"),
    mimeType: "application/pdf",
    binary: createSimplePdf([
      "元ファイルをPDFへ自動変換しました。",
      `ファイル名: ${file.filename}`,
      `MIMEタイプ: ${file.mimeType}`,
      "",
      "※ この形式の本文自動変換には未対応のため、送信用の簡易PDFを生成しています。",
    ], paperSize),
  };
}
function extractFirstImageUrlFromHtml(html: string) {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!match) return "";
  const candidate = match[1]?.trim() ?? "";
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}

async function buildInlineImageAttachment(payload: RequestPayload): Promise<BinaryAttachment | null> {
  const html = typeof payload.html === "string" ? payload.html.trim() : "";
  if (!html) return null;

  const imageUrl = extractFirstImageUrlFromHtml(html);
  if (!imageUrl) return null;

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) return null;

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  if (!mimeType.startsWith("image/")) return null;

  const arrayBuffer = await response.arrayBuffer();
  const extension = mimeType.split("/")[1] || "bin";
  return {
    filename: `fax-inline-image.${extension}`,
    mimeType,
    binary: Buffer.from(arrayBuffer),
  };
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);
  return arrayBuffer;
}

function cp932CsvBuffer(faxNumber: string) {
  // CSV contains only ASCII (FAX + digits/symbols), which is byte-compatible with CP932.
  const csv = `FAX\r\n${faxNumber}\r\n`;
  return Buffer.from(csv, "ascii");
}

function getBaseUrl() {
  return readEnv("NEXLINK_API_BASE_URL", "NEXILINK_API_BASE_URL") || DEFAULT_BASE_URL;
}

function buildUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

async function callWithAuthFallback(
  url: string,
  apiToken: string,
  buildInit: (header: AuthHeader) => RequestInit,
) {
  const aggressiveAuthFallback = shouldUseAggressiveAuthFallback();
  const authHeaderCandidates = aggressiveAuthFallback
    ? buildAuthHeaderCandidates(apiToken)
    : [buildAuthHeader(apiToken)];

  let lastResponse: Awaited<ReturnType<typeof fetchJsonWithRetry>> | null = null;

  for (const authHeader of authHeaderCandidates) {
    const response = await fetchJsonWithRetry(url, buildInit(authHeader));
    lastResponse = response;
    if (response.ok) return response;
    if (response.status !== 401 && response.status !== 403) return response;
  }

  if (!lastResponse) {
    throw new Error("NEXLINK API 応答が取得できませんでした。");
  }

  return lastResponse;
}

function extractErrorMessage(response: Awaited<ReturnType<typeof fetchJsonWithRetry>>) {
  if (typeof response.data === "string" && response.data.trim()) return response.data.trim();
  if (response.data && typeof response.data === "object") {
    const message =
      getObjectValue<string>(response.data, "message") ??
      getObjectValue<string>(response.data, "error") ??
      getObjectValue<string>(response.data, "detail");
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return response.rawText || `HTTP ${response.status}`;
}

async function createContactList(
  baseUrl: string,
  apiToken: string,
  faxNumber: string,
  mappingColumns: Record<string, unknown>,
) {
  const url = buildUrl(baseUrl, API_PATH_CONTACT_LIST);
  const csvBuffer = cp932CsvBuffer(faxNumber);

  const response = await callWithAuthFallback(url, apiToken, (authHeader) => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([csvBuffer], { type: "text/csv; charset=CP932" }),
      "recipient-list.csv",
    );
    formData.append("mapping_columns", JSON.stringify(mappingColumns));
    return {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeader,
      },
      body: formData,
    };
  });

  if (!response.ok) {
    throw new Error(`宛先リスト作成失敗: ${extractErrorMessage(response)}`);
  }

  const contactListId =
    getObjectValue<number | string>(response.data, "id") ??
    getObjectValue<number | string>(response.data, "contact_list_id");

  if (contactListId == null) {
    throw new Error("宛先リストIDが取得できませんでした。");
  }

  return { contactListId, raw: response.data };
}

async function createFacsimile(
  baseUrl: string,
  apiToken: string,
  contactListId: number | string,
  allowInternationalFax: boolean,
  faxQuality: 0 | 1,
  usePrintHeader: boolean,
  printHeaders: string[],
) {
  const url = buildUrl(baseUrl, API_PATH_FACSIMILES);

  const response = await callWithAuthFallback(url, apiToken, (authHeader) => ({
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify({
      contact_list_id: contactListId,
      allow_international_fax: allowInternationalFax,
      fax_quality: faxQuality,
      use_print_header: usePrintHeader,
      print_headers: usePrintHeader ? printHeaders : [],
    }),
  }));

  if (!response.ok) {
    throw new Error(`FAX作成失敗: ${extractErrorMessage(response)}`);
  }

  const facsimileId =
    getObjectValue<number | string>(response.data, "id") ??
    getObjectValue<number | string>(response.data, "facsimile_id");

  if (facsimileId == null) {
    throw new Error("facsimile_id が取得できませんでした。");
  }

  return { facsimileId, raw: response.data };
}

async function uploadFacsimileContent(
  baseUrl: string,
  apiToken: string,
  facsimileId: number | string,
  file: { filename: string; mimeType: string; binary: Buffer },
) {
  const url = buildUrl(baseUrl, `${API_PATH_FACSIMILES}/${facsimileId}/contents`);
  const filename = ensurePdfFilename(file.filename);
  const response = await callWithAuthFallback(url, apiToken, (authHeader) => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([toArrayBuffer(file.binary)], { type: "application/pdf" }),
      filename,
    );

    return {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeader,
      },
      body: formData,
    };
  });

  if (!response.ok) {
    throw new Error(`PDFアップロード失敗: ${extractErrorMessage(response)}`);
  }

  return response.data;
}

async function transmitFacsimile(
  baseUrl: string,
  apiToken: string,
  facsimileId: number | string,
) {
  const url = buildUrl(baseUrl, `${API_PATH_FACSIMILES}/${facsimileId}/transmission`);
  const response = await callWithAuthFallback(url, apiToken, (authHeader) => ({
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify({}),
  }));

  if (!response.ok) {
    throw new Error(`FAX送信失敗: ${extractErrorMessage(response)}`);
  }

  return response.data;
}
function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseTransmissionCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map<TransmissionRow>((line) => {
    const columns = parseCsvLine(line);
    return headers.reduce<TransmissionRow>((acc, header, idx) => {
      acc[header] = columns[idx] ?? "";
      return acc;
    }, {});
  });
}

function isFinalizedTransmission(row: TransmissionRow) {
  return Boolean((row["確定日時"] || "").trim());
}

function summarizeTransmissionStatus(rows: TransmissionRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = (row["ステータス"] || "").trim() || "UNKNOWN";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

async function fetchTransmissionCsv(
  baseUrl: string,
  apiToken: string,
  facsimileId: number | string,
) {
  const url = buildUrl(baseUrl, `${API_PATH_FACSIMILES}/${facsimileId}/transmission`);
  const response = await callWithAuthFallback(url, apiToken, (authHeader) => ({
    method: "GET",
    headers: {
      Accept: "text/csv",
      ...authHeader,
    },
  }));

  if (!response.ok) {
    throw new Error(`送信結果取得失敗: ${extractErrorMessage(response)}`);
  }

  if (typeof response.data === "string") return response.data;
  if (response.rawText) return response.rawText;
  return "";
}

async function pollTransmissionUntilFinalized(
  baseUrl: string,
  apiToken: string,
  facsimileId: number | string,
) {
  const start = Date.now();

  while (true) {
    const csvText = await fetchTransmissionCsv(baseUrl, apiToken, facsimileId);
    const rows = parseTransmissionCsv(csvText);
    const finalizedRows = rows.filter(isFinalizedTransmission);
    const allFinalized = rows.length > 0 && finalizedRows.length === rows.length;

    if (allFinalized) {
      return {
        completed: true,
        timedOut: false,
        rows,
        finalizedCount: finalizedRows.length,
        totalCount: rows.length,
        stats: summarizeTransmissionStatus(rows),
      };
    }

    if (Date.now() - start >= TRANSMISSION_POLL_TIMEOUT_MS) {
      return {
        completed: false,
        timedOut: true,
        rows,
        finalizedCount: finalizedRows.length,
        totalCount: rows.length,
        stats: summarizeTransmissionStatus(rows),
      };
    }

    await sleep(TRANSMISSION_POLL_INTERVAL_MS);
  }
}

export async function POST(request: Request) {
  const apiToken = readEnv(
    "NEXLINK_API_TOKEN",
    "NEXILINK_API_TOKEN",
    "NEXLINK_API_KEY",
    "NEXILINK_API_KEY",
  );

  if (!apiToken) {
    return NextResponse.json(
      { error: "NEXLINK_API_TOKEN が未設定です。" },
      { status: 500 },
    );
  }

  let payload: RequestPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const faxNumbers = Array.isArray(payload.faxNumbers)
    ? payload.faxNumbers
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
    : [];

  const validFaxTargets = faxNumbers
    .map((original) => ({
      original,
      normalized: normalizeFaxNumber(original),
    }))
    .filter((item) => faxPattern.test(item.normalized));

  if (validFaxTargets.length === 0) {
    return NextResponse.json({ error: "有効なFAX番号がありません。" }, { status: 400 });
  }

  const paperSize = resolvePaperSize(payload);
  const attachments = resolveAttachments(payload);
  let pdfFiles: BinaryAttachment[] = [];
  if (attachments.length > 0) {
    try {
      const convertedFiles = await Promise.all(
        attachments.map(async (attachment) => {
          const attachmentFile = await readAttachmentBinary(attachment);
          return attachmentFile ? ensurePdfAttachment(attachmentFile, paperSize) : null;
        }),
      );
      pdfFiles = convertedFiles.filter((file): file is BinaryAttachment => Boolean(file));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "ファイルの読み込み、またはPDF変換に失敗しました。";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    const generatedPdfFile = buildPayloadPdfAttachment(payload, paperSize);
    pdfFiles = generatedPdfFile ? [generatedPdfFile] : [];
  }

  if (pdfFiles.length === 0) {
    return NextResponse.json(
      {
        error:
          "PDFファイルが必要です。attachments[0] を指定するか、text/html/subject を含めて本文からPDFを自動生成してください。",
      },
      { status: 400 },
    );
  }

  const allowInternationalFax =
    typeof payload.allowInternationalFax === "boolean"
      ? payload.allowInternationalFax
      : false;
  const faxQuality = resolveFaxQuality(payload);
   const usePrintHeader = resolveUsePrintHeader(payload);
  const printHeaders = usePrintHeader ? resolvePrintHeaders(payload) : [];
  const mappingColumns = resolveMappingColumns(payload);
  const baseUrl = getBaseUrl();

  try {
    const results: SendResult[] = [];

    for (const target of validFaxTargets) {
      try {
        const contactList = await createContactList(
          baseUrl,
          apiToken,
          target.normalized,
          mappingColumns,
        );
        const facsimile = await createFacsimile(
          baseUrl,
          apiToken,
          contactList.contactListId,
          allowInternationalFax,
          faxQuality,
          usePrintHeader,
          printHeaders,
        );
        const contents = [];
        for (const pdfFile of pdfFiles) {
          contents.push(
            await uploadFacsimileContent(
              baseUrl,
              apiToken,
              facsimile.facsimileId,
              pdfFile,
            ),
          );
        }
        const transmission = await transmitFacsimile(baseUrl, apiToken, facsimile.facsimileId);
        results.push({
          to: target.original,
          success: true,
          id: facsimile.facsimileId,
          raw: {
            contactList: contactList.raw,
            facsimile: facsimile.raw,
            contents,
            transmission,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        results.push({
          to: target.original,
          success: false,
          error: message,
        });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success);

    return NextResponse.json({
      total: validFaxTargets.length,
      successCount,
      failedCount: failed.length,
      results,
      failed,
      flow: [
        "POST /api/v1/contact_lists",
        "POST /api/v1/facsimiles",
        "POST /api/v1/facsimiles/:facsimile_id/contents",
        "POST /api/v1/facsimiles/:facsimile_id/transmission",
      ],
      csvEncoding: "CP932",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました。";

    return NextResponse.json(
      {
        error: `NEXLINK API 通信に失敗しました。(${message})`,
      },
      { status: 500 },
    );
  }
}
