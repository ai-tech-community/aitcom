import { getResend } from "@/server/email";
import { escapeHtml } from "@/server/email-template";
import { canonicalizeVerificationUrl } from "./base-url";

const FROM_EMAIL = "AIT Community <noreply@mailer.aitcommunity.org>";

/**
 * Do not require a verified inbox when no mailer can deliver the link —
 * that combination is how new signups get stuck on EMAIL_NOT_VERIFIED.
 */
export function isEmailVerificationRequired(
  resendApiKey: string | undefined,
): boolean {
  return Boolean(resendApiKey);
}

/**
 * Better Auth only treats verification as enabled when this callback lives
 * under `emailVerification.sendVerificationEmail`. The same Resend client
 * as welcome / reset mail is used; if `RESEND_API_KEY` is unset, nothing
 * is sent and the caller gets `false`.
 */
export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { email: string; name?: string | null };
  url: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  const verifyUrl = canonicalizeVerificationUrl(url, {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  });
  await resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject: "Verify your email — AIT Community",
    html: `<p>Hi ${escapeHtml(user.name ?? "there")},</p><p>Please verify your email by clicking <a href="${escapeHtml(verifyUrl)}">this link</a>.</p>`,
  });
  return true;
}
