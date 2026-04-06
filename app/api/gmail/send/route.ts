import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 200;

type AttachmentPayload = {
  filename?: unknown;
  content?: unknown;
  type?: unknown;
};

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return NextResponse.json(
      {
        error: "RESEND_API_KEY または RESEND_FROM_EMAIL が未設定です。",
      },
      { status: 500 },
    );
  }

 let payload: {
    emails?: unknown;
    subject?: unknown;
    html?: unknown;
    text?: unknown;
    cc?: unknown;
    bcc?: unknown;
    attachments?: unknown;
  };


  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const emails = Array.isArray(payload.emails)
    ? payload.emails.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];

  const validEmails = emails.filter((email) => emailPattern.test(email));
  const ccEmails = Array.isArray(payload.cc)
    ? payload.cc.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];
  const bccEmails = Array.isArray(payload.bcc)
    ? payload.bcc.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];
  const validCcEmails = ccEmails.filter((email) => emailPattern.test(email));
  const validBccEmails = bccEmails.filter((email) => emailPattern.test(email));
  const customSubject =
    typeof payload.subject === "string" && payload.subject.trim()
      ? payload.subject.trim().slice(0, MAX_SUBJECT_LENGTH)
      : "FAX Mail System からのテスト送信";
  const customHtml =
    typeof payload.html === "string" && payload.html.trim()
      ? payload.html
      : "<p>FAX Mail System からの送信テストです。</p>";
  const customText =
    typeof payload.text === "string" && payload.text.trim()
      ? payload.text
      : "FAX Mail System からの送信テストです。";
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .filter((item): item is AttachmentPayload => typeof item === "object" && item !== null)
        .map((item) => ({
          filename: typeof item.filename === "string" ? item.filename : "",
          content: typeof item.content === "string" ? item.content : "",
          type: typeof item.type === "string" ? item.type : "application/octet-stream",
        }))
        .filter((item) => item.filename && item.content)
    : [];
  if (validEmails.length === 0) {
    return NextResponse.json({ error: "有効なGmailアドレスがありません。" }, { status: 400 });
  }

  try {
    const results = await Promise.all(
      validEmails.map(async (to) => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [to],
           cc: validCcEmails.length > 0 ? validCcEmails : undefined,
            bcc: validBccEmails.length > 0 ? validBccEmails : undefined,
            subject: customSubject,
            html: customHtml,
            text: customText,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            to,
            success: false,
            error: data?.message ?? "送信エラー",
          };
        }

        return { to, success: true, id: data?.id ?? null };
      }),
    );

    const successCount = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success);

    return NextResponse.json({
      total: validEmails.length,
      successCount,
      failed,
    });
  } catch {
    return NextResponse.json({ error: "Resend での送信に失敗しました。" }, { status: 500 });
  }
}
