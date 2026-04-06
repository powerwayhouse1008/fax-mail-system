import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "fax-assets";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
  };
}

const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "unknown";

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "フォームデータの解析に失敗しました。" }, { status: 400 });
  }

 const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string" || typeof fileEntry.arrayBuffer !== "function") {
    return NextResponse.json({ error: "ファイルが見つかりません。" }, { status: 400 });
  }
  const file = fileEntry as File;

  const scope = safeSegment(String(formData.get("scope") || "guest"));
  const channel = safeSegment(String(formData.get("channel") || "fax"));
  const category = safeSegment(String(formData.get("category") || "misc"));
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const objectPath = `${scope}/${channel}/${category}/${Date.now()}-${randomUUID()}${extension}`;

  let config: { supabaseUrl: string; serviceRoleKey: string };
  try {
    config = getSupabaseConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Supabase 設定エラー" },
      { status: 500 },
    );
  }

  try {
    const uploadResponse = await fetch(
      `${config.supabaseUrl}/storage/v1/object/${DEFAULT_BUCKET}/${objectPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.serviceRoleKey}`,
          apikey: config.serviceRoleKey,
          "x-upsert": "true",
          "Content-Type": file.type || "application/octet-stream",
        },
        body: Buffer.from(await file.arrayBuffer()),
      },
    );

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text();
      return NextResponse.json(
        { error: `アップロードに失敗しました: ${errorBody}` },
        { status: uploadResponse.status },
      );
    }

    const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${DEFAULT_BUCKET}/${objectPath}`;

    return NextResponse.json({
      url: publicUrl,
      path: objectPath,
      bucket: DEFAULT_BUCKET,
      contentType: file.type || "application/octet-stream",
      filename: file.name,
    });
  } catch {
    return NextResponse.json({ error: "アップロード中にエラーが発生しました。" }, { status: 500 });
  }
}
