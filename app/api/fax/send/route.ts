import { NextResponse } from "next/server";

const DIRECT_SEND_PATH = "/api/v1/facsimiles/direct_send";
const MAX_SUBJECT_LENGTH = 200;
const faxPattern = /^[0-9+\-()\s]{6,30}$/;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;

type AuthScheme = "token" | "bearer" | "x-api-key" | "x-auth-token" | "raw";

type AttachmentPayload = {
  filename?: unknown;
  content?: unknown; // base64
  url?: unknown;
  type?: unknown;
};

type RequestPayload = {
  faxNumbers?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
  attachments?: unknown;
};

type SendResult =
  | { to: string; success: true; id: unknown; raw?: unknown }
  | { to: string; success: false; error: string; raw?: unknown };

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

function buildAuthHeaders(token: string, scheme: AuthScheme) {
  const trimmed = normalizeAuthToken(token);

  switch (scheme) {
    case "token":
       return { Authorization: `token ${trimmed}` };
    case "bearer":
      return { Authorization: `Bearer ${trimmed}` };
    case "x-api-key":
      return { "X-API-KEY": trimmed };
    case "x-auth-token":
      return { "X-Auth-Token": trimmed };
    case "raw":
       return { Authorization: token.trim() };
    default:
     return { Authorization: `token ${trimmed}` };
  }
}

function buildBasicAuthValue(username: string, password: string) {
  if (!username || !password) return "";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function buildBasicAuthCandidatesFromToken(token: string) {
  const trimmed = normalizeAuthToken(token);
  if (!trimmed) return [];

  return [
    `Basic ${Buffer.from(`${trimmed}:`).toString("base64")}`,
    `Basic ${Buffer.from(`:${trimmed}`).toString("base64")}`,
    `Basic ${Buffer.from(`${trimmed}:${trimmed}`).toString("base64")}`,
  ];
}

function buildAuthHeaderCandidates(
  token: string,
  scheme: AuthScheme,
  basicAuthValue = "",
) {
   const trimmed = normalizeAuthToken(token);
  const dedupe = new Set<string>();
  const candidates: Array<Record<string, string>> = [];

  const pushCandidate = (headers: Record<string, string>) => {
    const key = JSON.stringify(
      Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)),
    );
    if (dedupe.has(key)) return;
    dedupe.add(key);
    candidates.push(headers);
  };

  if (scheme !== "token") {
     if (trimmed) {
      pushCandidate(buildAuthHeaders(token, scheme));
    }
    if (basicAuthValue) {
      pushCandidate({ Authorization: basicAuthValue });
    }
    return candidates;
  }

  // NexiLink environments are inconsistent about auth header requirements.
  // Try the common variants before failing on HTTP 401.
 if (trimmed) {
    pushCandidate({ Authorization: `token ${trimmed}` });
    pushCandidate({ Authorization: `Token ${trimmed}` });
    pushCandidate({ Authorization: `Bearer ${trimmed}` });
    pushCandidate({ Authorization: `token token=${trimmed}` });
    pushCandidate({ Authorization: `token token=\"${trimmed}\"` });
    pushCandidate({ Authorization: `Token token=${trimmed}` });
    pushCandidate({ Authorization: `Token token=\"${trimmed}\"` });
    pushCandidate({ Authorization: `Api-Token ${trimmed}` });
    pushCandidate({ Authorization: `X-API-KEY ${trimmed}` });
    pushCandidate({ Authorization: `token=${trimmed}` });
    pushCandidate({ Authorization: trimmed });
    pushCandidate({ "X-API-KEY": trimmed });
    pushCandidate({ "X-Api-Key": trimmed });
    pushCandidate({ "X-Auth-Token": trimmed });
    pushCandidate({ "X-Api-Token": trimmed });
    pushCandidate({ "x-api-token": trimmed });
    pushCandidate({ token: trimmed });
    pushCandidate({ apikey: trimmed });
    pushCandidate({ api_key: trimmed });
    pushCandidate({ "Api-Token": trimmed });
    pushCandidate({ "api-token": trimmed });
    pushCandidate({ "access-token": trimmed });
  }

  if (basicAuthValue) {
    pushCandidate({ Authorization: basicAuthValue });
  }
  for (const candidate of buildBasicAuthCandidatesFromToken(token)) {
    pushCandidate({ Authorization: candidate });
  }


  return candidates;
}
function getAuthAttemptLabel(headers: Record<string, string>) {
  const [name, value] = Object.entries(headers)[0] ?? ["", ""];
  if (!name) return "なし";

  if (name.toLowerCase() !== "authorization") {
    return name;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("token token=")) return "Authorization(token token=...)";
  if (normalized.startsWith("token ")) return "Authorization(token ...)";
  if (normalized.startsWith("bearer ")) return "Authorization(Bearer ...)";
  if (normalized.startsWith("basic ")) return "Authorization(Basic ...)";
  if (normalized.startsWith("token=")) return "Authorization(token=...)";
  return "Authorization(raw)";
}
function normalizeAuthScheme(value: string): AuthScheme {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  if (
    normalized === "token" ||
    normalized === "bearer" ||
    normalized === "x-api-key" ||
    normalized === "x-auth-token" ||
    normalized === "raw"
  ) {
    return normalized;
  }

  return "token";
}

function normalizeAuthToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return "";


  const normalized = trimmed
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/^authorization\s*:\s*/i, "")
    .replace(/^token\s+token=/i, "")
    .replace(/^token\s+/i, "")
    .replace(/^bearer\s+/i, "")
    .replace(/\s+/g, "")
    .trim();

  return normalized || trimmed;
}

function getResolvedApiUrl() {
  const endpointUrl = readEnv("NEXILINK_FAX_ENDPOINT", "NEXLINK_FAX_ENDPOINT");
  const baseUrl = readEnv("NEXLINK_API_BASE_URL", "NEXILINK_API_BASE_URL");
  const apiPath = readEnv("NEXLINK_API_PATH", "NEXILINK_API_PATH");

  // 1) Nếu có full endpoint thì dùng luôn
  if (endpointUrl) {
    return endpointUrl;
  }

  // 2) Nếu không có full endpoint thì build từ base + path
  if (!baseUrl) return "";

  const path =
    !apiPath || apiPath === "/api/v1/facsimiles"
      ? DIRECT_SEND_PATH
      : apiPath;

  return new URL(path, baseUrl).toString();
}

function isContactListEndpoint(url: string) {
  return /contact|list/i.test(url) && !/direct_send/i.test(url);
}
function normalizeErrorText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    const withoutTags = trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return withoutTags;
  }

  return trimmed;
}
function isLikelyNotFoundHtml(body: string) {
  const normalized = normalizeErrorText(body).toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes("not found") ||
    normalized.includes("404") ||
    normalized.includes("お探しのページが見つかりませんでした") ||
    normalized.includes("ページが見つかりませんでした")
  );
}

function getSuccessfulResponseId(data: unknown) {
  if (!data || typeof data !== "object") return null;
  if (!("id" in data)) return null;
  return (data as Record<string, unknown>).id;
}

function extractSuccessAnomaly(data: unknown, rawBody: string) {
  if (typeof data === "string") {
    if (isLikelyNotFoundHtml(data)) {
      return "NexiLink API からページ未検出の応答が返されました。API URL またはエンドポイント設定をご確認ください。";
    }
    return "";
  }

  if (rawBody && isLikelyNotFoundHtml(rawBody)) {
    return "NexiLink API からページ未検出の応答が返されました。API URL またはエンドポイント設定をご確認ください。";
  }

  const responseId = getSuccessfulResponseId(data);
  if (responseId !== null && responseId !== undefined && `${responseId}`.trim()) {
    return "";
  }

  if (!data) {
    return "NexiLink API の成功レスポンスが空でした。API URL またはエンドポイント設定をご確認ください。";
  }

  return "";
}
function formatFetchErrorDetail(error: unknown) {
  if (!(error instanceof Error)) {
    return "相手先サービスに接続できませんでした。";
  }

  const messages = new Set<string>();
  const pushMessage = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (normalized) {
      messages.add(normalized);
    }
  };

  pushMessage(error.message);

  let current: unknown = (error as { cause?: unknown }).cause;
  let depth = 0;
  while (current && depth < 4) {
    if (current instanceof Error) {
      pushMessage(current.message);
      current = (current as { cause?: unknown }).cause;
      depth += 1;
      continue;
    }

    if (typeof current === "object") {
      const code =
        "code" in current && typeof current.code === "string"
          ? current.code
          : "";
      const message =
        "message" in current && typeof current.message === "string"
          ? current.message
          : "";
      if (code && message) {
        pushMessage(`${code}: ${message}`);
      } else {
        pushMessage(code || message);
      }
    } else {
      pushMessage(current);
    }

    break;
  }

  const merged = Array.from(messages).join(" / ");
  return merged || "相手先サービスに接続できませんでした。";
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
  if (retryAfterMs > 0) {
    return Math.min(retryAfterMs, 10_000);
  }

  const baseDelay = 500;
  const jitter = Math.floor(Math.random() * 250);
  const exponentialDelay = baseDelay * 2 ** attempt;
  return Math.min(exponentialDelay + jitter, 5_000);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractErrorDetail(status: number, data: unknown, fallbackText: string) {
  const details: string[] = [];
  let applicationErrorCode = "";

  if (typeof data === "string" && data.trim()) {
    const normalized = normalizeErrorText(data);
    if (normalized) {
    if (isLikelyNotFoundHtml(normalized)) {
        return "NexiLink API のページが見つかりませんでした。API URL または direct_send エンドポイント設定をご確認ください。";
      }
      details.push(normalized);
    }
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (
      typeof record.application_error_code === "string" &&
      record.application_error_code.trim()
    ) {
      applicationErrorCode = record.application_error_code.trim();
    }

    for (const key of ["message", "error", "detail", "title"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        details.push(value.trim());
      }
    }

    if (Array.isArray(record.errors)) {
      for (const item of record.errors) {
        if (typeof item === "string" && item.trim()) {
          details.push(item.trim());
          continue;
        }
        if (item && typeof item === "object") {
          const errorRecord = item as Record<string, unknown>;
          if (typeof errorRecord.message === "string" && errorRecord.message.trim()) {
            details.push(errorRecord.message.trim());
          }
          if (typeof errorRecord.detail === "string" && errorRecord.detail.trim()) {
            details.push(errorRecord.detail.trim());
          }
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

        if (parameter && message) details.push(`${parameter}: ${message}`);
        else if (message) details.push(message);
      }
    }

    if (
      applicationErrorCode === "0080001" &&
      Array.isArray(record.details) &&
      record.details.some((item) => {
        if (!item || typeof item !== "object") return false;
        const parameter = (item as Record<string, unknown>).parameter;
        return parameter === "contact_list" || parameter === "contact_list_id";
      })
    ) {
      details.unshift(
        "NexiLink API の送信先設定エラーです。contact_list_id が必要なエンドポイントが指定されています。direct_send エンドポイントを使用してください。",
      );
    }
  }

  if (details.length > 0) {
    return details.join(" / ");
  }

  const text = fallbackText.trim();
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const candidates = ["message", "error", "detail", "title"]
          .map((key) => record[key])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);

        if (candidates.length > 0) {
          return candidates.join(" / ").slice(0, 500);
        }
      }
    } catch {
      const normalized = normalizeErrorText(text);
      if (normalized) {
        return normalized.slice(0, 500);
      }
    }
  }
  if (status === 503) {
    return "相手先サービスが一時的に利用できません (HTTP 503)。しばらくして再試行してください。";
  }

  if (status === 401) {
    return "認証エラー (HTTP 401) : APIトークン、認証ヘッダー形式、またはAPI URLをご確認ください。";
  }

  return `送信エラー (HTTP ${status})`;
}

async function resolveAttachments(payload: AttachmentPayload[]) {
  return Promise.all(
    payload.map(async (item) => {
      const filename =
        typeof item.filename === "string" ? item.filename.trim() : "";
      const content =
        typeof item.content === "string" ? item.content.trim() : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      const type =
        typeof item.type === "string" && item.type.trim()
          ? item.type.trim()
          : "application/octet-stream";

      if (!filename) {
        throw new Error("添付ファイル名が不正です。");
      }

      if (content) {
        return { filename, content, type };
      }

      if (url) {
        const fileResponse = await fetch(url);
        if (!fileResponse.ok) {
          throw new Error(`添付ファイルの取得に失敗しました: ${filename}`);
        }
        const arrayBuffer = await fileResponse.arrayBuffer();
        return {
          filename,
          content: Buffer.from(arrayBuffer).toString("base64"),
          type,
        };
      }

      throw new Error(`添付ファイルの内容がありません: ${filename}`);
    }),
  );
}

export async function POST(request: Request) {
  const apiUrl = getResolvedApiUrl();
  const apiToken = readEnv(
    "NEXLINK_API_TOKEN",
    "NEXILINK_API_TOKEN",
    "NEXILINK_API_KEY",
    "NEXLINK_API_KEY",
  );
  const senderId = readEnv("NEXILINK_SENDER_ID", "NEXLINK_SENDER_ID");
  const apiLoginId = readEnv(
    "NEXLINK_API_LOGIN_ID",
    "NEXILINK_API_LOGIN_ID",
    "NEXLINK_LOGIN_ID",
    "NEXILINK_LOGIN_ID",
    "NEXLINK_API_USER",
    "NEXILINK_API_USER",
  );
  const apiPassword = readEnv(
    "NEXLINK_API_PASSWORD",
    "NEXILINK_API_PASSWORD",
    "NEXLINK_PASSWORD",
    "NEXILINK_PASSWORD",
    "NEXLINK_API_PASS",
    "NEXILINK_API_PASS",
  );
  const authScheme = normalizeAuthScheme(
    readEnv("NEXLINK_AUTH_SCHEME", "NEXILINK_AUTH_SCHEME") || "token",
  );

  if (!apiUrl) {
    return NextResponse.json(
      {
        error:
          "NEXILINK_FAX_ENDPOINT または NEXLINK_API_BASE_URL が未設定です。",
      },
      { status: 500 },
    );
  }

 const basicAuthValue = buildBasicAuthValue(apiLoginId, apiPassword);

  if (!apiToken && !basicAuthValue) {
    return NextResponse.json(
      {
        error:
         "NEXLINK_API_TOKEN (または NEXILINK_API_KEY) か NEXLINK_API_LOGIN_ID / NEXLINK_API_PASSWORD のいずれかを設定してください。",
      },
      { status: 500 },
    );
  }

  if (isContactListEndpoint(apiUrl)) {
    return NextResponse.json(
      {
        error:
          "現在のAPIエンドポイントは contact list 用です。direct_send 用エンドポイントに変更してください。",
        apiUrl,
      },
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

  const subject =
    typeof payload.subject === "string" && payload.subject.trim()
      ? payload.subject.trim().slice(0, MAX_SUBJECT_LENGTH)
      : "FAX Mail System からの送信";

  const html =
    typeof payload.html === "string" && payload.html.trim()
      ? payload.html
      : "<p>FAX Mail System からの送信です。</p>";

  const text =
    typeof payload.text === "string" && payload.text.trim()
      ? payload.text
      : "FAX Mail System からの送信です。";

  const attachmentsPayload = Array.isArray(payload.attachments)
    ? payload.attachments.filter(
        (item): item is AttachmentPayload =>
          typeof item === "object" && item !== null,
      )
    : [];

  try {
    const attachments = await resolveAttachments(attachmentsPayload);
    const authHeaderCandidates = buildAuthHeaderCandidates(
      apiToken,
      authScheme,
      basicAuthValue,
    );

    const results: SendResult[] = await Promise.all(
      validFaxTargets.map(async (target) => {
        const requestBody = {
          to: target.normalized,
          senderId: senderId || undefined,
          subject,
          html,
          text,
          attachments: attachments.length > 0 ? attachments : undefined,
        };

        let response: Response | null = null;
        let rawBody = "";
        const attemptedAuthPatterns: string[] = [];
        let data: unknown = null;

       for (let i = 0; i < authHeaderCandidates.length; i += 1) {
          attemptedAuthPatterns.push(getAuthAttemptLabel(authHeaderCandidates[i]));
          let lastFetchError: unknown = null;
          for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
            try {
              response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  ...authHeaderCandidates[i],
                },
                body: JSON.stringify(requestBody),
                cache: "no-store",
              });
            } catch (fetchError) {
              lastFetchError = fetchError;
              if (attempt < MAX_RETRY_ATTEMPTS - 1) {
                await sleep(computeRetryDelayMs(attempt, null));
                continue;
              }
              break;
            }

            rawBody = await response.text();
            try {
              data = rawBody ? JSON.parse(rawBody) : null;
            } catch {
              data = rawBody || null;
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

            break;
          }

          if (!response && lastFetchError) {
            const message = formatFetchErrorDetail(lastFetchError);
            
            return {
              to: target.original,
              success: false,
              error: `送信エラー: ${message}`,
            };
          }

          if (response?.status !== 401 || i === authHeaderCandidates.length - 1) {
            break;
          }
        }

        if (!response) {
          return {
            to: target.original,
            success: false,
            error: "送信エラー: APIレスポンスを取得できませんでした。",
          };
        }

        if (!response.ok) {
           const baseError = extractErrorDetail(response.status, data, rawBody);
          const error =
            response.status === 401
              ? `${baseError} (試行ヘッダー: ${Array.from(new Set(attemptedAuthPatterns)).join(" -> ") || "なし"})`
              : baseError;
          return {
            to: target.original,
            success: false,
            error,
            raw: data,
          };
        }

         const anomaly = extractSuccessAnomaly(data, rawBody);
        if (anomaly) {
          return {
            to: target.original,
            success: false,
            error: anomaly,
            raw: data ?? rawBody,
          };
        }

        const responseId = getSuccessfulResponseId(data);

        return {
          to: target.original,
          success: true,
          id: responseId,
          raw: data,
        };
      }),
    );

    const successCount = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success);

    return NextResponse.json({
      total: validFaxTargets.length,
      successCount,
      failedCount: failed.length,
      failed,
      endpoint: apiUrl,
      authScheme,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `NexiLink でのFAX送信に失敗しました。(${error.message})`
            : "NexiLink でのFAX送信に失敗しました。",
      },
      { status: 500 },
    );
  }
}
