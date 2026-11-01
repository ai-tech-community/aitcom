import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import type { db as database } from "@/server/db";
import type { Tx } from "@/server/communities/activate-membership";
import { communityMemberships } from "@/server/db/schema";
import { HUB_SLUG } from "@/server/communities/hub";

const SIGNUP_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
export const INVITE_SIGNUP_COOKIE = "ait-invite-signup";
export const SECURE_INVITE_SIGNUP_COOKIE = "__Host-ait-invite-signup";
export const INVITE_SIGNUP_COOKIE_MAX_AGE = SIGNUP_INTENT_TTL_MS / 1000;
export function inviteSignupIntentFromHeaders(
  headers: Headers,
): string | undefined {
  const values = new Map(
    (headers.get("cookie") ?? "").split(";").map((pair) => {
      const index = pair.indexOf("=");
      return [
        pair.slice(0, index).trim(),
        index < 0 ? "" : pair.slice(index + 1).trim(),
      ] as const;
    }),
  );
  return (
    values.get(SECURE_INVITE_SIGNUP_COOKIE) ??
    (process.env.NODE_ENV === "development"
      ? values.get(INVITE_SIGNUP_COOKIE)
      : undefined)
  );
}
function signupSecret(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}
function signature(body: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`invite-signup:${body}`)
    .digest("base64url");
}

/** Marks anonymous invitation entry before the account exists, without email. */
export function createInviteSignupIntent(
  code: string,
  now = new Date(),
): string | undefined {
  const secret = signupSecret();
  if (!secret || !code || code.length > 255) return undefined;
  const body = Buffer.from(
    JSON.stringify({ code, issuedAt: now.getTime() }),
  ).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function readInviteSignupIntent(
  token: string | undefined,
  code: string,
  now = new Date(),
): number | null {
  const secret = signupSecret();
  if (!secret || !token || token.length > 1024) return null;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, body, supplied] = match;
  if (
    !timingSafeEqual(
      Buffer.from(supplied!),
      Buffer.from(signature(body!, secret)),
    )
  )
    return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(body!, "base64url").toString("utf8"),
    );
    if (!payload || typeof payload !== "object") return null;
    const { code: signedCode, issuedAt } = payload as Record<string, unknown>;
    return signedCode === code &&
      typeof issuedAt === "number" &&
      Number.isSafeInteger(issuedAt) &&
      issuedAt <= now.getTime() &&
      now.getTime() - issuedAt < SIGNUP_INTENT_TTL_MS
      ? issuedAt
      : null;
  } catch {
    return null;
  }
}
export function verifyInviteSignupIntent(
  token: string | undefined,
  code: string,
  accountCreatedAt: Date,
  now = new Date(),
): boolean {
  const issuedAt = readInviteSignupIntent(token, code, now);
  const createdAt = accountCreatedAt.getTime();
  return (
    issuedAt !== null &&
    Number.isFinite(createdAt) &&
    createdAt >= issuedAt &&
    createdAt <= now.getTime()
  );
}

type HubReferralGrant = {
  code: string;
  communityId: string;
  createdBy: string;
  maxUses: number | null;
  expiresAt: Date | null;
  targetEmail: string | null;
  role: string | null;
  community: { slug: string };
};

/** Hub signup already made this membership active. A signed pre-signup intent
 * may attribute only a fresh account's unassigned personal-link referrer.
 * Call after normal grant/ban checks, inside the redemption transaction.
 */
export async function recordHubSignupReferral(
  db: typeof database | Tx,
  invite: HubReferralGrant,
  actor: { id: string; createdAt: Date },
  intent: string | undefined,
  now = new Date(),
): Promise<boolean> {
  if (
    invite.community.slug !== HUB_SLUG ||
    invite.createdBy === actor.id ||
    invite.maxUses !== null ||
    invite.expiresAt !== null ||
    invite.targetEmail !== null ||
    (invite.role !== null && invite.role !== "member") ||
    !verifyInviteSignupIntent(intent, invite.code, actor.createdAt, now)
  )
    return false;
  const attributed = await db
    .update(communityMemberships)
    .set({ invitedBy: invite.createdBy })
    .where(
      and(
        eq(communityMemberships.communityId, invite.communityId),
        eq(communityMemberships.userId, actor.id),
        eq(communityMemberships.status, "active"),
        isNull(communityMemberships.invitedBy),
        gte(communityMemberships.joinedAt, actor.createdAt),
      ),
    )
    .returning({ id: communityMemberships.id });
  return attributed.length > 0;
}
