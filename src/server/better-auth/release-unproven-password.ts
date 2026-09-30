import { and, eq } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { account, session, user } from "@/server/db/schema";

/**
 * Pre-account-takeover guard.
 *
 * With email verification required, an email+password account cannot sign in
 * until someone clicks the emailed link — and anyone can create such a waiting
 * account for any address. When an OAuth sign-in later joins that account by
 * email, the provider has proven the address; the password has not. Left in
 * place, the password's author would share the account once the join marks
 * the email verified.
 *
 * So before an OAuth account is attached to a user whose email is unverified,
 * we delete that user's password and sessions. Only the person who proved the
 * email keeps access. A verified user (every signed-in member linking from
 * Settings) is untouched.
 */
export async function releaseUnprovenPassword(
  database: typeof Db,
  userId: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [owner] = await tx
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!owner || owner.emailVerified) return false;

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

/**
 * databaseHooks.account.create.before. Throwing aborts the link, so a failed
 * release never leaves the unproven password attached (fail closed).
 *
 * Only meaningful when email verification is required: without it an
 * unverified account is fully usable, there is no "waiting" account to
 * protect, and releasing would sign out a member linking from Settings.
 */
export async function guardOAuthAccountCreate(
  created: { userId: string; providerId: string },
  deps: {
    emailVerificationRequired: boolean;
    release: (userId: string) => Promise<boolean>;
  },
): Promise<void> {
  if (!deps.emailVerificationRequired) return;
  if (created.providerId === "credential") return;
  await deps.release(created.userId);
}
