import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const protectedPaths = ["/dashboard"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old /community/* routes to /communities/ait/forum/*
  const communityMatch = pathname.match(/^\/([a-z]{2})\/community(?:\/(.*))?$/);
  if (communityMatch) {
    const locale = communityMatch[1];
    const rest = communityMatch[2] ? `/${communityMatch[2]}` : "";
    return NextResponse.redirect(
      new URL(`/${locale}/communities/ait/forum${rest}`, request.url),
      301,
    );
  }

  const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, "") || "/";
  const isProtected = protectedPaths.some((p) =>
    pathWithoutLocale.startsWith(p),
  );

  if (isProtected) {
    const sessionToken =
      request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token");
    if (!sessionToken) {
      const locale = pathname.startsWith("/nl") ? "nl" : "en";
      const signInUrl = new URL(`/${locale}/auth/signin`, request.url);
      signInUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|admin|_next|.*\\..*).*)"],
};
