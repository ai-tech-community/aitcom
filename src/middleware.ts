import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { getAuthAliasRedirect, getJoinDoorRedirect } from "./lib/join-path";

const intlMiddleware = createMiddleware(routing);

const protectedPaths = ["/dashboard", "/invite"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old /community/* routes to /communities/ait/forum/*
  const communityMatch = /^\/([a-z]{2})\/community(?:\/(.*))?$/.exec(pathname);
  if (communityMatch) {
    const locale = communityMatch[1];
    const rest = communityMatch[2] ? `/${communityMatch[2]}` : "";
    return NextResponse.redirect(
      new URL(`/${locale}/communities/ait/forum${rest}`, request.url),
      301,
    );
  }

  const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, "") || "/";
  const authAlias = getAuthAliasRedirect(pathname, request.nextUrl.search);
  if (authAlias) {
    return NextResponse.redirect(new URL(authAlias, request.url));
  }

  const sessionToken =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  // Prefixed /en/join and /nl/join: resolve here so the door does not
  // depend on join/page.tsx. Bare /join falls through to next-intl.
  const joinDoor = getJoinDoorRedirect(
    pathname,
    Boolean(sessionToken),
    request.nextUrl.search,
  );
  if (joinDoor) {
    return NextResponse.redirect(new URL(joinDoor, request.url));
  }

  const isProtected = protectedPaths.some((p) =>
    pathWithoutLocale.startsWith(p),
  );

  if (isProtected && !sessionToken) {
    const locale = pathname.startsWith("/nl") ? "nl" : "en";
    const signInUrl = new URL(`/${locale}/auth/signin`, request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|admin|_next|.*\\..*).*)"],
};
