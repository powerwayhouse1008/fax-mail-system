import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";
import { verifySessionToken } from "../../../lib/server/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user: session });
}
