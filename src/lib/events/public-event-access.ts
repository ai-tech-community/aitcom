import type { Where } from "payload";

import { communityContentReadableWhere } from "@/server/communities/content-visibility";
import { HUB_SLUG } from "@/server/communities/hub";

/**
 * A community whose events a signed-out visitor may see.
 * The Hub stays public (ADR-0030). Any other unlisted community is a private
 * room. An invite-only community stays off public event surfaces even when
 * it is listed in the directory. Open and approval-required listed
 * communities stay public.
 */
export type EventCommunityGate = {
  slug: string;
  isListedInDirectory: boolean;
  joinPolicy: "open" | "invite_only" | "approval_required";
};

export function eventCommunityIsPublic(community: EventCommunityGate): boolean {
  if (community.slug === HUB_SLUG) return true;
  if (!community.isListedInDirectory) return false;
  if (community.joinPolicy === "invite_only") return false;
  return true;
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
