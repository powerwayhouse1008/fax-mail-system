import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.json({
    ok: true,
    signOutUrl: "/api/auth/signout",
  });

  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  for (const cookie of request.headers.get("cookie")?.split(";") ?? []) {
    const name = cookie.split("=")[0]?.trim();
    if (name && name !== AUTH_COOKIE_NAME) response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  
  return response;
}
