import { NextResponse } from "next/server";
import { extractFromFile } from "../../../lib/server/data-spider/extractor-file";
import { extractFromUrl } from "../../../lib/server/data-spider/extractor";

const jsonHeaders = (request: Request) => request.headers.get("content-type")?.includes("application/json");
export async function POST(request: Request) {
  try {
     if (jsonHeaders(request)) {
      const payload = (await request.json()) as { url?: unknown };
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

   const extracted = await extractFromUrl(parsedUrl.toString());
      return NextResponse.json({ data: extracted[0], items: extracted, total: extracted.length });
    }

  const form = await request.formData();
    const fileEntry = form.get("file");

    if (!fileEntry || typeof fileEntry === "string" || typeof fileEntry.arrayBuffer !== "function") {
      return NextResponse.json({ error: "ファイルを選択してください。" }, { status: 400 });
    }

    const extracted = await extractFromFile(fileEntry as File);
    return NextResponse.json({ data: extracted[0], items: extracted, total: extracted.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
