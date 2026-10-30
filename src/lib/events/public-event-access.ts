import type { Where } from "payload";

import { communityContentReadableWhere } from "@/server/communities/content-visibility";
import { HUB_SLUG } from "@/server/communities/hub";

/**
 * Join policies whose events a signed-out visitor may see, and only when
 * the community is also listed. Anything else — invite-only, or a policy
 * this list does not name — stays hidden.
 */
export const PUBLIC_EVENT_JOIN_POLICIES = [
  "open",
  "approval_required",
] as const;

/**
 * A community whose events a signed-out visitor may see.
 * Public only for the Hub (ADR-0030), or a directory-listed community whose
 * join policy is in `PUBLIC_EVENT_JOIN_POLICIES`. Unlisted rooms,
 * invite-only communities (listed or not), and any unknown join policy
 * stay hidden. Fail closed.
 */
export type EventCommunityGate = {
  slug: string;
  isListedInDirectory: boolean;
  /** Stored as varchar. Unknown values are not public. */
  joinPolicy: string;
};

export function eventCommunityIsPublic(community: EventCommunityGate): boolean {
  if (community.slug === HUB_SLUG) return true;
  if (!community.isListedInDirectory) return false;
  return (PUBLIC_EVENT_JOIN_POLICIES as readonly string[]).includes(
    community.joinPolicy,
  );
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
