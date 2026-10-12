import { createHmac, timingSafeEqual } from "crypto";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

/** Global weekly-digest opt-out. Section scopes can be added later. */
export const DIGEST_UNSUBSCRIBE_SCOPE = "digest" as const;

export type DigestUnsubscribePayload = {
  userId: string;
  scope: typeof DIGEST_UNSUBSCRIBE_SCOPE;
};

/** Human inbox listed beside the one-click HTTPS URL (RFC 8058). */
export const DIGEST_UNSUBSCRIBE_MAILTO = "mailto:info@klevox.com";

/**
 * Prefer a dedicated secret so rotating the auth secret does not invalidate
 * links already in inboxes. Falls back so a deploy without the new var still
 * signs links.
 */
export function unsubscribeSecret(
  env: {
    DIGEST_UNSUBSCRIBE_SECRET?: string;
    BETTER_AUTH_SECRET?: string;
  } = process.env,
): string | null {
  const dedicated = env.DIGEST_UNSUBSCRIBE_SECRET?.trim();
  if (dedicated) return dedicated;
  const fallback = env.BETTER_AUTH_SECRET?.trim();
  if (fallback) return fallback;
  return null;
}

export function signUnsubscribeToken(
  payload: DigestUnsubscribePayload,
  secret: string,
): string {
  const body = Buffer.from(
    JSON.stringify({ u: payload.userId, s: payload.scope }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): DigestUnsubscribePayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as { u?: unknown; s?: unknown };
    if (parsed.s !== DIGEST_UNSUBSCRIBE_SCOPE) return null;
    if (typeof parsed.u !== "string" || parsed.u.length === 0) return null;
    return { userId: parsed.u, scope: DIGEST_UNSUBSCRIBE_SCOPE };
  } catch {
    return null;
  }
}

/** Confirm page: a finished visit wins, then a token that still verifies. */
export function unsubscribeConfirmStatus(
  token: string | undefined,
  secret: string | null,
  done: boolean,
): "ready" | "done" | "invalid" {
  if (done) return "done";
  if (token && secret && verifyUnsubscribeToken(token, secret)) return "ready";
  return "invalid";
}

/** HTTPS one-click target plus the mailto fallback. The token stays a query
 *  param; campaign tags belong on the footer page link, not this header. */
export function digestListUnsubscribeHeaders(
  token: string,
): Record<string, string> {
  const url = `${CANONICAL_PRODUCTION_ORIGIN}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
  return {
    "List-Unsubscribe": `<${url}>, <${DIGEST_UNSUBSCRIBE_MAILTO}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
