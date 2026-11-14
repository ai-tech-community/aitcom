import { z } from "zod";

import { galleryItemPath } from "@/lib/gallery-rules";
import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { ItemProblem, UnavailableItem } from "@/lib/magazines/item-views";
import { galleryItemInputReference } from "@/lib/magazines/references";
import type { GalleryItem } from "@/payload-types";
import {
  loadGalleryViewerById,
  type GalleryViewer,
} from "@/server/gallery/access";
import { isGalleryReadable } from "@/server/gallery/items";

import { introInput, itemBaseInput, storedIntro } from "../base-input";
import { itemIdOf } from "../item-id";
import { validateReferences } from "../references";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";
import { loadGalleryItemCredits } from "./credits";
import { isFeaturableBy } from "./featurable";
import { galleryItemFileUrls } from "./files";

const galleryItemInput = z.object({
  kind: z.literal("galleryItem"),
  ...itemBaseInput,
  galleryItemId: z.number().int().positive(),
});
type GalleryItemInput = z.infer<typeof galleryItemInput>;
type GalleryItemStored = StoredItem<"galleryItem">;

/** Why `validate` refuses an image on a gallery item: the item is the picture. */
const GALLERY_ITEM_IMAGE_REFUSAL =
  "gallery items can't carry their own image";

const referenceOf = galleryItemInputReference;

/** The issue's gallery items by id, in one query. */
async function loadGalleryItems(
  items: readonly GalleryItemStored[],
  ctx: ItemContext,
): Promise<Map<number, GalleryItem>> {
  const { docs } = await ctx.payload.find({
    collection: "gallery-items",
    where: { id: { in: items.map((item) => Number(item.galleryItemId)) } },
    depth: 0,
    pagination: false,
  });
  return new Map(docs.map((doc) => [Number(doc.id), doc]));
}

/**
 * The gallery viewer of this context's person in the magazine's community:
 * the reader, or the editor. One read per issue; null once the community is
 * gone, which reads nothing.
 */
function loadViewer(ctx: ItemContext): Promise<GalleryViewer | null> {
  return loadGalleryViewerById(
    { db: ctx.db },
    { communityId: ctx.community.id, userId: ctx.reader.viewerId },
  );
}

/**
 * The item when this viewer may see it in an issue, else why not. A hidden
 * or withdrawn item is unavailable to everyone, moderators included, before
 * the gallery's read rule is asked.
 */
function showable(
  item: GalleryItem | undefined,
  viewer: GalleryViewer | null,
): { item: GalleryItem } | { reason: UnavailableItem["reason"] } {
  if (!item) return { reason: "missing" };
  if (item.status !== "ready") return { reason: "not_ready" };
  if (item.hiddenAt != null || item.magazineConsent !== true) {
    return { reason: "withdrawn" };
  }
  if (!viewer || !isGalleryReadable(viewer, item)) {
    return { reason: "no_access" };
  }
  return { item };
}

/** Editors see which items only members can see; readers never need to. */
function membersOnlyFor(access: IssueReaderAccess, item: GalleryItem): boolean {
  switch (access) {
    case "editor":
      return item.visibility === "community";
    case "teaser":
    case "full":
      return false;
  }
}

function imageProblems(
  items: readonly { index: number; stored: GalleryItemStored }[],
): ItemProblem[] {
  return items
    .filter(({ stored }) => stored.image != null)
    .map(({ index }) => ({
      itemIndex: index,
      code: "ITEM_INVALID",
      detail: GALLERY_ITEM_IMAGE_REFUSAL,
    }));
}

/**
 * A community gallery photo or video in an issue (spec 2026-11-13,
 * Magazine). Live reference (ADR-0044): every load reads the item again and
 * asks the gallery's own read rule for this reader, so a public issue never
 * widens who sees a members-only item, and a withdrawn or hidden item
 * disappears from every issue it was placed in. File links are made only
 * after that check and never stored.
 */
export const galleryItemItemKind: IssueItemKind<
  "galleryItem",
  GalleryItemInput,
  GalleryItemStored
> = {
  kind: "galleryItem",
  input: galleryItemInput,
  toStored: (input) => ({
    intro: storedIntro(input.intro),
    galleryItemId: input.galleryItemId,
  }),
  toInput: (stored) => ({
    kind: "galleryItem",
    ...(stored.id ? { id: stored.id } : {}),
    galleryItemId: Number(stored.galleryItemId),
    ...introInput(stored.intro),
  }),
  referenceOf,
  async validate(items, ctx) {
    const withImage = imageProblems(items);
    const refusedImage = new Set(withImage.map((p) => p.itemIndex));
    const fresh = items.filter(
      ({ index, isNew }) => isNew && !refusedImage.has(index),
    );
    const [galleryItems, editor] = fresh.length
      ? await Promise.all([
          loadGalleryItems(
            fresh.map(({ stored }) => stored),
            ctx,
          ),
          loadViewer(ctx),
        ])
      : [new Map<number, GalleryItem>(), null];
    const references = validateReferences(items, {
      referenceOf,
      acceptNew: (stored) => {
        const item = galleryItems.get(Number(stored.galleryItemId));
        return !!item && !!editor && isFeaturableBy(item, editor);
      },
    }).filter((problem) => !refusedImage.has(problem.itemIndex));
    return [...withImage, ...references].sort(
      (a, b) => a.itemIndex - b.itemIndex,
    );
  },
  async load(items, ctx) {
    const views = new Map<
      string,
      ItemViewOf<"galleryItem"> | UnavailableItem
    >();
    if (items.length === 0) return views;
    const [galleryItems, viewer] = await Promise.all([
      loadGalleryItems(items, ctx),
      loadViewer(ctx),
    ]);

    const shown: { stored: GalleryItemStored; item: GalleryItem }[] = [];
    for (const stored of items) {
      const found = galleryItems.get(Number(stored.galleryItemId));
      const result = showable(found, viewer);
      if ("item" in result) shown.push({ stored, item: result.item });
      else {
        const itemId = itemIdOf(stored);
        views.set(itemId, {
          kind: "galleryItem",
          itemId,
          unavailable: true,
          reason: result.reason,
        });
      }
    }

    const visible = shown.map(({ item }) => item);
    const [credits, files] = await Promise.all([
      loadGalleryItemCredits(ctx, visible, ctx.locale),
      galleryItemFileUrls(ctx.storage, visible),
    ]);
    for (const { stored, item } of shown) {
      const itemId = itemIdOf(stored);
      const credit = credits.get(item.id)!;
      const links = files.get(item.id)!;
      views.set(itemId, {
        kind: "galleryItem",
        itemId,
        intro: stored.intro ?? null,
        membersOnly: membersOnlyFor(ctx.access, item),
        galleryItemId: item.id,
        mediaType: item.mediaType,
        url: links.url,
        thumbnailUrl: links.thumbnailUrl,
        width: item.width,
        height: item.height,
        durationSeconds: item.durationSeconds ?? null,
        caption: item.caption ?? null,
        alt: item.alt ?? null,
        label: credit.label,
        event: credit.event,
        uploader: { name: credit.uploaderName },
        href: galleryItemPath(ctx.community.slug, item.id),
      });
    }
    return views;
  },
  // Who may see an item was decided per reader in `load`.
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "teaser":
      case "full":
      case "editor":
        return true;
    }
  },
};
