import { createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/**
 * Better Auth 1.4 verifies the JWT on every GET /verify-email, then
 * returns early when `user.emailVerified` is already true — no
 * `createSession`, no `setSessionCookie`. Mail-client prefetch consumes
 * the first hit; the human click is that already-verified path and
 * lands on Hub signed-out.
 *
 * Mint a session only for a still-valid identity: JWT Better Auth
 * already accepted (redirect without `error=`), no change-email
 * `updateTo`, and a verified user. Expired / invalid tokens keep the
 * error redirect. Fresh tokens still take autoSignInAfterVerification.
 */
export const signInOnReplayedVerification = createAuthMiddleware(
  async (ctx) => {
    if (ctx.path !== "/verify-email") return;
    if (responseAlreadyHasSession(ctx)) return;
    if (!isSuccessfulVerifyRedirect(ctx.context.returned)) return;

    const token = readVerifyToken(ctx);
    if (!token) return;

    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.email !== "string" || payload.updateTo) {
      return;
    }

    const user = await ctx.context.internalAdapter.findUserByEmail(
      payload.email,
    );
    if (!user?.user.emailVerified) return;

    const session = await ctx.context.internalAdapter.createSession(
      user.user.id,
    );
    if (!session) return;

    await setSessionCookie(ctx, {
      session,
      user: user.user,
    });
  },
);

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
    status === "MOVED_PERMANENTLY";
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
