// Thin auth-hook triggers for invite redemption, extracted so the
// emailVerified-gating and email-normalization wiring is unit-testable without
// instantiating Better Auth. Used by src/server/better-auth/config.ts.
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { normalizeEmail } from "./staff-invite";
import { redeemPendingStaffInvites } from "./redeem-staff-invites";

// Fired from databaseHooks.user.create.after. Only redeems when the account is
// already verified (true for trusted OAuth providers); email/password accounts
// are unverified at creation and redeem later via redeemAfterVerification.
export async function redeemForCreatedUser(user: {
  id: string;
  email: string;
  emailVerified?: boolean | null;
}): Promise<void> {
  if (!user.emailVerified) return;
  await redeemPendingStaffInvites(db, {
    userId: user.id,
    email: normalizeEmail(user.email),
    now: new Date(),
  });
}

// Fired from emailVerification.afterEmailVerification (email/password path).
export async function redeemAfterVerification(user: {
  id: string;
  email: string;
}): Promise<void> {
  await redeemPendingStaffInvites(db, {
    userId: user.id,
    email: normalizeEmail(user.email),
    now: new Date(),
  });
}

async function loadUserEmail(
  userId: string,
): Promise<{ email: string; emailVerified: boolean | null } | undefined> {
  const [row] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row;
}

// Fired from databaseHooks.session.create.after. Catches accounts whose email
// became verified without afterEmailVerification running — an OAuth sign-in
// that joined an account still waiting for email confirmation. Redemption is
// idempotent, so repeating it on every sign-in is safe.
export async function redeemOnSessionCreated(
  session: { userId: string },
  load: typeof loadUserEmail = loadUserEmail,
): Promise<void> {
  const owner = await load(session.userId);
  if (!owner?.emailVerified) return;
  await redeemPendingStaffInvites(db, {
    userId: session.userId,
    email: normalizeEmail(owner.email),
    now: new Date(),
  });
}
