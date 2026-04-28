import { NextResponse } from "next/server";
import {
  deleteDataSpiderContactById,
  updateDataSpiderContact,
} from "../../../../lib/server/data-spider/store";

export async function PATCH(
  request: Request,
  context: { params: { id: string } },
) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  try {
    const updated = await updateDataSpiderContact(context.params.id, payload);
    return NextResponse.json({ contact: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } },
) {
  try {
    await deleteDataSpiderContactById(context.params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました。" },
      { status: 500 },
    );
  }
  
  }
