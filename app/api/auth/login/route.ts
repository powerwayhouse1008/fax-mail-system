import { NextResponse } from "next/server";
import { ADMIN_CREDENTIAL, AUTH_COOKIE_NAME } from "../../../lib/auth";
import { createSessionToken } from "../../../lib/server/session";
import { readUsers } from "../../../lib/server/user-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };

  const username = String(body.username ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\u00A0|\u3000/g, " ");
  const password = String(body.password ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\u00A0|\u3000/g, " ");

  if (!username || !password) {
    return NextResponse.json({ message: "ID.パスワードを入力してください." }, { status: 400 });
  }

  if (username === ADMIN_CREDENTIAL.username && password === ADMIN_CREDENTIAL.password) {
    const token = createSessionToken({ username, role: "admin" });
    const response = NextResponse.json({ username, role: "admin" as const });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    });
    return response;
  }

  const users = await readUsers();
  const matched = users.find((user) => user.username === username && user.password === password);

  if (!matched) {
    return NextResponse.json({ message: "ID・パスワードを間違いました" }, { status: 401 });
  }

  const token = createSessionToken({ username: matched.username, role: "user" });
  const response = NextResponse.json({ username: matched.username, role: "user" as const });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return response;
}
