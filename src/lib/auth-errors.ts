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

export type OAuthErrorMessageKey =
  | "oauthUnverifiedEmail"
  | "oauthAccountInUse"
  | "oauthFailed";

/**
 * Better Auth sends a failed OAuth sign-in or link back to `errorCallbackURL`
 * with `?error=<code>`. Map the code to a member-facing message key in the
 * `auth` namespace. A cancelled consent screen (`access_denied`) needs no
 * message.
 */
export function oauthErrorMessageKey(
  code: string | null | undefined,
): OAuthErrorMessageKey | null {
  if (!code || code === "access_denied") return null;
  // Existing account with this email, but the provider has not verified it
  // (sign-in), or the provider email is unverified (Settings link).
  if (code === "account_not_linked" || code === "unable_to_link_account") {
    return "oauthUnverifiedEmail";
  }
  if (code === "account_already_linked_to_different_user") {
    return "oauthAccountInUse";
  }
  return "oauthFailed";
}

/** Current path and query without a previous OAuth error, for retrying. */
export function oauthErrorCallbackURL(
  pathname: string,
  search: URLSearchParams | null,
): string {
  const params = new URLSearchParams(search ?? undefined);
  params.delete("error");
  params.delete("error_description");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
