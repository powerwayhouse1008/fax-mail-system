import { NextResponse } from "next/server";
import {
  createDataSpiderContacts,
  deleteDataSpiderContactsByIds,
  listDataSpiderContacts,
} from "../../../lib/server/data-spider/store";

export async function GET() {
  try {
    const contacts = await listDataSpiderContacts();
    return NextResponse.json({ contacts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "データ取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: { contacts?: unknown };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const contacts = Array.isArray(payload.contacts)
    ? payload.contacts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];

  if (contacts.length === 0) {
    return NextResponse.json({ error: "保存対象がありません。" }, { status: 400 });
  }

  try {
    const created = await createDataSpiderContacts(contacts);
    return NextResponse.json({ contacts: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  let payload: { ids?: unknown };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "削除対象がありません。" }, { status: 400 });
  }

  try {
    await deleteDataSpiderContactsByIds(ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました。" },
      { status: 500 },
    );
  }
}
