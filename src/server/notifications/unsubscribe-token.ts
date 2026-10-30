import { createHmac, timingSafeEqual } from "crypto";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

/** Global weekly-digest opt-out. Section scopes can be added later. */
export const DIGEST_UNSUBSCRIBE_SCOPE = "digest" as const;

/** Opt out of emails sent when a news story is published. */
export const STORY_UNSUBSCRIBE_SCOPE = "story" as const;

/** Stop new-issue emails for one magazine subscription. */
export const MAGAZINE_UNSUBSCRIBE_SCOPE = "magazine" as const;

export type UnsubscribeScope =
  | typeof DIGEST_UNSUBSCRIBE_SCOPE
  | typeof STORY_UNSUBSCRIBE_SCOPE
  | typeof MAGAZINE_UNSUBSCRIBE_SCOPE;

export type UnsubscribePayload =
  | {
      scope: typeof DIGEST_UNSUBSCRIBE_SCOPE | typeof STORY_UNSUBSCRIBE_SCOPE;
      userId: string;
    }
  | { scope: typeof MAGAZINE_UNSUBSCRIBE_SCOPE; subscriptionId: string };

export type DigestUnsubscribePayload = {
  scope: typeof DIGEST_UNSUBSCRIBE_SCOPE;
  userId: string;
};

/** Human inbox listed beside the one-click HTTPS URL (RFC 8058). */
export const DIGEST_UNSUBSCRIBE_MAILTO = "mailto:info@klevox.com";

/**
 * Prefer a dedicated secret so rotating the auth secret does not invalidate
 * links already in inboxes. Falls back so a deploy without the new var still
 * signs links.
 */
type UnsubscribeSecretEnv = {
  DIGEST_UNSUBSCRIBE_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
};

export function unsubscribeSecret(env?: UnsubscribeSecretEnv): string | null {
  const source = env ?? {
    DIGEST_UNSUBSCRIBE_SECRET: process.env.DIGEST_UNSUBSCRIBE_SECRET,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  };
  const dedicated = source.DIGEST_UNSUBSCRIBE_SECRET?.trim();
  if (dedicated) return dedicated;
  const fallback = source.BETTER_AUTH_SECRET?.trim();
  if (fallback) return fallback;
  return null;
}

export function signUnsubscribeToken(
  payload: UnsubscribePayload,
  secret: string,
): string {
  const body = Buffer.from(
    JSON.stringify({
      u:
        payload.scope === MAGAZINE_UNSUBSCRIBE_SCOPE
          ? payload.subscriptionId
          : payload.userId,
      s: payload.scope,
    }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): UnsubscribePayload | null {
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
    if (typeof parsed.u !== "string" || parsed.u.length === 0) return null;
    switch (parsed.s) {
      case DIGEST_UNSUBSCRIBE_SCOPE:
      case STORY_UNSUBSCRIBE_SCOPE:
        return { userId: parsed.u, scope: parsed.s };
      case MAGAZINE_UNSUBSCRIBE_SCOPE:
        return { subscriptionId: parsed.u, scope: parsed.s };
      default:
        return null;
    }
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
