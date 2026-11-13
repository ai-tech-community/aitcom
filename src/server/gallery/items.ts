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
import { releaseEmptyGalleryPost } from "./feed-post-link";
import { itemFileUrls, removeItemFiles } from "./item-files";
import { relationId } from "./relation-id";

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
  /**
   * A report hid it until a moderator reviews it. Only moderators and the
   * uploader can read a hidden item, so only they ever see `true`.
   */
  hidden: boolean;
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

/** Titles and slugs of the events items (or batches) link to, in one read. */
export async function loadEventRefs(
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
      items.map((item) => relationId(item.event)).filter((id) => id !== null),
    ),
  ]);
  const storage = deps.storage();
  return Promise.all(
    items.map(async (item) => {
      const uploader = uploaders.get(item.uploaderId);
      const eventId = relationId(item.event);
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
        batchId: relationId(item.batch)!,
        hidden: item.hiddenAt != null,
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

/** The item among those `where` matches, or null. */
async function findItemIn(
  deps: Pick<GalleryDeps, "payload">,
  where: Where,
  itemId: number,
): Promise<GalleryItem | null> {
  const { docs } = await deps.payload.find({
    collection: "gallery-items",
    where: { and: [where, { id: { equals: itemId } }] },
    limit: 1,
    pagination: false,
    depth: 0,
  });
  return docs[0] ?? null;
}

/** The item among those `where` matches; NOT_FOUND otherwise. */
async function requireItemIn(
  deps: Pick<GalleryDeps, "payload">,
  where: Where,
  itemId: number,
): Promise<GalleryItem> {
  const item = await findItemIn(deps, where, itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND" });
  return item;
}

/** The item, when this viewer may read it; null otherwise. */
export function findReadableItem(
  deps: Pick<GalleryDeps, "payload">,
  viewer: GalleryViewer,
  itemId: number,
): Promise<GalleryItem | null> {
  return findItemIn(deps, galleryReadableWhere(viewer), itemId);
}

/** The item, when this viewer may read it; an unreadable one is NOT_FOUND. */
export function requireReadableItem(
  deps: Pick<GalleryDeps, "payload">,
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
export function writeFailed(
  deps: Pick<GalleryDeps, "log">,
  message: string,
  itemId: number,
  errors: unknown[],
): TRPCError {
  (deps.log ?? console.error)(message, { itemId, errors });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
}

/** What a list or a count of the wall is narrowed to. */
type GalleryItemFilters = {
  /** An event's items, or `"none"` for items that link to no event. */
  eventId?: number | "none";
  /** One upload's items: a feed post's collage and its lightbox. */
  batchId?: number;
  topicSlug?: string;
  mediaType?: GalleryMediaType;
};

/** The viewer's readable items, narrowed by the filters given. */
function readableItemsWhere(
  viewer: GalleryViewer,
  filters: GalleryItemFilters,
): Where[] {
  const where: Where[] = [galleryReadableWhere(viewer)];
  if (filters.eventId === "none") where.push({ event: { exists: false } });
  else if (filters.eventId !== undefined) {
    where.push({ event: { equals: filters.eventId } });
  }
  if (filters.batchId !== undefined) {
    where.push({ batch: { equals: filters.batchId } });
  }
  if (filters.topicSlug !== undefined) {
    where.push({ topicSlug: { equals: filters.topicSlug } });
  }
  if (filters.mediaType !== undefined) {
    where.push({ mediaType: { equals: filters.mediaType } });
  }
  return where;
}

/**
 * A page of the wall, newest first. `cursor` is the last id of the previous
 * page; `eventId: "none"` keeps items that link to no event.
 */
export async function listItems(
  deps: GalleryDeps,
  input: GalleryItemFilters & {
    viewer: GalleryViewer;
    cursor?: number;
    limit?: number;
  },
): Promise<{ items: GalleryItemView[]; nextCursor: number | null }> {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? GALLERY_PAGE_SIZE)),
    GALLERY_PAGE_SIZE,
  );
  const filters = readableItemsWhere(input.viewer, input);
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

/** How many items of an event or a batch this viewer may see. */
export async function countItems(
  deps: GalleryDeps,
  input: Pick<GalleryItemFilters, "eventId" | "batchId"> & {
    viewer: GalleryViewer;
  },
): Promise<number> {
  const { totalDocs } = await deps.payload.count({
    collection: "gallery-items",
    where: { and: readableItemsWhere(input.viewer, input) },
  });
  return totalDocs;
}

/** What a feed post shows of its batch to one viewer. */
export type GalleryBatchPreview = {
  /** The batch's newest readable items, newest first. */
  items: GalleryItemView[];
  /** How many of the batch's items this viewer may see. */
  total: number;
};

/**
 * For each batch, its first `perBatch` readable items and how many readable
 * items it has — for any number of batches of the viewer's community in two
 * reads: the ids and batches of every readable item (which give the counts
 * and the picks), then the full rows of the picked ones only. Batches the
 * viewer may see nothing of are left out.
 */
export async function previewBatches(
  deps: GalleryDeps,
  input: {
    viewer: GalleryViewer;
    batchIds: readonly number[];
    perBatch: number;
  },
): Promise<Map<number, GalleryBatchPreview>> {
  const previews = new Map<number, GalleryBatchPreview>();
  const batchIds = [...new Set(input.batchIds)];
  if (batchIds.length === 0) return previews;
  const readable = galleryReadableWhere(input.viewer);
  // A batch holds at most GALLERY_MAX_FILES_PER_BATCH items, so this scan is
  // bounded by the posts on the page.
  const { docs: rows } = await deps.payload.find({
    collection: "gallery-items",
    where: { and: [readable, { batch: { in: batchIds } }] },
    select: { batch: true },
    sort: "-id",
    pagination: false,
    depth: 0,
  });
  const totals = new Map<number, number>();
  const picked: number[] = [];
  for (const row of rows) {
    const batchId = relationId(row.batch)!;
    const seen = totals.get(batchId) ?? 0;
    if (seen < input.perBatch) picked.push(row.id);
    totals.set(batchId, seen + 1);
  }
  if (picked.length === 0) return previews;
  // Read again under the same rule: an item hidden or deleted in between
  // stays out, and out of its batch's total, so "+N" never over-counts.
  const { docs } = await deps.payload.find({
    collection: "gallery-items",
    where: { and: [readable, { id: { in: picked } }] },
    sort: "-id",
    pagination: false,
    depth: 0,
  });
  for (const view of await toViews(deps, input.viewer, docs)) {
    const preview = previews.get(view.batchId);
    if (preview) preview.items.push(view);
    else previews.set(view.batchId, { items: [view], total: 0 });
  }
  for (const [batchId, preview] of previews) {
    const total = totals.get(batchId)!;
    const gone = Math.min(total, input.perBatch) - preview.items.length;
    preview.total = total - gone;
  }
  return previews;
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
    .map((value) => relationId(value.event))
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
    hasUnlinked: byEvent.values.some(
      (value) => relationId(value.event) === null,
    ),
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
  if (input.eventId !== undefined && input.eventId !== relationId(item.event)) {
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
 * The uploader or a moderator deletes an item (`removeItem`). The uploader
 * may always delete their own item — hidden, members-only, or after leaving
 * the community or letting a paid membership lapse. Anyone else is refused
 * NOT_ALLOWED; an item they cannot see is NOT_FOUND.
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
  await removeItem(deps, item, "deleteItem");
}

/**
 * The one way an item leaves the gallery, whoever asked (a delete, a
 * moderator removing a reported item): the row goes first — its reports go
 * with it (ON DELETE CASCADE) — then its two files, best effort (failures
 * are logged; the unused-files sweep is the net). The item's batch stays,
 * even when it is now empty: the cleanup owns batches. The batch's feed
 * post goes when it has no ready item and no words left
 * (`releaseEmptyGalleryPost`).
 * A row Payload could not delete is a server error, and its files are kept.
 * The caller decides who may; `context` names it in the logs.
 */
export async function removeItem(
  deps: GalleryDeps,
  item: GalleryItem,
  context: string,
): Promise<void> {
  const { docs, errors } = await deps.payload.delete({
    collection: "gallery-items",
    where: { id: { equals: item.id } },
    depth: 0,
  });
  if (errors.length > 0) {
    throw writeFailed(
      deps,
      `[gallery.${context}] deleting an item failed`,
      item.id,
      errors,
    );
  }
  // A concurrent delete removed the row first; it removes the files too.
  if (docs.length === 0) return;
  await removeItemFiles(deps, item, context);
  const batchId = relationId(item.batch)!;
  // The item is gone either way: a post left showing nothing is logged.
  try {
    await releaseEmptyGalleryPost(deps, batchId);
  } catch (error) {
    (deps.log ?? console.error)(
      `[gallery.${context}] removing the batch's empty feed post failed`,
      { itemId: item.id, batchId, error },
    );
  }
}
