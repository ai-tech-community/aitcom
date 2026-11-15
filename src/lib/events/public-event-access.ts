import type { Where } from "payload";

import {
  communityContentReadableWhere,
  type CommunityVisibility,
  isContentPublic,
} from "@/server/communities/content-visibility";

/**
 * What the event gate needs to know about a community: the seam's
 * visibility facts (ADR-0050).
 */
export type EventCommunityGate = CommunityVisibility;

/**
 * A community whose events a signed-out visitor may see: exactly the
 * communities whose content is public (`isContentPublic`): the Hub
 * (ADR-0030), or a listed community that is open to join. Unlisted
 * communities and private ones (invite-only, or approving join requests),
 * listed or not, stay hidden, and so does any join policy the seam does
 * not know. Fail closed.
 */
export function eventCommunityIsPublic(community: EventCommunityGate): boolean {
  return isContentPublic(community);
}

/**
 * Unscoped events (no community) are public. A hidden community's events
 * are visible only to an active member.
 */
export function viewerMaySeeCommunityEvents(
  community: EventCommunityGate | null | undefined,
  isActiveMember: boolean,
): boolean {
  if (!community) return true;
  return eventCommunityIsPublic(community) || isActiveMember;
}

/**
 * Payload condition for events of communities this viewer may see.
 * `null` means the lookup failed: keep only events with no community.
 */
export function communityEventVisibilityWhere(
  hiddenCommunityIds: readonly string[] | null,
): Where | null {
  if (hiddenCommunityIds === null) {
    return { communityId: { exists: false } };
  }
  return communityContentReadableWhere(hiddenCommunityIds);
}

const PUBLISHED_EVENT: Where = {
  status: { equals: "published" },
  discoverySource: { not_equals: "luma" },
};

/**
 * Published, non-discovered events a viewer may see. Cancelled events are
 * not published, so they stay out of listings and the sitemap.
 * `null` fails closed to events with no community.
 */
export function publishedEventsVisibleWhere(
  hiddenCommunityIds: readonly string[] | null,
): Where {
  const visibility = communityEventVisibilityWhere(hiddenCommunityIds);
  return visibility ? { and: [PUBLISHED_EVENT, visibility] } : PUBLISHED_EVENT;
}
