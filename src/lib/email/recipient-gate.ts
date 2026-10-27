/** The only address a test or preview send may use. Not configurable. */
export const MAIL_TEST_RECIPIENT = "greg@klevox.com";

export type MailEnv = { VERCEL_ENV?: string; NODE_ENV?: string };

/** Only Vercel production running Node production may email real readers. */
export function gatedMailRecipient(to: string, env: MailEnv): string | null {
  const email = to.trim().toLowerCase();
  if (!email.includes("@") || email.includes(" ")) return null;
  const production =
    env.VERCEL_ENV === "production" && env.NODE_ENV === "production";
  if (production) return email;
  return email === MAIL_TEST_RECIPIENT ? MAIL_TEST_RECIPIENT : null;
}
