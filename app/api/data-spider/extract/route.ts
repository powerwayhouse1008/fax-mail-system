import { NextResponse } from "next/server";
import { extractFromUrl } from "../../../lib/server/data-spider/extractor";

export async function POST(request: Request) {
  let payload: { url?: unknown };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL入力は必須です。" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "有効なURLを入力してください。" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "http または https のURLのみ対応しています。" }, { status: 400 });
  }

  try {
    const extracted = await extractFromUrl(parsedUrl.toString());
    return NextResponse.json({ data: extracted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
