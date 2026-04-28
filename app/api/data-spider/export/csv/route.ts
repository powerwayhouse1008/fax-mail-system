import { NextResponse } from "next/server";
import { listDataSpiderContacts } from "../../../../lib/server/data-spider/store";

const HEADERS = [
  "会社名",
  "担当者名",
  "住所",
  "電話番号",
  "FAX番号",
  "メールアドレス",
  "WebサイトURL",
  "メモ",
  "取得元URL",
  "取得日時",
];

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

export async function GET() {
  try {
    const contacts = await listDataSpiderContacts();
    const rows = contacts.map((item) => [
      item.company_name ?? "",
      item.person_name ?? "",
      item.address ?? "",
      item.phone ?? "",
      item.fax ?? "",
      item.email ?? "",
      item.website_url ?? "",
      item.memo ?? "",
      item.source_url ?? "",
      item.created_at ?? "",
    ]);

    const csv = [HEADERS, ...rows]
      .map((line) => line.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");

    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="data-spider-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV出力に失敗しました。" },
      { status: 500 },
    );
  }
}
