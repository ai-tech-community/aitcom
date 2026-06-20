/**
 * Post-auth redirect handling.
 *
 * Guest-gated actions send the user to `/auth/signin` (or `/signup`) with the
 * page they came from attached so we can return them after they authenticate.
 * Two param names exist in the wild: the global `AuthRequiredDialog` encodes
 * `?redirect=`, while the agent-claim flow uses `?callbackUrl=`. Both carry a
 * full, already-locale-prefixed internal path (e.g. `/en/communities/x`).
 *
 * `getPostAuthRedirect` reads whichever is present and sanitizes it so a
 * crafted `?redirect=https://evil.com` can never turn the sign-in page into an
 * open redirect. Push the result with the plain `next/navigation` router — the
 * value already includes the locale, so the next-intl router would prefix it
 * twice.
 */

const REDIRECT_PARAMS = ["redirect", "callbackUrl"] as const;

/** Accept only same-origin absolute paths; everything else falls back. */
export function sanitizeRedirect(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  // Reject protocol-relative (`//host`), backslash tricks (`/\host`), and any
  // value that isn't a plain absolute path.
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }
  return value;
}

/** Read the post-auth target from URL params (`redirect` or `callbackUrl`). */
export function getPostAuthRedirect(
  params: URLSearchParams,
  fallback = "/",
): string {
  for (const key of REDIRECT_PARAMS) {
    const raw = params.get(key);
    if (raw) return sanitizeRedirect(raw, fallback);
  }
  return fallback;
}
