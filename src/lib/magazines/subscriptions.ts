export const CONFIRM_LINK_DAYS = 7;
export const CONFIRM_RESEND_MINUTES = 10;
export const CONFIRM_SENDS_PER_SUBSCRIPTION = 3;
export const CONFIRM_MAGAZINES_PER_ADDRESS_PER_DAY = 5;
export const CONFIRM_MAILS_PER_MAGAZINE_PER_DAY = 50;
export const PENDING_SUBSCRIPTION_DAYS = 30;
export const SUBSCRIBER_EMAIL_MAX = 254;

/** Trimmed and lower-cased; null unless it has one @, no spaces and a dot in the domain. */
export function normalizeSubscriberEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > SUBSCRIBER_EMAIL_MAX) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
