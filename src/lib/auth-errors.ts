/** Better Auth client / API error shape we care about on sign-in. */
export type AuthClientError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

/**
 * Password sign-in is blocked until the address is verified
 * (`requireEmailVerification: true`). Better Auth reports this as
 * `EMAIL_NOT_VERIFIED` (HTTP 403).
 */
export function isEmailNotVerifiedError(
  error: AuthClientError | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "EMAIL_NOT_VERIFIED") return true;
  return (
    error.status === 403 && /email not verified/i.test(error.message ?? "")
  );
}
