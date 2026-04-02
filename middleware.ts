import { NextRequest, NextResponse } from "next/server";
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

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAuth = protectedPaths.some((path) => pathname.startsWith(path));

  if (!needsAuth) {
    return NextResponse.next();
  }
 
  if (authCookie) {
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (authCookie === "1") {
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
