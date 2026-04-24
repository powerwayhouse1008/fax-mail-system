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
  mappingColumns?: unknown;
  mapping_columns?: unknown;
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

type AuthHeader = Record<string, string>;

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
  
 const authorizationCandidates: AuthHeader[] = [];

  for (const value of [
    `token ${trimmed}`,
    `Token ${trimmed}`,
    `Bearer ${trimmed}`,
    `token=${trimmed}`,
    `Token token=${trimmed}`,
    `Token token="${trimmed}"`,
    `token token=${trimmed}`,
    trimmed,
  ]) {
   const header = createAuthorizationHeader(value);
    authorizationCandidates.push(header);
    addCandidate(header);
  }

  const tokenHeaderCandidates: AuthHeader[] = [
    { "X-Auth-Token": trimmed },
    { "X-API-Token": trimmed },
    { "X-API-Key": trimmed },
    { "Api-Token": trimmed },
    { "X-Access-Token": trimmed },
  ];

  for (const tokenHeader of tokenHeaderCandidates) {
    addCandidate(tokenHeader);
  }

  for (const authorizationHeader of authorizationCandidates) {
    for (const tokenHeader of tokenHeaderCandidates) {
      addCandidate({
        ...authorizationHeader,
        ...tokenHeader,
      });
    }
  }

  return Array.from(candidates.values());
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

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulValue(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) =>
      hasMeaningfulValue(item),
    );
  }

  return value !== null && value !== undefined;
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
     if (jsonText && jsonText !== "{}" && hasMeaningfulValue(record)) {
      return `${defaultStatusMessage} / RAW_JSON: ${jsonText}`;
    }

    return defaultStatusMessage;
  }

  const normalizedFallback = normalizeErrorText(fallbackText);
  if (normalizedFallback) return normalizedFallback;

  return defaultStatusMessage;
}
function isAuthRetryableError(status: number, data: unknown, rawText: string) {
  if (status === 401 || status === 403) return true;

  if (status !== 400) return false;

  const combined = `${JSON.stringify(data ?? "")} ${rawText}`.toLowerCase();
  return /0010001|token\s*required|api[_\s-]*token\s*required|base\s*:\s*token\s*required/.test(
    combined,
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
  mappingColumns?: Record<string, unknown>;
}) {
  const normalizedMappingColumns = JSON.parse(
    JSON.stringify(params.mappingColumns ?? {}),
  ) as Record<string, unknown>;
  const baseRequestBody = {
    fax_number: params.faxNumber,
    allow_international_fax: params.allowInternationalFax,
    quality: params.quality,
    ...(params.uploadedCardUrl
      ? { uploaded_card_url: params.uploadedCardUrl }
      : {}),
  };
  
  console.log("NEXLINK direct_send url =", params.apiUrl);
  console.log("NEXLINK direct_send body =", {
    ...baseRequestBody,
    mapping_columns: normalizedMappingColumns,
  });
  const maskedToken = `${params.apiToken.slice(0, 4)}***${params.apiToken.slice(-4)}`;
  console.log("NEXLINK token preview =", maskedToken);

  const authHeaderCandidates = buildAuthHeaderCandidates(params.apiToken);
  let lastResponse: Awaited<ReturnType<typeof fetchJsonWithRetry>> | null = null;
  const requestVariants: Array<{
    name: "json_object" | "json_string" | "multipart_recipient_file";
    mappingMode: "object" | "string" | "none";
    buildInit: (authHeader: AuthHeader) => RequestInit;
  }> = [
    {
      name: "json_object",
      mappingMode: "object",
      buildInit: (authHeader) => ({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          ...baseRequestBody,
          mapping_columns: normalizedMappingColumns,
        }),
      }),
      },
    {
      name: "json_string",
      mappingMode: "string",
      buildInit: (authHeader) => ({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          ...baseRequestBody,
          mapping_columns: JSON.stringify(normalizedMappingColumns),
        }),
      }),
    },
     {
      name: "multipart_recipient_file",
      mappingMode: "none",
      buildInit: (authHeader) => {
        const formData = new FormData();
        const recipientListCsv = `fax_number\n${params.faxNumber}\n`;
        const recipientListFile = new Blob([recipientListCsv], {
          type: "text/csv",
        });

        formData.append("file", recipientListFile, "recipient-list.csv");
        formData.append("fax_number", params.faxNumber);
        formData.append(
          "allow_international_fax",
          params.allowInternationalFax ? "1" : "0",
        );
        formData.append("quality", String(params.quality));
        formData.append(
          "mapping_columns",
          JSON.stringify(normalizedMappingColumns),
        );
        if (params.uploadedCardUrl) {
          formData.append("uploaded_card_url", params.uploadedCardUrl);
        }

        return {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...authHeader,
          },
          body: formData,
        };
      },
    },
  ];
  for (let index = 0; index < authHeaderCandidates.length; index += 1) {
    const authHeader = authHeaderCandidates[index];
    const authHeaderKeys = Object.keys(authHeader).join(",");
    for (const variant of requestVariants) {
      const response = await fetchJsonWithRetry(
        params.apiUrl,
        variant.buildInit(authHeader),
      );

      lastResponse = response;
      const mappingColumnErrorText = `${JSON.stringify(response.data ?? "")} ${response.rawText}`;
      const isMappingColumnsValidationError =
        response.status === 422 &&
        /0130001|mapping_columns/i.test(mappingColumnErrorText);
      const isRecipientListFileValidationError =
        response.status === 422 &&
        /0020001|宛先リストファイル|recipient.*file|(^|[^a-z])file([^a-z]|$)/i.test(
          mappingColumnErrorText,
        );
       if (isMappingColumnsValidationError) {
        console.log(
          `NEXLINK mapping_columns retry: HTTP 422 with candidate ${index + 1}/${authHeaderCandidates.length}, payload=${variant.name}`,
        );
        continue;
      }
      if (
        isRecipientListFileValidationError &&
        variant.name !== "multipart_recipient_file"
      ) {
        console.log(
          `NEXLINK recipient-list retry: HTTP 422 with candidate ${index + 1}/${authHeaderCandidates.length}, trying multipart file payload`,
        );
        continue;
      }
       if (!isAuthRetryableError(response.status, response.data, response.rawText)) {
        return response;
      }

      console.log(
        `NEXLINK auth/content retry: HTTP ${response.status} with candidate ${index + 1}/${authHeaderCandidates.length}, payload=${variant.name}, headers=${authHeaderKeys}`,
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
function resolveMappingColumns(payload: RequestPayload) {
  const raw =
    payload.mappingColumns ??
    payload.mapping_columns;

  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return {};
}

function ensureRecipientMappingColumns(
  mappingColumns: Record<string, unknown>,
) {
   return mappingColumns;
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
  const mappingColumns = ensureRecipientMappingColumns(
    resolveMappingColumns(payload),
  );
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
        mappingColumns,
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
              mapping_columns: mappingColumns,
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
