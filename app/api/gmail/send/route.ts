import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  let payload: { emails?: unknown };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const emails = Array.isArray(payload.emails)
    ? payload.emails.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];

  const validEmails = emails.filter((email) => emailPattern.test(email));

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
            subject: "FAX Mail System からのテスト送信",
            html: "<p>FAX Mail System からの送信テストです。</p>",
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
