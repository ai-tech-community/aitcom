/**
 * Who may read a community's content and roster. Pure predicates (no DB);
 * the membership lookups live in ./content-visibility-queries.
 *
 * - Content (forum threads and replies, hackathon spectator views) is public
 *   on the Hub and on directory-listed communities, and members-only on an
 *   unlisted community (ADR-0030).
 * - The roster (member list, member-stack faces) is public only on a listed
 *   community. The Hub root is unlisted, so its roster is members-only
 *   (ADR-0019, ADR-0021).
 */

import type { Where } from "payload";

import { HUB_SLUG } from "./hub";

export type CommunityVisibility = {
  slug: string;
  isListedInDirectory: boolean;
};

export function isContentPublic(community: CommunityVisibility): boolean {
  return community.slug === HUB_SLUG || community.isListedInDirectory;
}

export function isRosterPublic(community: CommunityVisibility): boolean {
  return community.isListedInDirectory;
}

export function canReadContent(
  community: CommunityVisibility,
  isActiveMember: boolean,
): boolean {
  return isContentPublic(community) || isActiveMember;
}

export function canReadRoster(
  community: CommunityVisibility,
  isActiveMember: boolean,
): boolean {
  return isRosterPublic(community) || isActiveMember;
}

/**
 * Payload `where` that drops community-scoped content (forum threads, ideas)
 * of communities the viewer may not read. Unscoped (legacy Hub) rows stay
 * visible: SQL `NOT IN` alone would drop their NULL `communityId`, so they
 * are matched explicitly.
 */
export function communityContentReadableWhere(
  hiddenCommunityIds: readonly string[],
): Where | null {
  if (hiddenCommunityIds.length === 0) return null;
  return {
    or: [
      { communityId: { exists: false } },
      { communityId: { not_in: [...hiddenCommunityIds] } },
    ],
  };
}
