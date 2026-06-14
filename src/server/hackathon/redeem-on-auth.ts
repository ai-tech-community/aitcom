// Thin auth-hook triggers for invite redemption, extracted so the
// emailVerified-gating and email-normalization wiring is unit-testable without
// instantiating Better Auth. Used by src/server/better-auth/config.ts.
import { db } from "@/server/db";
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
