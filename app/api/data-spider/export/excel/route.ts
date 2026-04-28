import { NextResponse } from "next/server";
import { listDataSpiderContacts } from "../../../../lib/server/data-spider/store";

const columns = [
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

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  try {
    const contacts = await listDataSpiderContacts();

    const headerRow = `<Row>${columns
      .map((header) => `<Cell><Data ss:Type=\"String\">${escapeXml(header)}</Data></Cell>`)
      .join("")}</Row>`;

    const dataRows = contacts
      .map(
        (item) =>
          `<Row>${[
            item.company_name,
            item.person_name,
            item.address,
            item.phone,
            item.fax,
            item.email,
            item.website_url,
            item.memo,
            item.source_url,
            item.created_at,
          ]
            .map((value) => `<Cell><Data ss:Type=\"String\">${escapeXml(value ?? "")}</Data></Cell>`)
            .join("")}</Row>`,
      )
      .join("");

    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="DataSpider">
  <Table>
   ${headerRow}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="data-spider-${Date.now()}.xls"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Excel出力に失敗しました。" },
      { status: 500 },
    );
  }
}
