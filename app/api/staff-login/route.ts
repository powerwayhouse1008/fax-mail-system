import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../lib/auth";
import { createSessionToken } from "../../lib/server/session";
import { readUsers, verifyPassword } from "../../lib/server/user-store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; email?: string; password?: string };
  const username = String(body.username ?? body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  const user = (await readUsers()).find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (!user || !(await verifyPassword(password, user.password))) {
    return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, username: user.username, role: user.role });
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken({ username: user.username, role: user.role }), {
    httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12, path: "/",
  });
  return response;
}
