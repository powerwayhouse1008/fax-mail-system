import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "https://sandbox-hea.nexlink2.jp";
const DEFAULT_API_PATH = "/api/v1/facsimiles/direct_send";
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const faxPattern = /^[0-9+\-()\s]{6,30}$/;

type RequestPayload = {
  faxNumbers?: unknown;
  allowInternationalFax?: unknown;
  quality?: unknown;
  uploadedCardUrl?: unknown;
  uploadedCardName?: unknown;
  uploadedCardType?: unknown;
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

function buildAuthHeader(token: string) {
  const trimmed = normalizeAuthToken(token);
  const explicitAuthHeader = readEnv(
    "NEXLINK_AUTH_HEADER",
    "NEXILINK_AUTH_HEADER",
  );

  if (explicitAuthHeader) {
    const normalizedHeader = explicitAuthHeader.replace(/\{\{?token\}?\}/gi, trimmed);
    return {
      Authorization: normalizedHeader.includes(trimmed)
        ? normalizedHeader
        : `${normalizedHeader} ${trimmed}`.trim(),
    };
  }

  const scheme = readAuthScheme();

  return {
    Authorization: scheme ? `${scheme} ${trimmed}` : trimmed,
  };
}
function buildAuthHeaderCandidates(token: string) {
  const trimmed = normalizeAuthToken(token);
  const candidates = new Map<string, string>();

  const explicitAuthHeader = readEnv(
    "NEXLINK_AUTH_HEADER",
    "NEXILINK_AUTH_HEADER",
  );
  if (explicitAuthHeader) {
    const normalizedHeader = explicitAuthHeader.replace(
      /\{\{?token\}?\}/gi,
      trimmed,
    );
    const value = normalizedHeader.includes(trimmed)
      ? normalizedHeader
      : `${normalizedHeader} ${trimmed}`.trim();
    candidates.set(value, value);
  }

  const configured = buildAuthHeader(token).Authorization;
  candidates.set(configured, configured);

  for (const value of [`token ${trimmed}`, `Bearer ${trimmed}`, trimmed]) {
    candidates.set(value, value);
  }

  return Array.from(candidates.values()).map((value) => ({
    Authorization: value,
  }));
}

function normalizeErrorText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return trimmed;
}

function extractErrorDetail(status: number, data: unknown, fallbackText: string) {
  const defaultStatusMessage = (() => {
    if (status === 401) {
      return "認証エラー (HTTP 401) / APIトークン・NEXLINK_AUTH_SCHEME・APIエンドポイントを確認してください";
    }

    if (status === 404) {
      return "エンドポイントが見つかりません (HTTP 404)";
    }

    return `送信エラー (HTTP ${status})`;
  })();

  const details: string[] = [];

  if (typeof data === "string") {
    const normalized = normalizeErrorText(data);
    if (normalized) return normalized;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    for (const key of ["message", "error", "detail", "title"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        details.push(`${key}: ${value.trim()}`);
      }
    }

    if (typeof record.application_error_code === "string" && record.application_error_code.trim()) {
      details.unshift(`application_error_code: ${record.application_error_code.trim()}`);
    }

    if (Array.isArray(record.errors)) {
      for (const item of record.errors) {
        if (typeof item === "string" && item.trim()) {
          details.push(item.trim());
          continue;
        }
        if (item && typeof item === "object") {
          const r = item as Record<string, unknown>;
          if (typeof r.message === "string" && r.message.trim()) {
            details.push(r.message.trim());
          }
          if (typeof r.detail === "string" && r.detail.trim()) {
            details.push(r.detail.trim());
          }
        }
      }
    }

    if (Array.isArray(record.details)) {
      for (const item of record.details) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const parameter =
          typeof r.parameter === "string" ? r.parameter.trim() : "";
        const message =
          typeof r.message === "string" ? r.message.trim() : "";

        if (parameter && message) details.push(`${parameter}: ${message}`);
        else if (message) details.push(message);
      }
    }

    if (details.length > 0) {
      return details.join(" / ");
    }

    const jsonText = JSON.stringify(record);
    if (jsonText && jsonText !== "{}") {
      return `${defaultStatusMessage} / RAW_JSON: ${jsonText}`;
    }

    return defaultStatusMessage;
  }

  const normalizedFallback = normalizeErrorText(fallbackText);
  if (normalizedFallback) return normalizedFallback;

  return defaultStatusMessage;
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
  if (retryAfterMs > 0) return Math.min(retryAfterMs, 10_000);

  const baseDelay = 500;
  const jitter = Math.floor(Math.random() * 250);
  const exponentialDelay = baseDelay * 2 ** attempt;
  return Math.min(exponentialDelay + jitter, 5_000);
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
  let lastFetchError: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(url, {
        ...init,
        cache: "no-store",
      });
    } catch (error) {
      lastFetchError = error;
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await sleep(computeRetryDelayMs(attempt, null));
        continue;
      }
      throw error;
    }

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
      await sleep(
        computeRetryDelayMs(attempt, response.headers.get("retry-after")),
      );
      continue;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText,
    };
  }

  if (lastFetchError) throw lastFetchError;

  return {
    ok: false,
    status: 500,
    data: null,
    rawText: "",
  };
}

function getResolvedDirectSendUrl() {
  const endpointUrl = readEnv("NEXLINK_FAX_ENDPOINT", "NEXILINK_FAX_ENDPOINT");
  if (endpointUrl) return endpointUrl;

  const baseUrl =
    readEnv("NEXLINK_API_BASE_URL", "NEXILINK_API_BASE_URL") || DEFAULT_BASE_URL;
  const apiPath =
    readEnv("NEXLINK_API_PATH", "NEXILINK_API_PATH") || DEFAULT_API_PATH;

  return new URL(apiPath, baseUrl).toString();
}

function getObjectValue<T = unknown>(data: unknown, key: string): T | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return (record[key] as T) ?? null;
}

async function sendDirectFax(params: {
  apiUrl: string;
  apiToken: string;
  faxNumber: string;
  allowInternationalFax: boolean;
  quality: number;
  uploadedCardUrl?: string | null;
  uploadedCardName?: string | null;
  uploadedCardType?: string | null;
}) {
  const requestBody = {
    fax_number: params.faxNumber,
    allow_international_fax: params.allowInternationalFax,
    quality: params.quality,
    uploaded_card_url: params.uploadedCardUrl || null,
  };
  const formData = new FormData();
  formData.append("fax_number", params.faxNumber);
  formData.append("allow_international_fax", String(params.allowInternationalFax));
  formData.append("quality", String(params.quality));

  if (params.uploadedCardUrl) {
    const fileResponse = await fetch(params.uploadedCardUrl, { cache: "no-store" });
    if (!fileResponse.ok) {
      throw new Error(
        `名刺ファイルの取得に失敗しました (HTTP ${fileResponse.status})`,
      );
    }

    const fileBlob = await fileResponse.blob();
    const contentType =
      params.uploadedCardType?.trim() ||
      fileBlob.type ||
      fileResponse.headers.get("content-type") ||
      "application/octet-stream";
    const fallbackExtension = contentType.startsWith("image/")
      ? contentType.replace("image/", "")
      : "bin";
    const filename =
      params.uploadedCardName?.trim() ||
      `uploaded-card.${fallbackExtension}`;

    const file = new File([fileBlob], filename, { type: contentType });
    formData.append("image", file, filename);
  }
  
  console.log("NEXLINK direct_send url =", params.apiUrl);
  console.log("NEXLINK direct_send body =", requestBody);
  const maskedToken = `${params.apiToken.slice(0, 4)}***${params.apiToken.slice(-4)}`;
  console.log("NEXLINK token preview =", maskedToken);

  const authHeaderCandidates = buildAuthHeaderCandidates(params.apiToken);
  let lastResponse: Awaited<ReturnType<typeof fetchJsonWithRetry>> | null = null;

  for (let index = 0; index < authHeaderCandidates.length; index += 1) {
    const authHeader = authHeaderCandidates[index];
    const response = await fetchJsonWithRetry(params.apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeader,
      },
      body: formData,
    });

    lastResponse = response;
    if (response.status !== 401) {
      return response;
    }

    if (index < authHeaderCandidates.length - 1) {
      console.log(
        `NEXLINK auth retry: received HTTP 401 with candidate ${index + 1}/${authHeaderCandidates.length}`,
      );
    }
  }

  if (!lastResponse) {
    throw new Error("NEXLINK API 応答が取得できませんでした。");
  }
  return lastResponse;
}
function parseRequestMethodOverride(payload: RequestPayload) {
  const method = (payload as Record<string, unknown>).method;
  if (typeof method !== "string") return "POST";
  return method.trim().toUpperCase() || "POST";
}

export async function POST(request: Request) {
  const apiUrl = getResolvedDirectSendUrl();
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
    return NextResponse.json(
      { error: "リクエスト形式が不正です。" },
      { status: 400 },
    );
  }
 const requestMethod = parseRequestMethodOverride(payload);
  if (requestMethod !== "POST") {
    return NextResponse.json(
      { error: "NEXLINK direct_send は POST + JSON で呼び出してください。" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "有効なFAX番号がありません。" },
      { status: 400 },
    );
  }

  const allowInternationalFax =
    typeof payload.allowInternationalFax === "boolean"
      ? payload.allowInternationalFax
      : false;

  const quality =
    typeof payload.quality === "number" &&
    Number.isInteger(payload.quality) &&
    payload.quality >= 0
      ? payload.quality
      : 0;
  const uploadedCardUrl =
    typeof payload.uploadedCardUrl === "string" && payload.uploadedCardUrl.trim()
      ? payload.uploadedCardUrl.trim()
      : null;
  const uploadedCardName =
    typeof payload.uploadedCardName === "string" && payload.uploadedCardName.trim()
      ? payload.uploadedCardName.trim()
      : null;
  const uploadedCardType =
    typeof payload.uploadedCardType === "string" && payload.uploadedCardType.trim()
      ? payload.uploadedCardType.trim()
      : null;
  try {
    const results: SendResult[] = [];

    for (const target of validFaxTargets) {
      const response = await sendDirectFax({
        apiUrl,
        apiToken,
        faxNumber: target.normalized,
        allowInternationalFax,
        quality,
        uploadedCardUrl,
        uploadedCardName,
        uploadedCardType,
      });

      console.log("NEXLINK direct_send status =", response.status);
      console.log("NEXLINK direct_send data =", response.data);
      console.log("NEXLINK direct_send rawText =", response.rawText);

      if (!response.ok) {
        results.push({
          to: target.original,
          success: false,
          error: `HTTP ${response.status} / ${extractErrorDetail(
            response.status,
            response.data,
            response.rawText,
          )}`,
          raw: {
            status: response.status,
            data: response.data,
            rawText: response.rawText,
            endpoint: apiUrl,
            requestBody: {
              fax_number: target.normalized,
              allow_international_fax: allowInternationalFax,
              quality,
            },
          },
        });
        continue;
      }

      const id =
        getObjectValue<number | string>(response.data, "id") ??
        getObjectValue<number | string>(response.data, "test_facsimile_id") ??
        getObjectValue<number | string>(response.data, "facsimile_id");

      results.push({
        to: target.original,
        success: true,
        id,
        raw: response.data,
      });
    }

    const successCount = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success);

    return NextResponse.json({
      total: validFaxTargets.length,
      successCount,
      failedCount: failed.length,
      endpoint: apiUrl,
      results,
      failed,
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
