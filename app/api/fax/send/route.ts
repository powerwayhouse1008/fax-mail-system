import { NextResponse } from "next/server";

const DIRECT_SEND_PATH = "/api/v1/facsimiles/direct_send";
const MAX_SUBJECT_LENGTH = 200;
const faxPattern = /^[0-9+\-()\s]{6,30}$/;

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
  const trimmed = token.trim();

  switch (scheme) {
    case "token":
      return { Authorization: `Token ${trimmed}` };
    case "bearer":
      return { Authorization: `Bearer ${trimmed}` };
    case "x-api-key":
      return { "X-API-KEY": trimmed };
    case "x-auth-token":
      return { "X-Auth-Token": trimmed };
    case "raw":
      return { Authorization: trimmed };
    default:
      return { Authorization: `Token ${trimmed}` };
  }
}

function getResolvedApiUrl() {
  const endpointUrl = process.env.NEXILINK_FAX_ENDPOINT?.trim();
  const baseUrl = process.env.NEXLINK_API_BASE_URL?.trim();
  const apiPath = process.env.NEXLINK_API_PATH?.trim();

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

function extractErrorDetail(status: number, data: unknown, fallbackText: string) {
  const details: string[] = [];
  let applicationErrorCode = "";

  if (typeof data === "string" && data.trim()) {
    details.push(data.trim());
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
      return text.slice(0, 500);
    }
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
  const apiToken =
    process.env.NEXLINK_API_TOKEN?.trim() ||
    process.env.NEXILINK_API_KEY?.trim() ||
    "";
  const senderId = process.env.NEXILINK_SENDER_ID?.trim() || "";
  const authScheme = (process.env.NEXLINK_AUTH_SCHEME?.trim().toLowerCase() ||
    "token") as AuthScheme;

  if (!apiUrl) {
    return NextResponse.json(
      {
        error:
          "NEXILINK_FAX_ENDPOINT または NEXLINK_API_BASE_URL が未設定です。",
      },
      { status: 500 },
    );
  }

  if (!apiToken) {
    return NextResponse.json(
      {
        error:
          "NEXLINK_API_TOKEN または NEXILINK_API_KEY が未設定です。",
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
    const authHeaders = buildAuthHeaders(apiToken, authScheme);

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

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify(requestBody),
          cache: "no-store",
        });

        const rawBody = await response.text();
        let data: unknown = null;

        try {
          data = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          data = rawBody || null;
        }

        if (!response.ok) {
          return {
            to: target.original,
            success: false,
            error: extractErrorDetail(response.status, data, rawBody),
            raw: data,
          };
        }

        const responseId =
          data && typeof data === "object" && "id" in data
            ? (data as Record<string, unknown>).id
            : null;

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
