import { GALLERY_COLLAGE_SIZE } from "@/lib/gallery-rules";
import type { FeedPost } from "@/payload-types";

import { loadGalleryViewerById } from "./access";
import type { GalleryDeps } from "./deps";
import {
  loadEventRefs,
  previewBatches,
  type GalleryBatchPreview,
  type GalleryItemView,
} from "./items";
import { relationId } from "./relation-id";

/**
 * What a gallery feed post shows of its batch to one viewer (spec
 * 2026-11-13, Feed post (collage)): only the items that viewer may read,
 * under the gallery's own read rule — never the post's visibility.
 */
export type FeedGalleryView = {
  batchId: number;
  /** The first readable items of the batch, newest first. */
  items: GalleryItemView[];
  /** How many of the batch's items this viewer may see. */
  total: number;
  /** The batch's event, for the link chip. */
  event: { id: number; title: string; slug: string } | null;
  /** The batch's category. */
  topicSlug: string | null;
};

type GalleryPostRef = Pick<FeedPost, "id" | "communityId" | "galleryBatch">;

type BatchDetails = Pick<FeedGalleryView, "event" | "topicSlug">;

/** The post's community and batch; null for a post that has no batch. */
function galleryRefOf(
  post: GalleryPostRef,
): { communityId: string; batchId: number } | null {
  const batchId = relationId(post.galleryBatch);
  if (batchId === null || !post.communityId) return null;
  return { communityId: post.communityId, batchId };
}

/** Each batch's event and category, in one read (plus one for the events). */
async function loadBatchDetails(
  deps: GalleryDeps,
  batchIds: readonly number[],
): Promise<Map<number, BatchDetails>> {
  if (batchIds.length === 0) return new Map();
  const { docs } = await deps.payload.find({
    collection: "gallery-batches",
    where: { id: { in: [...batchIds] } },
    select: { event: true, topicSlug: true },
    pagination: false,
    depth: 0,
  });
  const events = await loadEventRefs(
    deps,
    docs.map((doc) => relationId(doc.event)).filter((id) => id !== null),
  );
  return new Map(
    docs.map((doc) => {
      const eventId = relationId(doc.event);
      return [
        doc.id,
        {
          event: eventId === null ? null : (events.get(eventId) ?? null),
          topicSlug: doc.topicSlug ?? null,
        },
      ];
    }),
  );
}

/**
 * The gallery part of each post: `null` for a post without a batch, and for
 * one whose batch this viewer may see nothing of (the card then shows its
 * text only). Each post's items are read as a viewer of the post's own
 * community. The query count does not grow with the number of posts: one
 * viewer per community, two item reads per community (`previewBatches`),
 * and one read each for the batches shown and their events.
 */
export async function galleryViewsForPosts(
  deps: GalleryDeps,
  posts: readonly GalleryPostRef[],
  userId: string | null,
): Promise<Map<number, FeedGalleryView | null>> {
  const views = new Map<number, FeedGalleryView | null>(
    posts.map((post) => [post.id, null]),
  );

  const batchesByCommunity = new Map<string, number[]>();
  for (const post of posts) {
    const ref = galleryRefOf(post);
    if (!ref) continue;
    const batchIds = batchesByCommunity.get(ref.communityId) ?? [];
    batchIds.push(ref.batchId);
    batchesByCommunity.set(ref.communityId, batchIds);
  }
  if (batchesByCommunity.size === 0) return views;

  const previewsByCommunity = new Map(
    await Promise.all(
      [...batchesByCommunity].map(async ([communityId, batchIds]) => {
        const viewer = await loadGalleryViewerById(deps, {
          communityId,
          userId,
        });
        const previews = viewer
          ? await previewBatches(deps, {
              viewer,
              batchIds,
              perBatch: GALLERY_COLLAGE_SIZE,
            })
          : new Map<number, GalleryBatchPreview>();
        return [communityId, previews] as const;
      }),
    ),
  );

  const shown = [...previewsByCommunity.values()].flatMap((previews) => [
    ...previews.keys(),
  ]);
  const details = await loadBatchDetails(deps, shown);
  for (const post of posts) {
    const ref = galleryRefOf(post);
    if (!ref) continue;
    const { communityId, batchId } = ref;
    const preview = previewsByCommunity.get(communityId)?.get(batchId);
    if (!preview) continue;
    views.set(post.id, {
      batchId,
      items: preview.items,
      total: preview.total,
      event: details.get(batchId)?.event ?? null,
      topicSlug: details.get(batchId)?.topicSlug ?? null,
    });
  }
  return views;
}
