import { NextResponse } from "next/server";

const faxPattern = /^[0-9+\-()\s]{6,30}$/;
const MAX_SUBJECT_LENGTH = 200;
const DEFAULT_DIRECT_SEND_PATH = "/api/v1/facsimiles/direct_send";
type AuthHeaderSet = {
  Authorization?: string;
  "X-API-KEY"?: string;
  "X-Auth-Token"?: string;
};

const buildAuthHeaderCandidates = (rawToken: string) => {
  const token = rawToken.trim();
  if (!token) {
    return [];
  }

  const candidates: AuthHeaderSet[] = [];
  const normalized = token.toLowerCase();
  if (normalized.startsWith("token ") || normalized.startsWith("bearer ")) {
    const rawValue = token.replace(/^(token|bearer)\s+/i, "").trim();
    candidates.push({ Authorization: token });
    if (rawValue) {
      candidates.push({ "X-API-KEY": rawValue }, { "X-Auth-Token": rawValue });
    }
  } else {
    candidates.push(
      { Authorization: `token ${token}` },
      { Authorization: `Token ${token}` },
      { Authorization: `Token token=${token}` },
      { Authorization: `Bearer ${token}` },
      { Authorization: token },
      { "X-API-KEY": token },
      { "X-Auth-Token": token },
    );
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
const normalizeFaxNumber = (value: string) => {
  const normalized = value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
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
  if (!candidates || candidates.length === 0) {
    return "";
  }

  return candidates[0]
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()\-]/g, "");
};

type AttachmentPayload = {
  filename?: unknown;
  content?: unknown;
  url?: unknown;
  type?: unknown;
};
const extractErrorDetail = (status: number, data: unknown, fallbackText: string) => {
  const detailCandidates: string[] = [];
  let applicationErrorCode = "";
  
  if (typeof data === "string" && data.trim()) {
    detailCandidates.push(data.trim());
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.application_error_code === "string" && record.application_error_code.trim()) {
      applicationErrorCode = record.application_error_code.trim();
    }
    const directKeys = ["message", "error", "detail", "title"];
    for (const key of directKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        detailCandidates.push(value.trim());
      }
    }

    if (Array.isArray(record.errors)) {
      for (const item of record.errors) {
        if (typeof item === "string" && item.trim()) {
          detailCandidates.push(item.trim());
          continue;
        }
        if (item && typeof item === "object") {
          const errorRecord = item as Record<string, unknown>;
          if (typeof errorRecord.message === "string" && errorRecord.message.trim()) {
            detailCandidates.push(errorRecord.message.trim());
          }
          if (typeof errorRecord.detail === "string" && errorRecord.detail.trim()) {
            detailCandidates.push(errorRecord.detail.trim());
          }
        }
      }
    }
    
    if (Array.isArray(record.details)) {
      for (const item of record.details) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const detailRecord = item as Record<string, unknown>;
        const parameter = typeof detailRecord.parameter === "string" ? detailRecord.parameter.trim() : "";
        const message = typeof detailRecord.message === "string" ? detailRecord.message.trim() : "";

        if (parameter && message) {
          detailCandidates.push(`${parameter}: ${message}`);
        } else if (message) {
          detailCandidates.push(message);
        }
      }
    }

    if (
      applicationErrorCode === "0080001" &&
      Array.isArray(record.details) &&
      record.details.some((item) => {
        if (!item || typeof item !== "object") {
          return false;
        }
        const parameter = (item as Record<string, unknown>).parameter;
        return parameter === "contact_list" || parameter === "contact_list_id";
      })
    ) {
      detailCandidates.unshift(
        "NexiLink API の送信先設定エラーです。contact_list_id が必要なエンドポイントが指定されています。NEXLINK_API_PATH または NEXILINK_FAX_ENDPOINT を直接送信用エンドポイントに変更してください。",
      );
    }
  }
  
  if (detailCandidates.length > 0) {
    return detailCandidates.join(" / ");
  }

  const trimmedFallbackText = fallbackText.trim();
  if (trimmedFallbackText) {
    try {
      const parsedFallback = JSON.parse(trimmedFallbackText) as unknown;
      if (parsedFallback && typeof parsedFallback === "object") {
        const fallbackRecord = parsedFallback as Record<string, unknown>;
        const fallbackKeys = ["message", "error", "detail", "title"];
        for (const key of fallbackKeys) {
          const value = fallbackRecord[key];
          if (typeof value === "string" && value.trim()) {
            return value.trim().slice(0, 300);
          }
        }
      }
    } catch {
      return trimmedFallbackText.slice(0, 300);
    }
  }

  return `送信エラー (HTTP ${status})`;
  };
  
  export async function POST(request: Request) {
  const baseUrl = process.env.NEXLINK_API_BASE_URL;
  const apiPath = process.env.NEXLINK_API_PATH;
  const endpointUrl = process.env.NEXILINK_FAX_ENDPOINT;
  const normalizedEndpointUrl = endpointUrl?.trim();
  const normalizedApiPath = apiPath?.trim();
  const resolvedApiPath =
    normalizedApiPath && normalizedApiPath !== "/api/v1/facsimiles"
      ? normalizedApiPath
      : DEFAULT_DIRECT_SEND_PATH;
  const apiUrl =
    normalizedEndpointUrl && normalizedEndpointUrl.length > 0
      ? normalizedEndpointUrl
      : baseUrl
        ? new URL(resolvedApiPath, baseUrl).toString()
        : undefined;
  const apiToken = process.env.NEXLINK_API_TOKEN ?? process.env.NEXILINK_API_KEY;
  const senderId = process.env.NEXILINK_SENDER_ID;

  if (!apiUrl || !apiToken) {
    return NextResponse.json(
      {
         error: "NEXLINK_API_BASE_URL または NEXLINK_API_TOKEN が未設定です。",
      },
      { status: 500 },
    );
  }

  let payload: {
    faxNumbers?: unknown;
    subject?: unknown;
    html?: unknown;
    text?: unknown;
    attachments?: unknown;
  };

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

  const subject =
    typeof payload.subject === "string" && payload.subject.trim()
      ? payload.subject.trim().slice(0, MAX_SUBJECT_LENGTH)
      : "FAX Mail System からの送信テスト";
  const html =
    typeof payload.html === "string" && payload.html.trim()
      ? payload.html
      : "<p>FAX Mail System からの送信テストです。</p>";
  const text =
    typeof payload.text === "string" && payload.text.trim()
      ? payload.text
      : "FAX Mail System からの送信テストです。";
  const attachmentsPayload = Array.isArray(payload.attachments)
    ? payload.attachments
        .filter((item): item is AttachmentPayload => typeof item === "object" && item !== null)
        .map((item) => ({
          filename: typeof item.filename === "string" ? item.filename : "",
          content: typeof item.content === "string" ? item.content : "",
          url: typeof item.url === "string" ? item.url : "",
          type: typeof item.type === "string" ? item.type : "application/octet-stream",
        }))
        .filter((item) => item.filename && (item.content || item.url))
    : [];

  try {
    const attachments = await Promise.all(
      attachmentsPayload.map(async (item) => {
        if (item.content) {
          return {
            filename: item.filename,
            content: item.content,
            type: item.type,
          };
        }

        const fileResponse = await fetch(item.url);
        if (!fileResponse.ok) {
          throw new Error(`添付ファイルの取得に失敗しました: ${item.filename}`);
        }
        const arrayBuffer = await fileResponse.arrayBuffer();
        return {
          filename: item.filename,
          content: Buffer.from(arrayBuffer).toString("base64"),
          type: item.type,
        };
      }),
    );
    
    const authHeaderCandidates = buildAuthHeaderCandidates(apiToken);
    const results = await Promise.all(
      validFaxTargets.map(async (target) => {
        for (let index = 0; index < authHeaderCandidates.length; index += 1) {
           const authHeaders = authHeaderCandidates[index];
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({
              to: target.normalized,
              senderId: senderId || undefined,
              subject,
              html,
              text,
              attachments: attachments.length > 0 ? attachments : undefined,
            }),
          });

          const rawBody = await response.text();
          let data: unknown = null;
          try {
            data = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            data = null;
          }

          const isRetryableUnauthorized =
            response.status === 401 && index < authHeaderCandidates.length - 1;
          if (isRetryableUnauthorized) {
            continue;
          }

          if (!response.ok) {
            const detail = extractErrorDetail(response.status, data, rawBody);
            return {
              to: target.original,
              success: false,
              error: detail,
            };
          }

          const responseId =
            data && typeof data === "object" && "id" in data ? (data as { id?: unknown }).id : null;

        
          return {
            to: target.original,
            success: true,
            id: responseId,
          };
        }

        return {
          to: target.original,
           success: false,
          error: "送信エラー (認証ヘッダーの生成に失敗しました)",
        };
      }),
    );

    const successCount = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success);

    return NextResponse.json({
      total: validFaxTargets.length,
      successCount,
      failed,
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
