export type ReferralEmailEnv = {
  REFERRAL_INVITES_ENABLED?: string;
  REFERRAL_INVITE_REMINDERS_ENABLED?: string;
  REFERRAL_INVITE_SECRET?: string;
  REFERRAL_RESEND_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

export function referralEmailEnv(): ReferralEmailEnv {
  return {
    REFERRAL_INVITES_ENABLED: process.env.REFERRAL_INVITES_ENABLED,
    REFERRAL_INVITE_REMINDERS_ENABLED:
      process.env.REFERRAL_INVITE_REMINDERS_ENABLED,
    REFERRAL_INVITE_SECRET: process.env.REFERRAL_INVITE_SECRET,
    REFERRAL_RESEND_WEBHOOK_SECRET: process.env.REFERRAL_RESEND_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/** Fail closed: there is no preview/test-recipient bypass for this feature. */
export function referralSendingEnabled(env = referralEmailEnv()): boolean {
  return (
    env.REFERRAL_INVITES_ENABLED === "true" &&
    env.VERCEL_ENV === "production" &&
    env.NODE_ENV === "production" &&
    (env.REFERRAL_INVITE_SECRET?.trim().length ?? 0) >= 32 &&
    Boolean(env.REFERRAL_RESEND_WEBHOOK_SECRET?.trim()) &&
    Boolean(env.RESEND_API_KEY?.trim())
  );
}

export function referralSecret(env = referralEmailEnv()): string {
  const secret = env.REFERRAL_INVITE_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new Error("Referral signing is not configured");
  return secret;
}

export function referralPhaseEnabled(
  phase: "invite" | "reminder",
  env = referralEmailEnv(),
): boolean {
  return (
    referralSendingEnabled(env) &&
    (phase === "invite" || env.REFERRAL_INVITE_REMINDERS_ENABLED === "true")
  );
}
