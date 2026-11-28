import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

/**
 * Deep link that opens the "Create a community" dialog on the directory.
 * Server-safe constants (no "use client"), so server pages can link to it.
 */
export const CREATE_COMMUNITY_PARAM = "create";
export const CREATE_COMMUNITY_ANCHOR_PARAM = "createAnchor";
export const CREATE_COMMUNITY_HREF = `/communities?${CREATE_COMMUNITY_PARAM}=1`;
export const COMMUNITY_FIRST_POST_ID = "write-first-post";

export function communityPublicUrl(path: `/${string}`): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const publicOrigin =
    configured && URL.canParse(configured) ? new URL(configured) : null;
  const isPublic =
    publicOrigin &&
    (publicOrigin.protocol === "https:" || publicOrigin.protocol === "http:") &&
    !/^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/.test(
      publicOrigin.hostname,
    );
  return `${isPublic ? publicOrigin.origin : CANONICAL_PRODUCTION_ORIGIN}${path}`;
}

export function createCommunityReturnTo(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.set(CREATE_COMMUNITY_PARAM, "1");
  // Better Auth rejects fragments in relative callbacks. Restore the anchor
  // when the directory consumes the create intent after authentication.
  if (url.hash) params.set(CREATE_COMMUNITY_ANCHOR_PARAM, url.hash.slice(1));
  return `${url.pathname}?${params}`;
}
