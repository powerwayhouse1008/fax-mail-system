import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, type UserAccount } from "../../lib/auth";
import { verifySessionToken } from "../../lib/server/session";
import { createUser, deleteUser, readUsers, updateUser } from "../../lib/server/user-store";

const unauthorized = () => NextResponse.json({ message: "Unauthorized" }, { status: 401 });

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

      if (!session || session.role !== "admin") return unauthorized();

    const users = await readUsers();
     return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント一覧の取得に失敗しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = verifySessionToken(token);

   if (!session || session.role !== "admin") return unauthorized();

   const rawBody = await request.text();
    if (!rawBody.trim()) {
      return NextResponse.json({ message: "リクエスト本文が空です。" }, { status: 400 });
    }
  let body: { action?: string; payload?: Partial<UserAccount> };
    try {
      body = JSON.parse(rawBody) as { action?: string; payload?: Partial<UserAccount> };
    } catch {
      return NextResponse.json({ message: "リクエストJSONの形式が正しくありません。" }, { status: 400 });
    }

  const action = body.action;
    const payload = body.payload ?? {};


    const users = await readUsers();

    if (action === "create") {
      const username = String(payload.username ?? "").trim();
      const password = String(payload.password ?? "").trim();
      const name = String(payload.name ?? username).trim();

      if (!username || !password) {
        return NextResponse.json({ message: "IDとパスワードは必須です。" }, { status: 400 });
      }

      if (users.some((user) => user.username === username)) {
        return NextResponse.json({ message: "IDは既に存在します。" }, { status: 409 });
      }

      await createUser({ username, password, name });
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const targetId = String(payload.id ?? "").trim();
      if (!targetId) {
        return NextResponse.json({ message: "対象IDがありません。" }, { status: 400 });
      }

     const user = users.find((item) => item.id === targetId);
      if (!user) {
        return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
      }
      let username: string | undefined;
      let password: string | undefined;
      let name: string | undefined;

      if (payload.username !== undefined) {
        username = String(payload.username).trim();
        if (!username) return NextResponse.json({ message: "IDは必須です。" }, { status: 400 });
        const duplicate = users.find((item) => item.username === username && item.id !== targetId);
        if (duplicate) return NextResponse.json({ message: "IDは既に存在します。" }, { status: 409 });
      }

        if (payload.password !== undefined) {
        password = String(payload.password).trim();
        if (!password) {
          return NextResponse.json({ message: "パスワードは必須です。" }, { status: 400 });
        }
      }

       if (payload.name !== undefined) {
        name = String(payload.name).trim() || username || user.username;
      }
    

      await updateUser({ id: targetId, username, password, name });
      return NextResponse.json({ ok: true });
    }

      if (action === "delete") {
      const targetId = String(payload.id ?? "").trim();
      const targetExists = users.some((item) => item.id === targetId);
      if (!targetExists) {
        return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
      }

      await deleteUser(targetId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント操作に失敗しました。";
    return NextResponse.json({ message }, { status: 500 });
  }
}
