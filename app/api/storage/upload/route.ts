import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "fax-assets";

const resolveBucketName = () => {
  const raw = (DEFAULT_BUCKET || "fax-assets").trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "fax-assets";
};

function getSupabaseConfig() {
   const rawSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

   if (!rawSupabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
    );
  }
 const supabaseUrl = rawSupabaseUrl.trim().replace(/^(["\"])|(["\"])$/g, "").replace(/\/$/, "");

  if (!/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error("SUPABASE_URL は http:// または https:// で始まる必要があります。");
  }
  return {
    supabaseUrl,
    serviceRoleKey: serviceRoleKey.trim(),
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
  const fileBuffer = await file.arrayBuffer();
  const uploadHeaders = {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
    "x-upsert": "true",
    "Content-Type": file.type || "application/octet-stream",
  };
 const bucketName = resolveBucketName();
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${bucketName}/${objectPath}`;
  const uploadToBucket = () =>
    fetch(uploadUrl, {
      method: "POST",
      headers: uploadHeaders,
      body: fileBuffer,
    });

  try {
     let uploadResponse = await uploadToBucket();

    if (!uploadResponse.ok) {
       let latestErrorBody = await uploadResponse.text();
      let parsedError: { statusCode?: number; message?: string } | null = null;
      try {
        parsedError = JSON.parse(latestErrorBody) as { statusCode?: number; message?: string };
      } catch {
        parsedError = null;
      }

      const hasBucketNotFoundMessage = /bucket not found/i.test(
        `${latestErrorBody} ${parsedError?.message ?? ""}`,
      );
      const hasBucketNotFoundStatus =
        uploadResponse.status === 404 || parsedError?.statusCode === 404;
      const isBucketNotFound = hasBucketNotFoundStatus && hasBucketNotFoundMessage;

      if (isBucketNotFound) {
        const createBucketResponse = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.serviceRoleKey}`,
            apikey: config.serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: bucketName,
            name: bucketName,
            public: true,
          }),
        });

        if (createBucketResponse.ok || createBucketResponse.status === 409) {
          uploadResponse = await uploadToBucket();
          if (!uploadResponse.ok) {
            latestErrorBody = await uploadResponse.text();
          }
        }
      }

      if (!uploadResponse.ok) {
        return NextResponse.json(
          { error: `アップロードに失敗しました: ${latestErrorBody}` },
          { status: uploadResponse.status },
        );
      }
    }

    const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${bucketName}/${objectPath}`;

    return NextResponse.json({
      url: publicUrl,
      path: objectPath,
      bucket: bucketName,
      contentType: file.type || "application/octet-stream",
      filename: file.name,
    });
   } catch (error) {
    const detail = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ error: `アップロード中にエラーが発生しました。 (${detail})` }, { status: 500 });
  }
}
