import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import type { Where } from "payload";

import {
  GALLERY_ALT_MAX,
  GALLERY_CAPTION_MAX,
  GALLERY_PAGE_SIZE,
  type GalleryMediaType,
} from "@/lib/gallery-rules";
import {
  eventDayParts,
  eventStartInstant,
  pastEventsQueryCeiling,
} from "@/lib/event-time";
import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import { clampText } from "@/lib/text-utils";
import type { GalleryItem } from "@/payload-types";
import { user } from "@/server/db/schema";

import {
  assertCommunityTopic,
  assertLinkableEvent,
  isLinkableEvent,
  LINKABLE_EVENT_STATUSES,
  publicItemsReachOutsiders,
  type GalleryCommunity,
  type GalleryViewer,
} from "./access";
import { nowOf, type GalleryDeps } from "./deps";
import { galleryError } from "./errors";
import { itemFileUrls, removeItemFiles } from "./item-files";

/**
 * Reading, editing and deleting gallery items (spec 2026-11-13, Gallery
 * tab). Every read goes through `galleryReadableWhere`, so a viewer's query
 * only ever matches rows they may see, and links (signed ones included) are
 * made only for those rows.
 */

/** One item as the wall and the lightbox show it. Never storage keys. */
export type GalleryItemView = {
  id: number;
  mediaType: GalleryMediaType;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  caption: string | null;
  alt: string | null;
  event: { id: number; title: string; slug: string } | null;
  topicSlug: string | null;
  visibility: "community" | "public";
  magazineConsent: boolean;
  /**
   * Who added it. Null once they deleted their account (or their account
   * record is gone): the UI says "Deleted member", with no photo.
   */
  uploader: { id: string; name: string; image: string | null } | null;
  createdAt: string;
  isOwn: boolean;
  batchId: number;
};

export type GalleryFacets = {
  /**
   * Events that readable items link to, newest first. `day` is the event's
   * own calendar day (`YYYY-MM-DD`, event-local), for the UI to format in the
   * reader's language and tell same-named events apart.
   */
  events: { id: number; title: string; day: string }[];
  /** Topic slugs that readable items carry, alphabetical. */
  topics: string[];
  /** Whether any readable item links to no event. */
  hasUnlinked: boolean;
};

export type LinkableEvent = { id: number; title: string; startsAt: string };

/** What a member may choose for their uploads in this community. */
export type GalleryUploadChoices = {
  /** Events uploads may link to, newest first. */
  events: LinkableEvent[];
  /**
   * Whether "Everyone" reaches anyone beyond the members. False in a
   * members-only or paid community: the dialog then offers no choice.
   */
  publicReachesOutsiders: boolean;
};

/** What an uploader whose account has no name is called. */
const UNNAMED_UPLOADER = "Member";

/**
 * The items this viewer may see: ready items of the viewer's community, and
 * of those —
 * - members: every item that is not hidden, plus their own hidden ones;
 *   moderators: every item, hidden or not;
 * - anyone else, when outsiders may read the community: public items that
 *   are not hidden;
 * - anyone else: nothing.
 */
export function galleryReadableWhere(viewer: GalleryViewer): Where {
  const base: Where[] = [
    { communityId: { equals: viewer.communityId } },
    { status: { equals: "ready" } },
  ];
  const notHidden: Where = { hiddenAt: { exists: false } };
  if (viewer.isModerator) return { and: base };
  if (viewer.isMember) {
    const own: Where[] = viewer.userId
      ? [{ uploaderId: { equals: viewer.userId } }]
      : [];
    return { and: [...base, { or: [notHidden, ...own] }] };
  }
  if (viewer.canSeePublic) {
    return {
      and: [...base, { visibility: { equals: "public" } }, notHidden],
    };
  }
  // Every row has an id, so this matches nothing.
  return { and: [...base, { id: { exists: false } }] };
}

function idOf(relation: number | { id: number } | null | undefined) {
  if (relation === null || relation === undefined) return null;
  return typeof relation === "number" ? relation : relation.id;
}

/**
 * Uploader names and photos for a set of user ids, in one query. The id a
 * deleted account leaves behind is no user, so it is not looked up.
 */
async function loadUploaders(
  deps: Pick<GalleryDeps, "db">,
  userIds: readonly string[],
): Promise<Map<string, { name: string | null; image: string | null }>> {
  const ids = [...new Set(userIds)].filter((id) => id !== DELETED_AUTHOR_ID);
  if (ids.length === 0) return new Map();
  const rows = await deps.db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(inArray(user.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Titles and slugs of the events items link to, in one read. */
async function loadEventRefs(
  deps: Pick<GalleryDeps, "payload">,
  eventIds: readonly number[],
): Promise<Map<number, { id: number; title: string; slug: string }>> {
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) return new Map();
  const { docs } = await deps.payload.find({
    collection: "events",
    where: { id: { in: ids } },
    select: { title: true, slug: true },
    pagination: false,
    depth: 0,
    draft: false,
  });
  return new Map(
    docs.map((doc) => [
      doc.id,
      { id: doc.id, title: doc.title, slug: doc.slug },
    ]),
  );
}

/**
 * Views for items the viewer was already allowed to read. Uploaders and
 * events are loaded once for the whole list; storage is reached only when
 * there is something to link to.
 */
async function toViews(
  deps: GalleryDeps,
  viewer: GalleryViewer,
  items: readonly GalleryItem[],
): Promise<GalleryItemView[]> {
  if (items.length === 0) return [];
  const [uploaders, events] = await Promise.all([
    loadUploaders(
      deps,
      items.map((item) => item.uploaderId),
    ),
    loadEventRefs(
      deps,
      items.map((item) => idOf(item.event)).filter((id) => id !== null),
    ),
  ]);
  const storage = deps.storage();
  return Promise.all(
    items.map(async (item) => {
      const uploader = uploaders.get(item.uploaderId);
      const eventId = idOf(item.event);
      return {
        id: item.id,
        mediaType: item.mediaType,
        ...(await itemFileUrls(storage, item)),
        width: item.width,
        height: item.height,
        durationSeconds: item.durationSeconds ?? null,
        caption: item.caption ?? null,
        alt: item.alt ?? null,
        event: eventId === null ? null : (events.get(eventId) ?? null),
        topicSlug: item.topicSlug ?? null,
        visibility: item.visibility,
        magazineConsent: item.magazineConsent ?? false,
        uploader: uploader
          ? {
              id: item.uploaderId,
              name: uploader.name ?? UNNAMED_UPLOADER,
              image: uploader.image,
            }
          : null,
        createdAt: item.createdAt,
        isOwn: viewer.userId !== null && item.uploaderId === viewer.userId,
        batchId: idOf(item.batch)!,
      };
    }),
  );
}

/**
 * The items a viewer may ask to delete: those they may read, plus their own
 * ready items in the community whatever their visibility or hidden state and
 * whether or not they are still a member — an uploader can always take
 * their own photos down.
 */
function galleryDeletableWhere(viewer: GalleryViewer): Where {
  const readable = galleryReadableWhere(viewer);
  if (!viewer.userId) return readable;
  return {
    or: [
      readable,
      {
        and: [
          { communityId: { equals: viewer.communityId } },
          { status: { equals: "ready" } },
          { uploaderId: { equals: viewer.userId } },
        ],
      },
    ],
  };
}

/** The item among those `where` matches; NOT_FOUND otherwise. */
async function requireItemIn(
  deps: GalleryDeps,
  where: Where,
  itemId: number,
): Promise<GalleryItem> {
  const { docs } = await deps.payload.find({
    collection: "gallery-items",
    where: { and: [where, { id: { equals: itemId } }] },
    limit: 1,
    pagination: false,
    depth: 0,
  });
  const item = docs[0];
  if (!item) throw new TRPCError({ code: "NOT_FOUND" });
  return item;
}

/** The item, when this viewer may read it; an unreadable one is NOT_FOUND. */
function requireReadableItem(
  deps: GalleryDeps,
  viewer: GalleryViewer,
  itemId: number,
): Promise<GalleryItem> {
  return requireItemIn(deps, galleryReadableWhere(viewer), itemId);
}

/**
 * A write Payload caught and did not apply (bulk operations report per-row
 * failures instead of throwing): logged, and answered as a server error so
 * the member is never told it worked.
 */
function writeFailed(
  deps: Pick<GalleryDeps, "log">,
  message: string,
  itemId: number,
  errors: unknown[],
): TRPCError {
  (deps.log ?? console.error)(message, { itemId, errors });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
}

/**
 * A page of the wall, newest first. `cursor` is the last id of the previous
 * page; `eventId: "none"` keeps items that link to no event.
 */
export async function listItems(
  deps: GalleryDeps,
  input: {
    viewer: GalleryViewer;
    eventId?: number | "none";
    topicSlug?: string;
    mediaType?: GalleryMediaType;
    cursor?: number;
    limit?: number;
  },
): Promise<{ items: GalleryItemView[]; nextCursor: number | null }> {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? GALLERY_PAGE_SIZE)),
    GALLERY_PAGE_SIZE,
  );
  const filters: Where[] = [galleryReadableWhere(input.viewer)];
  if (input.eventId === "none") filters.push({ event: { exists: false } });
  else if (input.eventId !== undefined) {
    filters.push({ event: { equals: input.eventId } });
  }
  if (input.topicSlug !== undefined) {
    filters.push({ topicSlug: { equals: input.topicSlug } });
  }
  if (input.mediaType !== undefined) {
    filters.push({ mediaType: { equals: input.mediaType } });
  }
  if (input.cursor !== undefined) {
    filters.push({ id: { less_than: input.cursor } });
  }
  // One more than a page tells whether another page follows.
  const { docs } = await deps.payload.find({
    collection: "gallery-items",
    where: { and: filters },
    sort: "-id",
    limit: limit + 1,
    pagination: false,
    depth: 0,
  });
  const page = docs.slice(0, limit);
  return {
    items: await toViews(deps, input.viewer, page),
    nextCursor: docs.length > limit ? page[page.length - 1]!.id : null,
  };
}

/** The wall's filter choices: only those that readable items have. */
export async function listFacets(
  deps: GalleryDeps,
  input: { viewer: GalleryViewer },
): Promise<GalleryFacets> {
  const where = galleryReadableWhere(input.viewer);
  const [byEvent, byTopic] = await Promise.all([
    deps.payload.findDistinct({
      collection: "gallery-items",
      field: "event",
      where,
      depth: 0,
    }),
    deps.payload.findDistinct({
      collection: "gallery-items",
      field: "topicSlug",
      where,
    }),
  ]);
  const eventIds = byEvent.values
    .map((value) => idOf(value.event))
    .filter((id) => id !== null);
  const topics = byTopic.values
    .map((value) => value.topicSlug)
    .filter((slug): slug is string => typeof slug === "string" && slug !== "")
    .sort((a, b) => a.localeCompare(b));

  let events: GalleryFacets["events"] = [];
  if (eventIds.length > 0) {
    const { docs } = await deps.payload.find({
      collection: "events",
      where: { id: { in: eventIds } },
      select: { title: true, date: true },
      sort: "-date",
      pagination: false,
      depth: 0,
      draft: false,
    });
    events = docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      day: eventDayParts(doc.date, "en")?.iso ?? doc.date,
    }));
  }
  return {
    events,
    topics,
    hasUnlinked: byEvent.values.some((value) => idOf(value.event) === null),
  };
}

/** One item; NOT_FOUND when it does not exist or the viewer may not see it. */
export async function getItem(
  deps: GalleryDeps,
  input: { viewer: GalleryViewer; itemId: number },
): Promise<GalleryItemView> {
  const item = await requireReadableItem(deps, input.viewer, input.itemId);
  const [view] = await toViews(deps, input.viewer, [item]);
  return view!;
}

/**
 * The upload dialog's choices (members only): the events uploads may link
 * to, and whether "Everyone" reaches anyone beyond the members.
 */
export async function uploadChoices(
  deps: GalleryDeps,
  input: { viewer: GalleryViewer & { community: GalleryCommunity } },
): Promise<GalleryUploadChoices> {
  const { viewer } = input;
  if (!viewer.isMember) throw galleryError("NOT_A_MEMBER");
  const [events, publicReachesOutsiders] = await Promise.all([
    linkableEvents(deps, viewer),
    publicItemsReachOutsiders(deps, viewer.community),
  ]);
  return { events, publicReachesOutsiders };
}

/**
 * Events a member may link uploads to, newest first: the community's own
 * events that have started and are published or completed. The query only
 * narrows the candidates; `isLinkableEvent`, the rule uploads and edits are
 * checked against, decides.
 */
async function linkableEvents(
  deps: GalleryDeps,
  viewer: GalleryViewer,
): Promise<LinkableEvent[]> {
  const now = nowOf(deps);
  const { docs } = await deps.payload.find({
    collection: "events",
    where: {
      and: [
        { communityId: { equals: viewer.communityId } },
        { status: { in: [...LINKABLE_EVENT_STATUSES] } },
        // `date` is the event-local day: compare loosely, then exactly below.
        { date: { less_than_equal: pastEventsQueryCeiling(now) } },
      ],
    },
    select: {
      title: true,
      communityId: true,
      status: true,
      date: true,
      startTime: true,
      timezone: true,
    },
    pagination: false,
    depth: 0,
    draft: false,
  });
  return docs
    .filter((event) => isLinkableEvent(event, viewer.communityId, now))
    .map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: eventStartInstant(event)!.toISOString(),
    }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** Trimmed and cut to its limit; empty means none. */
function textOrNull(value: string, max: number): string | null {
  return clampText(value.trim(), max) || null;
}

/**
 * The uploader edits an item's details. Only the uploader, while still a
 * member, may do so (NOT_ALLOWED); an item the viewer cannot see is
 * NOT_FOUND. A new event or category is checked like at upload; one the item
 * already has is kept as it is. Giving magazine permission stamps when (a
 * repeated yes keeps the first time); taking it back clears the stamp.
 * Visibility never changes.
 */
export async function updateItem(
  deps: GalleryDeps,
  input: {
    viewer: GalleryViewer;
    itemId: number;
    caption?: string;
    alt?: string;
    topicSlug?: string | null;
    eventId?: number | null;
    magazineConsent?: boolean;
  },
): Promise<GalleryItemView> {
  const { viewer } = input;
  const item = await requireReadableItem(deps, viewer, input.itemId);
  if (!viewer.isMember || item.uploaderId !== viewer.userId) {
    throw galleryError("NOT_ALLOWED");
  }
  const now = nowOf(deps);
  const data: Partial<GalleryItem> = {};
  if (input.caption !== undefined) {
    data.caption = textOrNull(input.caption, GALLERY_CAPTION_MAX);
  }
  if (input.alt !== undefined) {
    data.alt = textOrNull(input.alt, GALLERY_ALT_MAX);
  }
  if (input.topicSlug !== undefined && input.topicSlug !== item.topicSlug) {
    if (input.topicSlug !== null) {
      await assertCommunityTopic(
        deps.payload,
        item.communityId,
        input.topicSlug,
      );
    }
    data.topicSlug = input.topicSlug;
  }
  if (input.eventId !== undefined && input.eventId !== idOf(item.event)) {
    if (input.eventId !== null) {
      await assertLinkableEvent(
        deps.payload,
        item.communityId,
        input.eventId,
        now,
      );
    }
    data.event = input.eventId;
  }
  if (input.magazineConsent === true && !item.magazineConsent) {
    data.magazineConsent = true;
    data.magazineConsentAt = now.toISOString();
  } else if (input.magazineConsent === false) {
    data.magazineConsent = false;
    data.magazineConsentAt = null;
  }
  // By `where`, so an item deleted meanwhile is "no row", not a throw.
  const { docs, errors } = await deps.payload.update({
    collection: "gallery-items",
    where: { id: { equals: item.id } },
    data,
    depth: 0,
  });
  if (errors.length > 0) {
    throw writeFailed(
      deps,
      "[gallery.updateItem] saving an item failed",
      item.id,
      errors,
    );
  }
  const updated = docs[0];
  if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
  const [view] = await toViews(deps, viewer, [updated]);
  return view!;
}

/**
 * The uploader or a moderator deletes an item: the row goes first, then its
 * two files, best effort (failures are logged; the unused-files sweep is the
 * net). The uploader may always delete their own item — hidden, members-only,
 * or after leaving the community or letting a paid membership lapse. The
 * item's batch stays, even when it is now empty: the cleanup owns batches.
 * Anyone else is refused NOT_ALLOWED; an item they cannot see is NOT_FOUND.
 * A row Payload could not delete is a server error, and its files are kept.
 */
export async function deleteItem(
  deps: GalleryDeps,
  input: { viewer: GalleryViewer; itemId: number },
): Promise<void> {
  const { viewer } = input;
  const item = await requireItemIn(
    deps,
    galleryDeletableWhere(viewer),
    input.itemId,
  );
  const isOwn = viewer.userId !== null && item.uploaderId === viewer.userId;
  if (!isOwn && !viewer.isModerator) throw galleryError("NOT_ALLOWED");
  const { docs, errors } = await deps.payload.delete({
    collection: "gallery-items",
    where: { id: { equals: item.id } },
    depth: 0,
  });
  if (errors.length > 0) {
    throw writeFailed(
      deps,
      "[gallery.deleteItem] deleting an item failed",
      item.id,
      errors,
    );
  }
  // A concurrent delete removed the row first; it removes the files too.
  if (docs.length === 0) return;
  await removeItemFiles(deps, item, "deleteItem");
}
