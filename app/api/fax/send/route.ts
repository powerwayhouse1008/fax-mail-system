import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "https://sandbox-hea.nexlink2.jp";
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 3;
const faxPattern = /^[0-9+\-()\s]{6,30}$/;

type RequestPayload = {
  faxNumbers?: unknown;
  deliveryName?: unknown;
  allowInternationalFax?: unknown;
  quality?: unknown;
};

type SendResult =
  | {
      to: string;
      success: true;
      facsimileId: number | string | null;
      transmissionId: number | string | null;
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
    .trim();
}

function buildAuthHeader(token: string) {
  const trimmed = normalizeAuthToken(token);
  if (!trimmed) return {};
  return {
    Authorization: `token ${trimmed}`,
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

  if (typeof data === "string" && data.trim()) {
    const normalized = normalizeErrorText(data);
    if (normalized) {
      if (isLikelyNotFoundHtml(normalized)) {
        return "NEXLINK API のページが見つかりませんでした。Base URL またはエンドポイントをご確認ください。";
      }
      details.push(normalized);
    }
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

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
          if (
            typeof errorRecord.message === "string" &&
            errorRecord.message.trim()
          ) {
            details.push(errorRecord.message.trim());
          }
          if (
            typeof errorRecord.detail === "string" &&
            errorRecord.detail.trim()
          ) {
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
  }

  if (details.length > 0) {
    return details.join(" / ");
  }

  const normalizedFallback = normalizeErrorText(fallbackText);
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

async function createFacsimile(params: {
  baseUrl: string;
  apiToken: string;
  contactListId: number;
  deliveryName: string;
}) {
  const url = new URL("/api/v1/facsimiles", params.baseUrl).toString();

  return fetchJsonWithRetry(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...buildAuthHeader(params.apiToken),
    },
    body: JSON.stringify({
      delivery_name: params.deliveryName,
      contact_list_id: params.contactListId,
       // Some Nexlink environments validate `contact_list` (not only `contact_list_id`).
      // Send both keys to avoid validation errors like:
      // "contact_list: Contact listを入力してください。"
      contact_list: params.contactListId,
    }),
  });
}

async function createTestTransmission(params: {
  baseUrl: string;
  apiToken: string;
  facsimileId: number | string;
  faxNumber: string;
  allowInternationalFax: boolean;
  quality: number;
}) {
  const url = new URL(
    `/api/v1/facsimiles/${params.facsimileId}/test_transmissions`,
    params.baseUrl,
  ).toString();

  return fetchJsonWithRetry(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...buildAuthHeader(params.apiToken),
    },
    body: JSON.stringify({
      fax_number: params.faxNumber,
      allow_international_fax: params.allowInternationalFax,
      quality: params.quality,
    }),
  });
}

export async function POST(request: Request) {
  const baseUrl = readEnv(
    "NEXLINK_API_BASE_URL",
    "NEXILINK_API_BASE_URL",
  ) || DEFAULT_BASE_URL;

  const apiToken = readEnv(
    "NEXLINK_API_TOKEN",
    "NEXILINK_API_TOKEN",
    "NEXLINK_API_KEY",
    "NEXILINK_API_KEY",
  );

  const contactListIdRaw = readEnv(
    "NEXLINK_CONTACT_LIST_ID",
    "NEXILINK_CONTACT_LIST_ID",
  );

  if (!apiToken) {
    return NextResponse.json(
      { error: "NEXLINK_API_TOKEN が未設定です。" },
      { status: 500 },
    );
  }

  if (!contactListIdRaw) {
    return NextResponse.json(
      {
        error:
          "NEXLINK_CONTACT_LIST_ID が未設定です。03-01 FAX新規作成に必要です。",
      },
      { status: 500 },
    );
  }

  const contactListId = Number(contactListIdRaw);
  if (!Number.isInteger(contactListId) || contactListId <= 0) {
    return NextResponse.json(
      {
        error: "NEXLINK_CONTACT_LIST_ID が不正です。数値で設定してください。",
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

  const deliveryName =
    typeof payload.deliveryName === "string" && payload.deliveryName.trim()
      ? payload.deliveryName.trim()
      : `テストFAX_${new Date().toISOString()}`;

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
    const facsimileResponse = await createFacsimile({
      baseUrl,
      apiToken,
      contactListId,
      deliveryName,
    });

    if (!facsimileResponse.ok) {
      const error = extractErrorDetail(
        facsimileResponse.status,
        facsimileResponse.data,
        facsimileResponse.rawText,
      );

      return NextResponse.json(
        {
          error: `FAX新規作成に失敗しました: ${error}`,
          endpoint: `${baseUrl}/api/v1/facsimiles`,
          raw: facsimileResponse.data,
        },
        { status: 400 },
      );
    }

    const facsimileId =
      getObjectValue<number | string>(facsimileResponse.data, "id") ??
      getObjectValue<number | string>(facsimileResponse.data, "facsimile_id");

    if (!facsimileId) {
      return NextResponse.json(
        {
          error:
            "FAX新規作成は成功しましたが、facsimile_id を取得できませんでした。",
          raw: facsimileResponse.data,
        },
        { status: 500 },
      );
    }

    const results: SendResult[] = [];

    for (const target of validFaxTargets) {
      const transmissionResponse = await createTestTransmission({
        baseUrl,
        apiToken,
        facsimileId,
        faxNumber: target.normalized,
        allowInternationalFax,
        quality,
      });

      if (!transmissionResponse.ok) {
        results.push({
          to: target.original,
          success: false,
          error: extractErrorDetail(
            transmissionResponse.status,
            transmissionResponse.data,
            transmissionResponse.rawText,
          ),
          raw: transmissionResponse.data,
        });
        continue;
      }

      const transmissionId =
        getObjectValue<number | string>(transmissionResponse.data, "id") ??
        getObjectValue<number | string>(
          transmissionResponse.data,
          "test_facsimile_id",
        ) ??
        getObjectValue<number | string>(
          transmissionResponse.data,
          "test_transmission_id",
        );

      results.push({
        to: target.original,
        success: true,
        facsimileId,
        transmissionId,
        raw: transmissionResponse.data,
      });
    }

    const successCount = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success);

    return NextResponse.json({
      total: validFaxTargets.length,
      successCount,
      failedCount: failed.length,
      facsimileId,
      endpointCreate: `${baseUrl}/api/v1/facsimiles`,
      endpointTestTransmission: `${baseUrl}/api/v1/facsimiles/{facsimile_id}/test_transmissions`,
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
