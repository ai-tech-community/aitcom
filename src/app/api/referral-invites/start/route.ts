import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSession } from "@/server/better-auth/server";
import { resolveLocale } from "@/i18n/messages";
import { inviteAttributionSearch } from "@/lib/referral-invites";
import { loadInviteLanding } from "@/server/communities/referral-email/landing";
import {
  createInviteSignupIntent,
  readInviteSignupIntent,
  inviteSignupIntentFromHeaders,
  INVITE_SIGNUP_COOKIE,
  SECURE_INVITE_SIGNUP_COOKIE,
  INVITE_SIGNUP_COOKIE_MAX_AGE,
} from "@/server/communities/referral-email/signup-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit guest CTA. Pre-signup proof stays in an HttpOnly browser cookie;
 * it never travels in a shareable URL or an untrusted RPC parameter.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 255)
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  const locale = resolveLocale(url.searchParams.get("locale"));
  const session = await getSession();
  const landing = await loadInviteLanding(db, code, session?.user?.id);
  const attribution = inviteAttributionSearch(
    Object.fromEntries(url.searchParams),
  );
  const path = `/${locale}/invite/${encodeURIComponent(code)}`;
  if (landing.kind !== "valid")
    return NextResponse.redirect(new URL(`${path}${attribution}`, url), 303);
  const callback = `${path}${attribution}${attribution ? "&" : "?"}accept=1`;
  if (session?.user) return NextResponse.redirect(new URL(callback, url), 303);
  const mode = url.searchParams.get("mode") === "signin" ? "signin" : "signup";
  const response = NextResponse.redirect(
    new URL(
      `/${locale}/auth/${mode}?${new URLSearchParams({ redirect: callback })}`,
      url,
    ),
    303,
  );
  const existing = inviteSignupIntentFromHeaders(request.headers);
  const intent =
    readInviteSignupIntent(existing, code) !== null
      ? existing
      : createInviteSignupIntent(code);
  if (intent) {
    const secure = url.protocol === "https:";
    response.cookies.set(
      secure ? SECURE_INVITE_SIGNUP_COOKIE : INVITE_SIGNUP_COOKIE,
      intent,
      {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: INVITE_SIGNUP_COOKIE_MAX_AGE,
      },
    );
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
