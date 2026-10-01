/**
 * Deep link that finishes joining a community on the directory after
 * sign-in: `/communities?join=<slug>`. A guest who presses Join is sent to
 * sign in with this as the return path. Server-safe (no "use client").
 */
export const JOIN_COMMUNITY_PARAM = "join";

/** The directory URL that joins `slug` once the visitor is signed in. */
export function joinReturnPath(currentPath: string, slug: string): string {
  const [path = "/", query = ""] = currentPath.split("?");
  const params = new URLSearchParams(query);
  params.set(JOIN_COMMUNITY_PARAM, slug);
  return `${path}?${params.toString()}`;
}
