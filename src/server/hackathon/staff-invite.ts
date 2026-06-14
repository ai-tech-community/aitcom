// Pure helpers for hackathon staff email invites. No server-only imports — safe
// to import from client components (the manage UI reuses isLikelyEmail/normalizeEmail).

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Pragmatic "looks like an email" check used to decide whether to offer the
// "invite by email" affordance. Not a validator — the server re-normalizes and
// the real address is proven by Better Auth's email verification on signup.
export function isLikelyEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export interface RedeemableInviteFields {
  revokedAt: Date | null;
  redeemedAt: Date | null;
  expiresAt: Date | null;
}

export function isInviteRedeemable(
  invite: RedeemableInviteFields,
  now: Date,
): boolean {
  if (invite.revokedAt !== null) return false;
  if (invite.redeemedAt !== null) return false;
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now.getTime())
    return false;
  return true;
}

// Days an invite stays valid before it expires.
export const STAFF_INVITE_TTL_DAYS = 14;

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + STAFF_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
