import { NextResponse } from "next/server";

const faxPattern = /^[0-9+\-()\s]{6,30}$/;
const MAX_SUBJECT_LENGTH = 200;
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

  if (typeof data === "string" && data.trim()) {
    detailCandidates.push(data.trim());
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
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
  }

  if (detailCandidates.length > 0) {
    return detailCandidates.join(" / ");
  }

  if (fallbackText.trim()) {
    return fallbackText.trim().slice(0, 300);
  }

  return `送信エラー (HTTP ${status})`;
export async function POST(request: Request) {
  const baseUrl = process.env.NEXLINK_API_BASE_URL;
  const apiPath = process.env.NEXLINK_API_PATH;
  const endpointUrl = process.env.NEXILINK_FAX_ENDPOINT;
  const apiUrl =
    endpointUrl ??
    (baseUrl ? new URL(apiPath ?? "/api/v1/facsimiles", baseUrl).toString() : undefined);
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

    const results = await Promise.all(
      validFaxTargets.map(async (target) => {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `token ${apiToken}`,
            "Content-Type": "application/json",
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
