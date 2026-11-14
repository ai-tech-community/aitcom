import type { GalleryItem } from "@/payload-types";
import { loadGalleryViewerById } from "@/server/gallery/access";
import { relationId } from "@/server/gallery/relation-id";

import { endedCommunityEvents } from "../event/suggest";
import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { loadGalleryItemCredits } from "./credits";
import { featurableByWhere } from "./featurable";
import { galleryItemCandidate } from "./picker";

/** Newest first, then the lower id. */
function newerFirst(a: GalleryItem, b: GalleryItem): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id - b.id;
}

type Highlight = { eventId: number; count: number; item: GalleryItem };

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
    const { docs } = await ctx.deps.payload.find({
      collection: "gallery-items",
      where: {
        and: [
          featurableByWhere(editor),
          { event: { in: ended.map((event) => event.id) } },
        ],
      },
      depth: 0,
      pagination: false,
    });

    const excluded = new Set(
      excludedNumericReferenceIds("galleryItem", config.exclude),
    );
    const counts = new Map<number, number>();
    const newest = new Map<number, GalleryItem>();
    for (const item of docs) {
      const eventId = relationId(item.event);
      if (eventId === null) continue;
      counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
      const best = newest.get(eventId);
      if (!excluded.has(item.id) && (!best || newerFirst(item, best) < 0))
        newest.set(eventId, item);
    }
    const endsAt = new Map(
      ended.map((event) => [event.id, event.endsAt.getTime()]),
    );
    const highlights: Highlight[] = [...newest]
      .map(([eventId, item]) => ({
        eventId,
        count: counts.get(eventId)!,
        item,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          endsAt.get(b.eventId)! - endsAt.get(a.eventId)! ||
          a.eventId - b.eventId,
      )
      .slice(0, config.limit);
    if (highlights.length === 0) return [];

    const credits = await loadGalleryItemCredits(
      ctx.deps,
      highlights.map((highlight) => highlight.item),
      ctx.locale,
    );
    return highlights.flatMap(({ item, count }) => {
      const credit = credits.get(item.id)!;
      // The event was read a moment ago; skip it if it is gone since.
      if (!credit.event) return [];
      return [
        {
          ...galleryItemCandidate(item, credit, ctx.community.slug),
          reason: {
            type: "galleryHighlight" as const,
            eventTitle: credit.event.title,
            count,
          },
        },
      ];
    });
  },
};
