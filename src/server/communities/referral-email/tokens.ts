import { createHmac, timingSafeEqual } from "node:crypto";

export function recipientHash(email: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`referral-recipient:${email.trim().toLowerCase()}`)
    .digest("hex");
}
export function referralOptOutToken(hash: string, secret: string): string {
  const signature = createHmac("sha256", secret)
    .update(`referral-optout:${hash}`)
    .digest("base64url");
  return `${hash}.${signature}`;
}
export function verifyReferralOptOut(
  token: string,
  secret: string,
): string | null {
  if (!/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [hash] = token.split(".");
  const expected = referralOptOutToken(hash!, secret);
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ? hash!
    : null;
}
