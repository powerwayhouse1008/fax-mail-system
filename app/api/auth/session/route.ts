import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";
import { verifySessionToken } from "../../../lib/server/session";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (session?.user) {
    return NextResponse.json({ authenticated: true, user: session.user, provider: "microsoft" });
  }
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const legacySession = verifySessionToken(token);

   if (!legacySession) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user: legacySession, provider: "legacy" });
}
