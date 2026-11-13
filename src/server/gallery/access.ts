import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { isModeratorRole } from "@/lib/communities/moderator-roles";
import { eventStartInstant } from "@/lib/event-time";
import type { Event } from "@/payload-types";
import {
  canReadContent,
  type CommunityVisibility,
} from "@/server/communities/content-visibility";
import { activeCommunityRole } from "@/server/communities/content-visibility-queries";
import { DEFAULT_TOPIC } from "@/server/communities/post-topics";
import { communities } from "@/server/db/schema";
import { canReadPaidCommunity } from "@/server/payments/access";

import type { GalleryDeps, Payload } from "./deps";
import { galleryError } from "./errors";

/**
 * Who is looking at a community's gallery. A member is an active member
 * whose paid membership (where the community charges) is in order; a
 * moderator is an active owner, admin or moderator.
 *
 * What the viewer may see is decided here, once: members see `community`
 * and `public` items; anyone else sees `public` items only when outsiders
 * may read the community's content at all (`canSeePublic`) — "Everyone"
 * never punches through a members-only or paid community.
 */
export type GalleryViewer = {
  userId: string | null;
  communityId: string;
  isMember: boolean;
  isModerator: boolean;
  canSeePublic: boolean;
};

/** What the access rules need to know about a community. */
export type GalleryCommunity = CommunityVisibility & { id: string };

const VIEWER_COMMUNITY_COLUMNS = {
  id: true,
  slug: true,
  isListedInDirectory: true,
} as const;

/**
 * Whether someone who is not an active member may read the community's
 * content: the outsider half of `viewerCanReadContent`. The pure check runs
 * first so a members-only community never needs the payment lookup.
 */
async function outsidersMayRead(
  deps: Pick<GalleryDeps, "db">,
  community: GalleryCommunity,
  userId: string | null,
): Promise<boolean> {
  return (
    canReadContent(community, false) &&
    (await canReadPaidCommunity(deps.db, community.id, userId))
  );
}

/** The viewer behind a user (or a signed-out visitor) in a live community. */
async function viewerIn(
  deps: Pick<GalleryDeps, "db">,
  community: GalleryCommunity,
  userId: string | null,
): Promise<GalleryViewer> {
  const role = await activeCommunityRole(deps.db, community.id, userId);
  const isMember = role !== null;
  return {
    userId,
    communityId: community.id,
    isMember,
    isModerator: isModeratorRole(role),
    canSeePublic: isMember || (await outsidersMayRead(deps, community, userId)),
  };
}

/**
 * The viewer of the gallery of the live community with this slug. An unknown
 * or deleted community is NOT_FOUND; a signed-out visitor is an outsider.
 */
export async function loadGalleryViewer(
  deps: Pick<GalleryDeps, "db">,
  input: { slug: string; userId: string | null },
): Promise<GalleryViewer & { community: GalleryCommunity }> {
  const community = await deps.db.query.communities.findFirst({
    where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
    columns: VIEWER_COMMUNITY_COLUMNS,
  });
  if (!community) throw new TRPCError({ code: "NOT_FOUND" });
  return {
    ...(await viewerIn(deps, community, input.userId)),
    community: {
      id: community.id,
      slug: community.slug,
      isListedInDirectory: community.isListedInDirectory,
    },
  };
}

/**
 * Whether an item shared with "Everyone" reaches anyone beyond the members:
 * true when a signed-out visitor may read the community's content. False in
 * a members-only or paid community, where outsiders see nothing, so the
 * upload dialog does not offer a choice that changes nothing.
 */
export async function publicItemsReachOutsiders(
  deps: Pick<GalleryDeps, "db">,
  community: GalleryCommunity,
): Promise<boolean> {
  return outsidersMayRead(deps, community, null);
}

/**
 * The viewer of a gallery reached through one of its records (a batch, an
 * item), which hold the community's id. Null when the community was deleted:
 * callers answer that as they answer an unknown record.
 */
export async function loadGalleryViewerById(
  deps: Pick<GalleryDeps, "db">,
  input: { communityId: string; userId: string | null },
): Promise<GalleryViewer | null> {
  const community = await deps.db.query.communities.findFirst({
    where: and(
      eq(communities.id, input.communityId),
      isNull(communities.deletedAt),
    ),
    columns: VIEWER_COMMUNITY_COLUMNS,
  });
  if (!community) return null;
  return viewerIn(deps, community, input.userId);
}

/**
 * Event states whose photos may be added. This is the event's own `status`
 * field, never Payload's `_status`: live events can be Payload drafts.
 */
export const LINKABLE_EVENT_STATUSES = [
  "published",
  "completed",
] as const satisfies readonly Event["status"][];

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
  if (!(LINKABLE_EVENT_STATUSES as readonly string[]).includes(event.status)) {
    return false;
  }
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
