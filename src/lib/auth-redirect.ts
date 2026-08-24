/**
 * Post-auth redirect handling.
 *
 * Guest-gated actions send the user to `/auth/signin` (or `/signup`) with the
 * page they came from attached so we can return them after they authenticate.
 * Two param names exist in the wild: the global `AuthRequiredDialog` encodes
 * `?redirect=`, while the agent-claim flow uses `?callbackUrl=`. Both carry a
 * full, already-locale-prefixed internal path (e.g. `/en/communities/x`).
 *
 * Bare signup / sign-in (no param) lands in the Hub community, not the
 * marketing homepage. `getPostAuthRedirect` also remaps `/` and locale roots
 * so a leftover `?redirect=/` cannot send a new member to aitcommunity.org.
 *
 * Values are sanitized so a crafted `?redirect=https://evil.com` can never
 * turn the sign-in page into an open redirect. Push the result with the plain
 * `next/navigation` router — locale-prefixed values would be prefixed twice
 * by the next-intl router.
 */

import { HUB_COMMUNITY_PATH, isMarketingHomePath } from "./join-path";

const REDIRECT_PARAMS = ["redirect", "callbackUrl"] as const;

/** Accept only same-origin absolute paths; everything else falls back to Hub. */
export function sanitizeRedirect(
  value: string | null | undefined,
  fallback = HUB_COMMUNITY_PATH,
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
  if (isMarketingHomePath(value)) return fallback;
  return value;
}

/** Read the post-auth target from URL params (`redirect` or `callbackUrl`). */
export function getPostAuthRedirect(
  params: URLSearchParams,
  fallback = HUB_COMMUNITY_PATH,
): string {
  for (const key of REDIRECT_PARAMS) {
    const raw = params.get(key);
    if (raw) return sanitizeRedirect(raw, fallback);
  }
  return fallback;
}

export { HUB_COMMUNITY_PATH, getHubCommunityPath } from "./join-path";
