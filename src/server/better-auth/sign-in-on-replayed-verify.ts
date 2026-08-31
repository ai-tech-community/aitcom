import { createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

import { HUB_COMMUNITY_PATH } from "@/lib/join-path";
import { pinVerifyRedirectLocation } from "./base-url";

type ReplayEnroll = (session: { userId: string }) => Promise<void>;

export type SignInOnReplayedVerificationOptions = {
  /**
   * Hub enrolment for the replay session. First-verify already runs
   * `afterEmailVerification` + `session.create.after`; a burned token
   * skips the former. Keep this optional so unit tests do not load Neon.
   */
  enroll?: ReplayEnroll;
};

/**
 * Better Auth 1.4 verifies the JWT on every GET /verify-email, then
 * returns early when `user.emailVerified` is already true — no
 * `createSession`, no `setSessionCookie`. Mail-client prefetch consumes
 * the first hit; the human click is that already-verified path and
 * lands on Hub signed-out.
 *
 * Mint a session only for a still-valid identity: JWT Better Auth
 * already accepted (redirect without `error=`), no change-email
 * `updateTo`, and a verified user. Then rebuild the 302 the same way
 * first-verify does (`setSessionCookie` then `throw ctx.redirect`) so
 * the cookie is born on the response Hub's `getSession` already reads.
 * Expired / invalid tokens keep the error redirect.
 */
export function createSignInOnReplayedVerification(
  options: SignInOnReplayedVerificationOptions = {},
) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path === "/sign-in/email") {
      pinPasswordSignInRedirect(ctx);
      return;
    }
    if (ctx.path !== "/verify-email") return;
    if (!isSuccessfulVerifyRedirect(ctx.context.returned)) return;

    const requestUrl = ctx.request?.url;
    const returnedLocation =
      ctx.context.returned && typeof ctx.context.returned === "object"
        ? readLocation(ctx.context.returned)
        : null;
    const location = pinVerifyRedirectLocation(
      returnedLocation ?? HUB_COMMUNITY_PATH,
      requestUrl,
    );

    if (!responseAlreadyHasSession(ctx)) {
      const token = readVerifyToken(ctx);
      if (!token) {
        throw ctx.redirect(location);
      }

      const payload = decodeJwtPayload(token);
      if (!payload || typeof payload.email !== "string" || payload.updateTo) {
        throw ctx.redirect(location);
      }

      const user = await ctx.context.internalAdapter.findUserByEmail(
        payload.email,
      );
      if (!user?.user.emailVerified) {
        throw ctx.redirect(location);
      }

      const session = await ctx.context.internalAdapter.createSession(
        user.user.id,
      );
      if (!session) {
        throw ctx.redirect(location);
      }

      if (options.enroll) {
        await options.enroll({ userId: user.user.id }).catch(() => {
          /* session.create.after / getMyCommunities also retry */
        });
      }

      await setSessionCookie(ctx, {
        session,
        user: user.user,
      });
    }

    // First-verify already set the cookie. Replay mints one above. Rebuild
    // the 302 onto www so Better Auth baseURL / Vercel cannot send Hub to
    // apex — Domain=aitcommunity.org is not enough on that hop.
    throw ctx.redirect(location);
  });
}

export const signInOnReplayedVerification =
  createSignInOnReplayedVerification();

/**
 * Password sign-in leftover after #252: Better Auth sets a relative
 * Location / `callbackURL` (or the form `router.push`es `/en/communities/ait`).
 * Vercel primary-domain then lands Hub on apex, so the www
 * `__Secure-better-auth.session_token` is not on the document they get.
 * Rebuild the 302 onto www the same way verify does.
 */
function pinPasswordSignInRedirect(ctx: {
  body?: unknown;
  request?: Request | undefined;
  redirect: (url: string) => unknown;
  context: {
    returned?: unknown;
    newSession?: unknown;
    responseHeaders?: Headers;
  };
}) {
  if (!responseAlreadyHasSession(ctx)) return;

  const returnedLocation =
    ctx.context.returned && typeof ctx.context.returned === "object"
      ? readLocation(ctx.context.returned)
      : null;
  const bodyCallback = readCallbackUrl(ctx.body);
  const location = pinVerifyRedirectLocation(
    returnedLocation ?? bodyCallback ?? HUB_COMMUNITY_PATH,
    ctx.request?.url,
  );
  throw ctx.redirect(location);
}

function readCallbackUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const callback = (body as { callbackURL?: unknown }).callbackURL;
  return typeof callback === "string" && callback ? callback : null;
}

function readVerifyToken(ctx: {
  query?: Record<string, unknown> | undefined;
  request?: Request | undefined;
}): string | null {
  if (typeof ctx.query?.token === "string" && ctx.query.token) {
    return ctx.query.token;
  }
  if (!ctx.request) return null;
  try {
    return new URL(ctx.request.url).searchParams.get("token");
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function responseAlreadyHasSession(ctx: {
  context: { newSession?: unknown; responseHeaders?: Headers };
}): boolean {
  if (ctx.context.newSession) return true;
  const headers = ctx.context.responseHeaders;
  if (!headers) return false;
  const cookies =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const raw = headers.get("set-cookie") ?? "";
  return [...cookies, raw].some((cookie) => cookie.includes("session_token"));
}

function isSuccessfulVerifyRedirect(returned: unknown): boolean {
  if (!returned || typeof returned !== "object") return false;
  const statusCode =
    "statusCode" in returned && typeof returned.statusCode === "number"
      ? returned.statusCode
      : undefined;
  const status = "status" in returned ? returned.status : undefined;
  const isRedirect =
    statusCode === 302 ||
    statusCode === 301 ||
    status === "FOUND" ||
    status === "MOVED_PERMANENTLY" ||
    status === 302 ||
    status === 301;
  if (!isRedirect) return false;

  const location = readLocation(returned);
  if (!location) return false;
  try {
    const url = location.startsWith("http")
      ? new URL(location)
      : new URL(location, "https://www.aitcommunity.org");
    return !url.searchParams.has("error");
  } catch {
    return !/[?&]error=/.test(location);
  }
}

function readLocation(returned: object): string | null {
  if (returned instanceof Response) {
    return returned.headers.get("location") ?? returned.headers.get("Location");
  }
  if (!("headers" in returned) || !returned.headers) return null;
  const headers = returned.headers;
  if (headers instanceof Headers) {
    return headers.get("location") ?? headers.get("Location");
  }
  if (typeof headers === "object") {
    const record = headers as Record<string, string>;
    return record.location ?? record.Location ?? null;
  }
  return null;
}
