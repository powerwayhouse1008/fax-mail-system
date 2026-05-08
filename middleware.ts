import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { AUTH_COOKIE_NAME } from "./app/lib/auth";
import { verifySessionToken } from "./app/lib/server/session";

const protectedPaths = [
  "/dashboard",
  "/fax-template",
  "/campaigns",
  "/recipient-list",
  "/send-history",
  "/business-card-upload",
  "/admin",
];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAuth = protectedPaths.some((path) => pathname.startsWith(path));

  if (!needsAuth) {
    return NextResponse.next();
  }
 

  const oauthToken = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (oauthToken) {
    return NextResponse.next();
  }

  const legacyToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const legacySession = verifySessionToken(legacyToken);
  if (legacySession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/fax-template/:path*",
    "/campaigns/:path*",
    "/recipient-list/:path*",
    "/send-history/:path*",
    "/business-card-upload/:path*",
    "/admin/:path*",
  ],
};
