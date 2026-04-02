import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, type UserAccount } from "../../lib/auth";
import { verifySessionToken } from "../../lib/server/session";
import { readUsers, writeUsers } from "../../lib/server/user-store";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const unauthorized = () => NextResponse.json({ message: "Unauthorized" }, { status: 401 });

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) return unauthorized();

  const users = await readUsers();
  const safeUsers = users.map(({ password, ...rest }) => rest);
  return NextResponse.json({ users: safeUsers });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session || session.role !== "admin") return unauthorized();

  const body = (await request.json()) as { action?: string; payload?: Partial<UserAccount> };
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

    users.push({
      id: createId(),
      username,
      password,
      name,
      createdAt: new Date().toISOString(),
    });

    await writeUsers(users);
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

    if (payload.username !== undefined) {
      const username = String(payload.username).trim();
      if (!username) return NextResponse.json({ message: "IDは必須です。" }, { status: 400 });
      const duplicate = users.find((item) => item.username === username && item.id !== targetId);
      if (duplicate) return NextResponse.json({ message: "IDは既に存在します。" }, { status: 409 });
      user.username = username;
    }

    if (payload.password !== undefined) {
      const password = String(payload.password).trim();
      if (!password) {
        return NextResponse.json({ message: "パスワードは必須です。" }, { status: 400 });
      }
      user.password = password;
    }

    if (payload.name !== undefined) {
      user.name = String(payload.name).trim() || user.username;
    }

    await writeUsers(users);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const targetId = String(payload.id ?? "").trim();
    const nextUsers = users.filter((item) => item.id !== targetId);
    if (nextUsers.length === users.length) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }

    await writeUsers(nextUsers);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
}
