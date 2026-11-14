import { GALLERY_EVENT_PREVIEW_SIZE } from "@/lib/gallery-rules";
import type { Event } from "@/payload-types";
import {
  offersMembership,
  viewerJoinAction,
} from "@/server/communities/invite-policy";

import { isLinkableEvent, loadGalleryViewerById } from "./access";
import { nowOf, type GalleryDeps } from "./deps";
import { countItems, listItems, type GalleryItemView } from "./items";

/**
 * Who is looking at an event's photos, as far as adding to them goes:
 * - a member uploads (a moderator may also remove anyone's item);
 * - a signed-in non-member is led to the community page when it offers
 *   them a way in (`canJoin`);
 * - a signed-out visitor is asked to sign in first, under the same rule:
 *   only when the community lets someone new in (`canJoin`; never for an
 *   invite-only one).
 */
export type EventGalleryViewer =
  | { kind: "member"; canModerate: boolean }
  | { kind: "outsider"; canJoin: boolean }
  | { kind: "guest"; canJoin: boolean };

/** The "Photos and videos" section of an event page (spec 2026-11-13, Events). */
export type EventGallerySection = {
  /** The community whose gallery the items are in. */
  communitySlug: string;
  eventId: number;
  /** The event's newest items this viewer may see, newest first. */
  items: GalleryItemView[];
  /** How many of the event's items this viewer may see. */
  total: number;
  viewer: EventGalleryViewer;
};

type SectionEvent = Pick<
  Event,
  "id" | "communityId" | "status" | "date" | "startTime" | "timezone"
>;

/**
 * An event's photos and videos for one viewer: only the items that viewer
 * may see, under the gallery's own read rule. `null` — no section — for a
 * Hub event (no community), for an event its community's photos may not
 * link to (`isLinkableEvent`: not published or completed, or not started
 * yet), for a deleted community, and when there is nothing to show to
 * someone who cannot add (anyone but a member). A member always gets the
 * section, empty or not, to add to it.
 */
export async function loadEventGallerySection(
  deps: GalleryDeps,
  input: { event: SectionEvent; userId: string | null },
): Promise<EventGallerySection | null> {
  const { event, userId } = input;
  const communityId = event.communityId;
  if (!communityId || !isLinkableEvent(event, communityId, nowOf(deps))) {
    return null;
  }
  const viewer = await loadGalleryViewerById(deps, { communityId, userId });
  if (!viewer) return null;

  const [{ items }, total] = await Promise.all([
    listItems(deps, {
      viewer,
      eventId: event.id,
      limit: GALLERY_EVENT_PREVIEW_SIZE,
    }),
    countItems(deps, { viewer, eventId: event.id }),
  ]);

  let who: EventGalleryViewer;
  if (viewer.isMember) {
    who = { kind: "member", canModerate: viewer.isModerator };
  } else if (items.length === 0) {
    return null;
  } else {
    // The rule every join control follows, from what the viewer load read;
    // a signed-out visitor has no membership row.
    const canJoin = offersMembership(
      viewerJoinAction({
        joinPolicy: viewer.community.joinPolicy,
        status: userId === null ? null : viewer.membershipStatus,
      }),
    );
    who = { kind: userId === null ? "guest" : "outsider", canJoin };
  }

  return {
    communitySlug: viewer.community.slug,
    eventId: event.id,
    items,
    // The list and the count are two reads: an item hidden in between is
    // still shown, so the count never says fewer than the tiles.
    total: Math.max(total, items.length),
    viewer: who,
  };
}
