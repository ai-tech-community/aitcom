import { and, eq } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { account, session, user } from "@/server/db/schema";

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

/**
 * Undo the provider's `emailVerified: true` after a failed release, so the
 * next OAuth sign-in makes the same update and the guard runs again. Without
 * this, a transient failure would leave a verified account that still has
 * the stranger's password, and no later event would ever remove it.
 */
export async function revertProviderVerification(
  database: typeof Db,
  userId: string,
): Promise<void> {
  await database
    .update(user)
    .set({ emailVerified: false })
    .where(eq(user.id, userId));
}

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

/**
 * Routes that run Better Auth's OAuth join (`handleOAuthUserInfo`): the
 * redirect callback, and `/sign-in/social` with a provider ID token (Google
 * One Tap style). Both verify the email the same way.
 */
function isOAuthSignIn(ctx: HookContext): ctx is { path: string } {
  if (typeof ctx?.path !== "string") return false;
  return ctx.path.startsWith("/callback/") || ctx.path === "/sign-in/social";
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
  revert: (userId: string) => Promise<void>;
}) {
  const verifiedByProvider = new WeakSet<object>();

  return {
    before: (data: { emailVerified?: boolean | null }, ctx: HookContext) => {
      if (!deps.emailVerificationRequired) return;
      if (isOAuthSignIn(ctx) && data.emailVerified === true) {
        verifiedByProvider.add(ctx);
      }
    },
    after: async (updated: { id: string }, ctx: HookContext) => {
      if (!ctx || !verifiedByProvider.delete(ctx)) return;
      try {
        await deps.release(updated.id);
      } catch (error) {
        // Fail the sign-in, and put the account back in the waiting state so
        // a retry re-runs this guard.
        await deps.revert(updated.id);
        throw error;
      }
    },
  };
}
