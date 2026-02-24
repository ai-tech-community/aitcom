import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const protectedPaths = ["/dashboard"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, "") || "/";
  const isProtected = protectedPaths.some((p) =>
    pathWithoutLocale.startsWith(p),
  );

  if (isProtected) {
    const sessionToken = request.cookies.get("better-auth.session_token");
    console.log("[middleware] protected path:", pathWithoutLocale, "| cookie:", sessionToken ? "EXISTS" : "MISSING", "| all cookies:", request.cookies.getAll().map(c => c.name).join(", "));
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
