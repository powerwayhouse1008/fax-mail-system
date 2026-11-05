import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";
import { verifySessionToken } from "../../../lib/server/session";
import { readFaxStats, setFaxEnabled } from "../../../lib/server/fax-control";

function isAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  return session?.role === "technical_admin";
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await readFaxStats());
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ message: "enabled must be boolean" }, { status: 400 });
  return NextResponse.json(await setFaxEnabled(body.enabled));
}
