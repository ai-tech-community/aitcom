import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { eventStartInstant } from "@/lib/event-time";
import type { Event } from "@/payload-types";
import { isActiveCommunityMember } from "@/server/communities/content-visibility-queries";
import { DEFAULT_TOPIC } from "@/server/communities/post-topics";
import { isModeratorRole } from "@/server/communities/post-visibility";
import { communities, communityMemberships } from "@/server/db/schema";

import type { GalleryDeps, Payload } from "./deps";
import { galleryError } from "./errors";

/**
 * Who is looking at a community's gallery. A member is an active member
 * whose paid membership (where the community charges) is in order; a
 * moderator is an active owner, admin or moderator.
 */
export type GalleryViewer = {
  userId: string | null;
  communityId: string;
  isMember: boolean;
  isModerator: boolean;
};

/**
 * The viewer of the gallery of the live community with this slug. An unknown
 * or deleted community is NOT_FOUND; a signed-out visitor is an outsider.
 */
export async function loadGalleryViewer(
  deps: Pick<GalleryDeps, "db">,
  input: { slug: string; userId: string | null },
): Promise<GalleryViewer & { community: { id: string; slug: string } }> {
  const community = await deps.db.query.communities.findFirst({
    where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
    columns: { id: true, slug: true },
  });
  if (!community) throw new TRPCError({ code: "NOT_FOUND" });
  const outsider = {
    userId: input.userId,
    communityId: community.id,
    isMember: false,
    isModerator: false,
    community: { id: community.id, slug: community.slug },
  };
  if (!input.userId) return outsider;
  const membership = await deps.db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, input.userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  if (!membership) return outsider;
  const isMember = await isActiveCommunityMember(
    deps.db,
    community.id,
    input.userId,
  );
  return {
    ...outsider,
    isMember,
    isModerator: isMember && isModeratorRole(membership.role),
  };
}

/**
 * Event states whose photos may be added. This is the event's own `status`
 * field, never Payload's `_status`: live events can be Payload drafts.
 */
const LINKABLE_EVENT_STATUSES: readonly string[] = ["published", "completed"];

/**
 * Whether gallery items of `communityId` may link to this event (spec
 * 2026-11-13, Events): it is the same community's (a Hub event has no
 * community, so it never matches), published or completed, and has started
 * in its own time zone. The upload dialog's event list uses the same rule.
 */
export function isLinkableEvent(
  event: Pick<
    Event,
    "communityId" | "status" | "date" | "startTime" | "timezone"
  >,
  communityId: string,
  now: Date,
): boolean {
  if (!event.communityId || event.communityId !== communityId) return false;
  if (!LINKABLE_EVENT_STATUSES.includes(event.status)) return false;
  const start = eventStartInstant(event);
  return start !== null && start.getTime() <= now.getTime();
}

/** Refuses (EVENT_NOT_ALLOWED) an event gallery items of this community may not link to. */
export async function assertLinkableEvent(
  payload: Payload,
  communityId: string,
  eventId: number,
  now: Date,
): Promise<void> {
  const event = await payload.findByID({
    collection: "events",
    id: eventId,
    depth: 0,
    draft: false,
    disableErrors: true,
  });
  if (!event || !isLinkableEvent(event, communityId, now)) {
    throw galleryError("EVENT_NOT_ALLOWED");
  }
}

/**
 * Refuses (TOPIC_NOT_FOUND) a category that is not one of the community's
 * topics. The default topic exists in every community, as for feed posts.
 */
export async function assertCommunityTopic(
  payload: Payload,
  communityId: string,
  topicSlug: string,
): Promise<void> {
  if (topicSlug === DEFAULT_TOPIC) return;
  const { totalDocs } = await payload.count({
    collection: "community-topics",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { slug: { equals: topicSlug } },
      ],
    },
  });
  if (totalDocs === 0) throw galleryError("TOPIC_NOT_FOUND");
}
