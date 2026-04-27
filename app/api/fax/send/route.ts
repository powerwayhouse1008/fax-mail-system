import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "https://sandbox-hea.nexlink2.jp";
const DEFAULT_API_PATH = "/api/v1/facsimiles/direct_send";
const DIRECT_SEND_API_PATH_CANDIDATES = [
  "/api/v1/facsimiles/direct_send",
  "/api/v1/facsimile/direct_send",
  "/api/v1/direct_send",
] as const;
const DEFAULT_FAX_QUALITY = 1;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 5;
const faxPattern = /^[0-9+\-()\s]{6,30}$/;
const AUTH_FALLBACK_ENV_KEYS = [
  "NEXLINK_ENABLE_AUTH_FALLBACK",
  "NEXILINK_ENABLE_AUTH_FALLBACK",
] as const;

type RequestPayload = {
  faxNumbers?: unknown;
  allowInternationalFax?: unknown;
  faxQuality?: unknown;
  fax_quality?: unknown;
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

function isRateLimitExceededError(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  const code =
    typeof record.application_error_code === "string"
      ? record.application_error_code.trim()
      : "";
  return code === "0000002";
}

function extractErrorDetail(status: number, data: unknown, fallbackText: string) {
  const defaultStatusMessage = (() => {
    if (status === 429) {
      return "送信上限に達しました (HTTP 429) / 時間をおいて再試行してください";
    }

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
    const applicationErrorCode =
      typeof record.application_error_code === "string"
        ? record.application_error_code.trim()
        : "";
    const baseMessage = typeof record.base === "string" ? record.base.trim() : "";
    const retryAfterSeconds =
      typeof record.retry_after === "number"
        ? record.retry_after
        : typeof record.retry_after === "string"
          ? Number(record.retry_after)
          : typeof record.retryAfter === "number"
            ? record.retryAfter
            : typeof record.retryAfter === "string"
              ? Number(record.retryAfter)
              : null;
    const retryAfterText =
      retryAfterSeconds !== null &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
        ? ` / retry_after: ${Math.ceil(retryAfterSeconds)}秒`
        : "";
    if (status === 429 && applicationErrorCode === "0000002") {
      const additionalDetail = baseMessage ? ` / base: ${baseMessage}` : "";
      return `送信上限に達しました (HTTP 429) / application_error_code: 0000002${retryAfterText}${additionalDetail} / 一定時間後に再試行してください`;
    }

    for (const key of ["message", "error", "detail", "title"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        details.push(`${key}: ${value.trim()}`);
      }
    }

    if (applicationErrorCode) {
      details.unshift(`application_error_code: ${applicationErrorCode}`);
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
      const joinedDetails = details.join(" / ");
      const isGenericBadRequest =
        status === 400 &&
        /(^|[\s:/-])bad request($|[\s:/-])/i.test(joinedDetails);
      if (isGenericBadRequest) {
        return `${joinedDetails} / リクエスト内容を確認してください (recipient list CSV・fax_quality・mapping_columns・NEXLINK_API_PATHS)`;
      }
      return joinedDetails;
    }

    const jsonText = JSON.stringify(record);
    if (jsonText && jsonText !== "{}" && hasMeaningfulValue(record)) {
      return `${defaultStatusMessage} / RAW_JSON: ${jsonText}`;
    }

    return defaultStatusMessage;
  }

  const normalizedFallback = normalizeErrorText(fallbackText);
  if (normalizedFallback) {
    const isGenericBadRequest =
      status === 400 &&
      /(^|[\s:/-])bad request($|[\s:/-])/i.test(normalizedFallback);
    if (isGenericBadRequest) {
      return `${normalizedFallback} / リクエスト内容を確認してください (recipient list CSV・fax_quality・mapping_columns・NEXLINK_API_PATHS)`;
    }
    return normalizedFallback;
  }

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
function isBadRequestRetryableAsMultipart(data: unknown, rawText: string) {
  const combined = `${JSON.stringify(data ?? "")} ${rawText}`.toLowerCase();
  return (
    /bad request/.test(combined) &&
    /(fax_number|fax_quality|quality|mapping_columns|request body|request parameter|recipient.*file|file)/.test(
      combined,
    )
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
  retryAfterSeconds: number | null;
}> {
  let response: Response | null = null;
  let rawText = "";
  let data: unknown = null;
  let retryAfterSeconds: number | null = null;
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
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    retryAfterSeconds = retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : null;

    if (response.status === 429 && isRateLimitExceededError(data)) {
      return {
        ok: response.ok,
        status: response.status,
        data,
        rawText,
        retryAfterSeconds,
      };
    }

    if (
      RETRYABLE_STATUS_CODES.has(response.status) &&
      attempt < MAX_RETRY_ATTEMPTS - 1
    ) {
      await sleep(computeRetryDelayMs(attempt, retryAfterHeader));
      continue;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      rawText,
      retryAfterSeconds,
    };
  }

  if (lastFetchError) throw lastFetchError;

  return {
    ok: false,
    status: 500,
    data: null,
    rawText: "",
    retryAfterSeconds: null,
  };
}

function getConfiguredApiPaths() {
  const configuredList = readEnv("NEXLINK_API_PATHS", "NEXILINK_API_PATHS");
  const splitPaths = configuredList
    ? configuredList
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const keyedPaths = [
    readEnv("NEXLINK_API_PATH_DIRECT_SEND", "NEXILINK_API_PATH_DIRECT_SEND"),
    readEnv(
      "NEXLINK_API_PATH_FACSIMILE_DIRECT_SEND",
      "NEXILINK_API_PATH_FACSIMILE_DIRECT_SEND",
    ),
    readEnv(
      "NEXLINK_API_PATH_FACSIMILES_DIRECT_SEND",
      "NEXILINK_API_PATH_FACSIMILES_DIRECT_SEND",
    ),
    readEnv("NEXLINK_API_PATH", "NEXILINK_API_PATH"),
  ].filter(Boolean);

  const merged = [...splitPaths, ...keyedPaths];
  return merged.length > 0 ? merged : [DEFAULT_API_PATH];
}
function getResolvedDirectSendUrl() {
  const endpointUrl = readEnv("NEXLINK_FAX_ENDPOINT", "NEXILINK_FAX_ENDPOINT");
  if (endpointUrl) return endpointUrl;

  const baseUrl =
    readEnv("NEXLINK_API_BASE_URL", "NEXILINK_API_BASE_URL") || DEFAULT_BASE_URL;
  const apiPath = getConfiguredApiPaths()[0];

  return new URL(apiPath, baseUrl).toString();
}
function getDirectSendUrlCandidates(primaryUrl: string) {
  const candidates: string[] = [primaryUrl];
  let parsedPrimary: URL | null = null;
  try {
    parsedPrimary = new URL(primaryUrl);
  } catch {
    return candidates;
  }

  const configuredPath = parsedPrimary.pathname.replace(/\/+$/, "");
  const configuredPaths = getConfiguredApiPaths();
  for (const apiPath of [...configuredPaths, ...DIRECT_SEND_API_PATH_CANDIDATES]) {
    const normalizedPath = apiPath.replace(/\/+$/, "");
    if (normalizedPath === configuredPath) continue;
    const candidate = new URL(normalizedPath, parsedPrimary.origin).toString();
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
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
  faxQuality: 0 | 1;
  mappingColumns: Record<string, unknown>;
}) {
  const normalizedMappingColumnsJson = JSON.stringify(params.mappingColumns);
  const recipientListCsv = `FAX\n${params.faxNumber}\n`;
  const recipientListFile = new Blob([recipientListCsv], {
    type: "text/csv",
  });
  const baseRequestBody = {
    allow_international_fax: params.allowInternationalFax,
    fax_quality: params.faxQuality,
  };

  console.log("NEXLINK direct_send url =", params.apiUrl);
  console.log("NEXLINK direct_send body =", {
    ...baseRequestBody,
    mapping_columns: normalizedMappingColumnsJson,
    recipient_list_file: "recipient-list.csv",
  });
  const maskedToken = `${params.apiToken.slice(0, 4)}***${params.apiToken.slice(-4)}`;
  console.log("NEXLINK token preview =", maskedToken);
  const aggressiveAuthFallback = shouldUseAggressiveAuthFallback();
  const authHeaderCandidates = aggressiveAuthFallback
    ? buildAuthHeaderCandidates(params.apiToken)
    : [buildAuthHeader(params.apiToken)];
  console.log(
    "NEXLINK auth fallback mode =",
    aggressiveAuthFallback ? "aggressive" : "strict",
  );

  let lastResponse: Awaited<ReturnType<typeof fetchJsonWithRetry>> | null = null;
  const buildMultipartInit = (authHeader: Record<string, string>): RequestInit => {
    const formData = new FormData();
    formData.append("file", recipientListFile, "recipient-list.csv");
    formData.append(
      "allow_international_fax",
      params.allowInternationalFax ? "1" : "0",
    );
    formData.append("fax_quality", String(params.faxQuality));
    formData.append("token", params.apiToken);
    formData.append("mapping_columns", normalizedMappingColumnsJson);
    for (const [key, value] of Object.entries(params.mappingColumns)) {
      if (typeof key !== "string" || key.trim() === "") continue;
      const normalizedValue =
        value == null
          ? ""
          : typeof value === "string"
            ? value
            : typeof value === "number" || typeof value === "boolean"
              ? String(value)
              : JSON.stringify(value);
      formData.append(`mapping_columns[${key}]`, normalizedValue);
    }

    return {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...authHeader,
      },
      body: formData,
    };
  };
  for (let index = 0; index < authHeaderCandidates.length; index += 1) {
    const authHeader = authHeaderCandidates[index];
    const authHeaderKeys = Object.keys(authHeader).join(",");
    const response = await fetchJsonWithRetry(
      params.apiUrl,
      buildMultipartInit(authHeader),
    );
    lastResponse = response;
    if (response.status === 429) {
      return response;
    }
    if (!isAuthRetryableError(response.status, response.data, response.rawText)) {
      return response;
    }

    console.log(
      `NEXLINK auth/content retry: HTTP ${response.status} with candidate ${index + 1}/${authHeaderCandidates.length}, payload=multipart, headers=${authHeaderKeys}`,
    );
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
  const raw = payload.mappingColumns ?? payload.mapping_columns;

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

function ensureRecipientMappingColumns(mappingColumns: Record<string, unknown>) {
  const normalized = { ...mappingColumns };
  const stringValues = Object.values(normalized)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const hasFaxOrEmailColumn =
    stringValues.includes("FAX") || stringValues.includes("EMAIL");

  if (!hasFaxOrEmailColumn) {
    normalized.recipient = "FAX";
  }

  return normalized;
}

function resolveFaxQuality(payload: RequestPayload): 0 | 1 {
  const rawFaxQuality = payload.fax_quality ?? payload.faxQuality;
  if (rawFaxQuality === 0 || rawFaxQuality === 1) return rawFaxQuality;
  if (rawFaxQuality === "0") return 0;
  if (rawFaxQuality === "1") return 1;
  return DEFAULT_FAX_QUALITY;
}

export async function POST(request: Request) {
  const apiUrl = getResolvedDirectSendUrl();
  const apiUrlCandidates = getDirectSendUrlCandidates(apiUrl);
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
    return NextResponse.json({ error: "有効なFAX番号がありません。" }, { status: 400 });
  }

  const allowInternationalFax =
    typeof payload.allowInternationalFax === "boolean"
      ? payload.allowInternationalFax
      : false;

  const faxQuality = resolveFaxQuality(payload);
  const mappingColumns = ensureRecipientMappingColumns(resolveMappingColumns(payload));
  const mappingColumnsJson = JSON.stringify(mappingColumns);
  try {
    const results: SendResult[] = [];

    for (const target of validFaxTargets) {
      let selectedEndpoint = apiUrlCandidates[0];
      let response: Awaited<ReturnType<typeof sendDirectFax>> | null = null;
      for (const candidateApiUrl of apiUrlCandidates) {
        const candidateResponse = await sendDirectFax({
          apiUrl: candidateApiUrl,
          apiToken,
          faxNumber: target.normalized,
          allowInternationalFax,
          faxQuality,
          mappingColumns,
        });
        response = candidateResponse;
        selectedEndpoint = candidateApiUrl;
        const shouldTryNextEndpoint =
          candidateResponse.status === 400 &&
          apiUrlCandidates.length > 1 &&
          isBadRequestRetryableAsMultipart(
            candidateResponse.data,
            candidateResponse.rawText,
          );
        if (!shouldTryNextEndpoint) break;
        console.log(
          `NEXLINK endpoint fallback: HTTP 400 on ${candidateApiUrl}, trying next endpoint candidate`,
        );
      }
      if (!response) {
        throw new Error("NEXLINK API 応答が取得できませんでした。");
      }

      console.log("NEXLINK direct_send status =", response.status);
      console.log("NEXLINK direct_send data =", response.data);
      console.log("NEXLINK direct_send rawText =", response.rawText);

      if (!response.ok) {
        const detail = extractErrorDetail(
          response.status,
          response.data,
          response.rawText,
        );
        const detailWithRetryAfter =
          response.status === 429 &&
          response.retryAfterSeconds &&
          !/retry_after/i.test(detail)
            ? `${detail} / retry_after: ${response.retryAfterSeconds}秒`
            : detail;
        results.push({
          to: target.original,
          success: false,
          error: `HTTP ${response.status} / ${detailWithRetryAfter}`,
          raw: {
            status: response.status,
            data: response.data,
            rawText: response.rawText,
            endpoint: selectedEndpoint,
            endpointCandidatesTried: apiUrlCandidates,
            requestBody: {
              recipient_list_csv: `FAX\n${target.normalized}\n`,
              allow_international_fax: allowInternationalFax,
              fax_quality: faxQuality,
              mapping_columns: mappingColumnsJson,
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
