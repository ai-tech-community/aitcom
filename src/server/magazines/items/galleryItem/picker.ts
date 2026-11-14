import type { Where } from "payload";

import { galleryItemPath } from "@/lib/gallery-rules";
import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";
import type { GalleryItem } from "@/payload-types";
import { loadGalleryViewerById } from "@/server/gallery/access";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type {
  ItemPickerSource,
  PickerContext,
  PickerSourceCandidate,
} from "../types";
import { loadGalleryItemCredits, type GalleryItemCredit } from "./credits";
import { featurableByWhere } from "./featurable";
import { galleryItemThumbnailUrls } from "./files";

/** The ids of the community's events whose title matches the search. */
async function matchingEventIds(
  query: string,
  ctx: PickerContext,
): Promise<number[]> {
  const { docs } = await ctx.deps.payload.find({
    collection: "events",
    where: {
      and: [
        { communityId: { equals: ctx.community.id } },
        { title: { like: query } },
      ],
    },
    draft: false,
    depth: 0,
    pagination: false,
  });
  return docs.map((event) => Number(event.id));
}

/** Items whose caption, alt text or event title match the search. */
async function queryWhere(query: string, ctx: PickerContext): Promise<Where> {
  const eventIds = await matchingEventIds(query, ctx);
  return {
    or: [
      { caption: { like: query } },
      { alt: { like: query } },
      ...(eventIds.length ? [{ event: { in: eventIds } }] : []),
    ],
  };
}

/**
 * What the picker and the suggester show for an item, without file links:
 * only the picker adds a thumbnail, so nothing a draft keeps holds a URL.
 */
export function galleryItemCandidate(
  item: GalleryItem,
  credit: GalleryItemCredit,
  communitySlug: string,
): PickerSourceCandidate<InputOf<"galleryItem">> {
  const facts: CandidateFact[] = [
    ...(credit.event
      ? [{ type: "event" as const, title: credit.event.title }]
      : []),
    { type: "date", label: "published", at: item.createdAt },
    { type: "mediaType", mediaType: item.mediaType },
  ];
  return {
    input: { kind: "galleryItem", galleryItemId: item.id },
    title: credit.title,
    facts,
    openHref: galleryItemPath(communitySlug, item.id),
  };
}

/**
 * Gallery items this editor may newly feature (`featurableByWhere`: the
 * rule `acceptNew` and the suggester use too), newest first. Thumbnails are
 * linked only for the items found, so only after the editor's access was
 * checked.
 */
export const galleryItemPicker: ItemPickerSource<InputOf<"galleryItem">> = {
  async search(query, ctx, exclude) {
    const editor = await loadGalleryViewerById(ctx.deps, {
      communityId: ctx.community.id,
      userId: ctx.viewerId,
    });
    if (!editor) return [];
    const excludedIds = excludedNumericReferenceIds("galleryItem", exclude);
    const and: Where[] = [
      featurableByWhere(editor),
      ...(excludedIds.length ? [{ id: { not_in: excludedIds } }] : []),
      ...(query ? [await queryWhere(query, ctx)] : []),
    ];
    const { docs } = await ctx.deps.payload.find({
      collection: "gallery-items",
      where: { and },
      sort: "-createdAt",
      depth: 0,
      limit: PICKER_LIMIT,
    });
    const [credits, thumbnails] = await Promise.all([
      loadGalleryItemCredits(ctx.deps, docs, ctx.locale),
      galleryItemThumbnailUrls(ctx.deps.storage, docs),
    ]);
    return docs.map((item) => ({
      ...galleryItemCandidate(item, credits.get(item.id)!, ctx.community.slug),
      thumbnailUrl: thumbnails.get(item.id)!,
    }));
  },
};
