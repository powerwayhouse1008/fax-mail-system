import { NextResponse } from "next/server";
import { ADMIN_CREDENTIAL, AUTH_COOKIE_NAME } from "../../lib/auth";
import { createSessionToken } from "../../lib/server/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; email?: string; password?: string };
  const username = String(body.username ?? body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  if (username !== ADMIN_CREDENTIAL.username || password !== ADMIN_CREDENTIAL.password) {
    return NextResponse.json({ message: "Invalid admin credentials" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, username, role: "technical_admin" });
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken({ username, role: "technical_admin" }), {
    httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12, path: "/",
  });
  return response;
}
