/**
 * Who may read a community's content and roster. Pure predicates (no DB);
 * the membership lookups and their SQL twins live in
 * ./content-visibility-queries.
 *
 * Two independent facts decide it (ADR-0050):
 *
 * - Listing (`isListedInDirectory`) is discoverability: whether the
 *   community shows on the directory and the Featured strip.
 * - The join policy is consent. A community is **open** when anyone may
 *   join it (`open`); every other policy (`invite_only`,
 *   `approval_required`) makes it **private**: membership needs the
 *   organizer's consent, so what is inside is for members.
 *
 * A **public community** is listed and open. Its content (forum threads and
 * replies, ideas, hackathon spectator views, gallery, magazine) and its
 * roster (member list, member-stack faces) are public. Content is also
 * public on the Hub (ADR-0030). Everything else is members-only. The Hub
 * root is unlisted, so its roster is members-only (ADR-0019, ADR-0021).
 */

import type { Where } from "payload";

import { HUB_SLUG } from "./hub";
import type { JoinPolicy } from "./invite-policy";

export type CommunityVisibility = {
  slug: string;
  isListedInDirectory: boolean;
  joinPolicy: JoinPolicy;
};

/**
 * Just the visibility facts of a community, e.g. to hand to a client screen
 * that runs these rules. One projection, so a new fact reaches every
 * caller at once instead of being dropped by a field-by-field copy.
 */
export function communityVisibilityOf(
  community: CommunityVisibility,
): CommunityVisibility {
  return {
    slug: community.slug,
    isListedInDirectory: community.isListedInDirectory,
    joinPolicy: community.joinPolicy,
  };
}

/**
 * Anyone may join without the organizer's consent. Fails closed: any other
 * stored value, a future policy included, is private.
 */
export function isOpenCommunity(
  community: Pick<CommunityVisibility, "joinPolicy">,
): boolean {
  return community.joinPolicy === "open";
}

/**
 * Membership needs the organizer's consent (an invite or an approval), so
 * only members see inside. Independent of listing: a private community
 * may still appear in the directory.
 */
export function isPrivateCommunity(
  community: Pick<CommunityVisibility, "joinPolicy">,
): boolean {
  return !isOpenCommunity(community);
}

/** Listed and open: content and roster are readable by anyone. */
export function isPublicCommunity(community: CommunityVisibility): boolean {
  return community.isListedInDirectory && isOpenCommunity(community);
}

export function isContentPublic(community: CommunityVisibility): boolean {
  return community.slug === HUB_SLUG || isPublicCommunity(community);
}

export function isRosterPublic(community: CommunityVisibility): boolean {
  return isPublicCommunity(community);
}

/**
 * Public directory cards (`/communities`). The AIT Hub is an explicit browse
 * exception; other unlisted communities stay off the guest grid. Listing
 * only: a private community may be listed, and its card still shows. This
 * does not grant access to its content or roster, nor to the Hub roster,
 * and it does not make the Hub a join recommendation.
 */
export function isPublicDirectoryCommunity(community: {
  slug: string;
  isListedInDirectory: boolean;
}): boolean {
  return community.slug === HUB_SLUG || community.isListedInDirectory;
}

/**
 * Homepage Featured strip. Same public-browse rule as the directory.
 */
export function isFeaturedStripCommunity(community: {
  slug: string;
  isListedInDirectory: boolean;
}): boolean {
  return isPublicDirectoryCommunity(community);
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
