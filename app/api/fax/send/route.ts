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
    .replace(/`/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/^authorization\s*:\s*/i, "")
    .replace(/^token\s*[:\s]\s*/i, "")
    .replace(/^bearer\s+/i, "")
    .trim();
}

function buildAuthHeader(token: string, scheme = "token") {
  const trimmed = normalizeAuthToken(token);
  if (!trimmed) return {};
  return {
    Authorization: `${scheme} ${trimmed}`,
  };
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

function isLikelyNotFoundHtml(body: string) {
  const normalized = normalizeErrorText(body).toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("404") ||
    normalized.includes("お探しのページが見つかりませんでした") ||
    normalized.includes("ページが見つかりませんでした")
  );
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

function extractErrorDetail(status: number, data: unknown, fallbackText: string) {
  const details: string[] = [];
const seenDetails = new Set<string>();

  const appendDetail = (value: string) => {
    const normalized = normalizeErrorText(value);
    if (!normalized) return;
    if (isLikelyNotFoundHtml(normalized)) {
      details.push(
        "NEXLINK API のページが見つかりませんでした。Base URL または direct_send エンドポイントをご確認ください。",
      );
      return;
    }
    if (seenDetails.has(normalized)) return;
    seenDetails.add(normalized);
    details.push(normalized);
  };
  const collectTextDetails = (value: unknown) => {
    if (typeof value === "string") {
      appendDetail(value);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "title"]) {
      const text = record[key];
      if (typeof text === "string") appendDetail(text);
    }
  };

  if (typeof data === "string" && data.trim()) {
    appendDetail(data);
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

     collectTextDetails(record);

    if (typeof record.application_error_code === "string" && record.application_error_code.trim()) {
      details.unshift(`application_error_code: ${record.application_error_code.trim()}`);
    }

    if (Array.isArray(record.errors)) {
      for (const item of record.errors) {
        if (typeof item === "string" && item.trim()) {
           appendDetail(item);
          continue;
        }
        if (item && typeof item === "object") {
          const errorRecord = item as Record<string, unknown>;
          collectTextDetails(errorRecord);
        }
      }
    }

    if (Array.isArray(record.details)) {
      for (const item of record.details) {
        if (!item || typeof item !== "object") continue;
        const detailRecord = item as Record<string, unknown>;
        const parameter =
          typeof detailRecord.parameter === "string"
            ? detailRecord.parameter.trim()
            : "";
        const message =
          typeof detailRecord.message === "string"
            ? detailRecord.message.trim()
            : "";

        if (parameter && message) appendDetail(`${parameter}: ${message}`);
        else if (message) appendDetail(message);
      }
    }
  }

  if (details.length > 0) {
    return details.join(" / ");
  }

  let normalizedFallback = normalizeErrorText(fallbackText);
  if (normalizedFallback.startsWith("{") || normalizedFallback.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalizedFallback) as unknown;
      collectTextDetails(parsed);
      if (details.length > 0) {
        return details.join(" / ");
      }
      normalizedFallback = "";
    } catch {
      // Ignore parse failure and keep using plain fallback text.
    }
  }

  if (normalizedFallback) {
    return normalizedFallback.slice(0, 500);
  }

  if (status === 401) {
    return "認証エラー (HTTP 401) : Authorization ヘッダーを `token YOUR_API_TOKEN` 形式で設定してください。";
  }

  if (status === 404) {
    return "エンドポイントが見つかりません (HTTP 404)。URL またはパスをご確認ください。";
  }

  if (status === 503) {
    return "相手先サービスが一時的に利用できません (HTTP 503)。しばらくして再試行してください。";
  }

  return `送信エラー (HTTP ${status})`;
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

function getObjectValue<T = unknown>(data: unknown, key: string): T | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return (record[key] as T) ?? null;
}

function getResolvedDirectSendUrl() {
  const endpointUrl = readEnv("NEXILINK_FAX_ENDPOINT", "NEXLINK_FAX_ENDPOINT");
  if (endpointUrl) return endpointUrl;

  const baseUrl =
    readEnv("NEXLINK_API_BASE_URL", "NEXILINK_API_BASE_URL") || DEFAULT_BASE_URL;

  const apiPath =
    readEnv("NEXLINK_API_PATH", "NEXILINK_API_PATH") || DEFAULT_API_PATH;

  return new URL(apiPath, baseUrl).toString();
}

async function sendDirectFax(params: {
  apiUrl: string;
  apiToken: string;
  authScheme: string;
  faxNumber: string;
  allowInternationalFax: boolean;
  quality: number;
}) {
  const requestBody = JSON.stringify({
    fax_number: params.faxNumber,
    allow_international_fax: params.allowInternationalFax,
    quality: params.quality,
  });
   const schemesToTry = Array.from(
    new Set([params.authScheme, "token", "Bearer", "Token"]),
  ).filter(Boolean);

  let lastResponse: Awaited<ReturnType<typeof fetchJsonWithRetry>> | null = null;
  for (const scheme of schemesToTry) {
    const response = await fetchJsonWithRetry(params.apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...buildAuthHeader(params.apiToken, scheme),
      },
      body: requestBody,
    });

    if (response.ok || response.status !== 401) {
      return response;
    }

    lastResponse = response;
  }

  return (
    lastResponse ?? {
      ok: false,
      status: 500,
      data: null,
      rawText: "",
    }
  );
}

export async function POST(request: Request) {
  const apiUrl = getResolvedDirectSendUrl();
  const authScheme = readEnv("NEXLINK_AUTH_SCHEME", "NEXILINK_AUTH_SCHEME") || "token";
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

  try {
    const results: SendResult[] = [];

    for (const target of validFaxTargets) {
      const response = await sendDirectFax({
        apiUrl,
        apiToken,
        authScheme,
        faxNumber: target.normalized,
        allowInternationalFax,
        quality,
      });

      if (!response.ok) {
        results.push({
          to: target.original,
          success: false,
          error: extractErrorDetail(
            response.status,
            response.data,
            response.rawText,
          ),
          raw: response.data,
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
