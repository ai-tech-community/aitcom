import { and, eq } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { account, session } from "@/server/db/schema";

/**
 * Pre-account-takeover guard.
 *
 * With email verification required, an email+password account cannot sign in
 * until someone clicks the emailed link — and anyone can start such a sign-up
 * for any address. When the real owner later signs in with an OAuth provider
 * using that address, Better Auth joins the accounts and marks the email
 * verified. Left in place, the stranger's password would then work too.
 *
 * Better Auth marks the email verified during an OAuth callback only when the
 * provider reports the email verified AND it equals the account's email (see
 * `handleOAuthUserInfo` in better-auth/oauth2/link-account). That update is
 * the exact moment the provider proves an address the password never did, so
 * it is where we release the password. A member linking from Settings goes
 * through a different branch that never touches `emailVerified`, so it is
 * never affected.
 */

/** Delete the user's password account and, if one existed, all sessions. */
export async function releaseUnprovenPassword(
  database: typeof Db,
  userId: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const released = await tx
      .delete(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential")),
      )
      .returning({ id: account.id });
    if (released.length === 0) return false;

    await tx.delete(session).where(eq(session.userId, userId));
    return true;
  });
}

type HookContext = { path?: string } | null | undefined;

function isOAuthCallback(ctx: HookContext): ctx is { path: string } {
  return typeof ctx?.path === "string" && ctx.path.startsWith("/callback/");
}

/**
 * `databaseHooks.user.update` pair. `before` sees the patch but not the user
 * id; `after` sees the user but not the patch. `before` marks the request
 * when an OAuth callback sets `emailVerified: true`; `after` releases the
 * password for that user. Keyed by the per-request hook context, so nothing
 * leaks across requests.
 *
 * Only meaningful when email verification is required: without it an
 * unverified password account is fully usable, so there is no waiting
 * account to protect.
 */
export function createProviderVerificationGuard(deps: {
  emailVerificationRequired: boolean;
  release: (userId: string) => Promise<boolean>;
}) {
  const verifiedByProvider = new WeakSet<object>();

  return {
    before: (data: { emailVerified?: boolean | null }, ctx: HookContext) => {
      if (!deps.emailVerificationRequired) return;
      if (isOAuthCallback(ctx) && data.emailVerified === true) {
        verifiedByProvider.add(ctx);
      }
    },
    after: async (updated: { id: string }, ctx: HookContext) => {
      if (!ctx || !verifiedByProvider.delete(ctx)) return;
      await deps.release(updated.id);
    },
  };
}
