import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { AUTH_COOKIE_NAME } from "./app/lib/auth";

const protectedPaths = [
  "/dashboard",
  "/fax-template",
  "/campaigns",
  "/recipient-list",
  "/send-history",
  "/business-card-upload",
  "/admin",
];
const oauthSessionCookieNames = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAuth = protectedPaths.some((path) => pathname.startsWith(path));

  if (!needsAuth) {
    return NextResponse.next();
  }

  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  try {
    const oauthToken = await getToken({ req: request, secret: authSecret });
    if (oauthToken) {
      return NextResponse.next();
    }
  } catch (error) {
    console.error("[middleware] Failed to parse OAuth token", error);
  }

  const hasOauthSessionCookie = oauthSessionCookieNames.some((cookieName) =>
    Boolean(request.cookies.get(cookieName)?.value),
  );
  if (hasOauthSessionCookie) {
    return NextResponse.next();
  }

  const legacyToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (legacyToken) {
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
