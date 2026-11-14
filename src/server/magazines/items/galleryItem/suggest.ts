import type { Where } from "payload";

import type { GalleryItem } from "@/payload-types";
import {
  loadGalleryViewerById,
  type GalleryViewer,
} from "@/server/gallery/access";
import { loadEventRefs } from "@/server/gallery/items";
import { relationId } from "@/server/gallery/relation-id";

import { endedCommunityEvents } from "../event/suggest";
import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource, SuggestContext } from "../types";
import { loadGalleryItemCredits } from "./credits";
import { featurableByWhere } from "./featurable";
import { galleryItemCandidate } from "./picker";

type Ranked = Pick<GalleryItem, "id" | "createdAt">;

/** Newest first, then the lower id. */
function newerFirst(a: Ranked, b: Ranked): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id - b.id;
}

type Highlight = {
  eventId: number;
  eventTitle: string;
  count: number;
  itemId: number;
};

/** Full rows of the items this editor may feature, by id, among `where`. */
async function featurableRows(
  ctx: SuggestContext,
  editor: GalleryViewer,
  where: Where,
): Promise<Map<number, GalleryItem>> {
  const { docs } = await ctx.deps.payload.find({
    collection: "gallery-items",
    where: { and: [featurableByWhere(editor), where] },
    depth: 0,
    pagination: false,
  });
  return new Map(docs.map((item) => [item.id, item]));
}

/**
 * One highlight per community event that ended in the window (spec
 * 2026-11-13, Magazine, settled 14 Nov). Events rank by how many items this
 * editor may feature (`featurableByWhere`, the rule the picker and
 * `acceptNew` use), then later end, then id; each offers its newest such
 * item not excluded, then the lower id. Excluded items still count for
 * their event: the count says how much the event shared.
 *
 * Candidates and reasons carry no file links: a draft keeps only the item's
 * id and the reason, and the picker adds thumbnails from its own search.
 */
export const galleryItemSuggester: ItemSuggestionSource<
  InputOf<"galleryItem">
> = {
  async suggest(ctx, window, config) {
    if (config.limit <= 0) return [];
    const ended = await endedCommunityEvents(
      ctx.deps,
      ctx.community,
      window.since,
      new Date(Math.min(window.until.getTime(), ctx.now.getTime())),
    );
    if (ended.length === 0) return [];
    const editor = await loadGalleryViewerById(ctx.deps, {
      communityId: ctx.community.id,
      userId: ctx.viewerId,
    });
    if (!editor) return [];
    const { docs: featurable } = await ctx.deps.payload.find({
      collection: "gallery-items",
      where: {
        and: [
          featurableByWhere(editor),
          { event: { in: ended.map((event) => event.id) } },
        ],
      },
      select: { event: true, createdAt: true },
      depth: 0,
      pagination: false,
    });

    const excluded = new Set(
      excludedNumericReferenceIds("galleryItem", config.exclude),
    );
    const counts = new Map<number, number>();
    const newest = new Map<number, Ranked>();
    for (const doc of featurable) {
      const eventId = relationId(doc.event);
      if (eventId === null) continue;
      counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
      const item = { id: doc.id, createdAt: doc.createdAt };
      const best = newest.get(eventId);
      if (!excluded.has(item.id) && (!best || newerFirst(item, best) < 0))
        newest.set(eventId, item);
    }
    if (newest.size === 0) return [];
    const endsAt = new Map(
      ended.map((event) => [event.id, event.endsAt.getTime()]),
    );
    // Events gone since they were read are dropped before the limit applies.
    const events = await loadEventRefs(ctx.deps, [...newest.keys()]);
    const highlights: Highlight[] = [...newest]
      .filter(([eventId]) => events.has(eventId))
      .map(([eventId, item]) => ({
        eventTitle: events.get(eventId)!.title,
        eventId,
        count: counts.get(eventId)!,
        itemId: item.id,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          endsAt.get(b.eventId)! - endsAt.get(a.eventId)! ||
          a.eventId - b.eventId,
      )
      .slice(0, config.limit);
    if (highlights.length === 0) return [];

    // Full rows only for the chosen items, still under the shared rule.
    const items = await featurableRows(ctx, editor, {
      id: { in: highlights.map((highlight) => highlight.itemId) },
    });
    // An item that stopped being featurable between the two reads: its event
    // offers its next item instead (rare; one more read, of those events only).
    const orphaned = highlights.filter(({ itemId }) => !items.has(itemId));
    if (orphaned.length > 0) {
      const fallbacks = await featurableRows(ctx, editor, {
        event: { in: orphaned.map((highlight) => highlight.eventId) },
      });
      const next = new Map<number, GalleryItem>();
      for (const item of fallbacks.values()) {
        const eventId = relationId(item.event);
        if (eventId === null || excluded.has(item.id)) continue;
        const best = next.get(eventId);
        if (!best || newerFirst(item, best) < 0) next.set(eventId, item);
      }
      for (const highlight of orphaned) {
        const item = next.get(highlight.eventId);
        if (!item) continue;
        highlight.itemId = item.id;
        items.set(item.id, item);
      }
    }
    const credits = await loadGalleryItemCredits(
      ctx.deps,
      [...items.values()],
      ctx.locale,
    );
    return highlights.flatMap(({ itemId, eventTitle, count }) => {
      const item = items.get(itemId);
      if (!item) return [];
      return [
        {
          ...galleryItemCandidate(
            item,
            credits.get(itemId)!,
            ctx.community.slug,
          ),
          reason: { type: "galleryHighlight" as const, eventTitle, count },
        },
      ];
    });
  },
};
