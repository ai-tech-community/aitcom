/** Better Auth client / API error shape we care about on sign-in. */
export type AuthClientError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

/**
 * User-facing text from a Better Auth `{ error }` result or a thrown failure.
 * Sign-in returns `{ message: "Invalid origin" }`; sign-up can throw the same
 * text and otherwise leave the form spinning with no toast.
 */
export function getAuthClientErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as AuthClientError).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

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
