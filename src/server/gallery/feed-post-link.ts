import { TRPCError } from "@trpc/server";

import { removedPostData } from "@/server/communities/post-media";

import type { GalleryDeps } from "./deps";
import { removeItemFiles } from "./item-files";

/**
 * The gallery's side of a gallery feed post (spec 2026-11-13, Feed post
 * (collage)). The items belong to the gallery, not to the post: deleting the
 * post leaves them. Two things cross over, and they live here:
 *
 * - A moderator removing a reported gallery post removes the batch's items
 *   too (`removeBatchItems`): the report is about that content.
 * - Deleting the last ready item of a batch removes its post when the post
 *   has no words left (`releaseEmptyGalleryPost`), the way a feed post that
 *   showed only a deleted picture is removed.
 *
 * The post is found by its `galleryBatch`, the one link that is always
 * written with the post (the batch's own `feedPostId` may have failed to
 * save).
 */

/**
 * Deletes every item of the batch (whatever its state) and then their files,
 * best effort (`removeItemFiles`; the unused-files sweep is the net). Rows
 * Payload could not delete are logged and fail the call, so the caller can
 * keep what points at them and try again; the files of rows that did go
 * are still removed. Safe to repeat.
 */
export async function removeBatchItems(
  deps: Pick<GalleryDeps, "payload" | "storage" | "log">,
  batchId: number,
): Promise<void> {
  const { docs, errors } = await deps.payload.delete({
    collection: "gallery-items",
    where: { batch: { equals: batchId } },
    depth: 0,
  });
  for (const item of docs) {
    await removeItemFiles(deps, item, "removeBatchItems");
  }
  if (errors.length > 0) {
    (deps.log ?? console.error)(
      "[gallery.removeBatchItems] deleting a batch's items failed",
      { batchId, errors },
    );
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }
}

/**
 * Removes the batch's live feed post (`removedPostData`, as a member or a
 * moderator removes one) once the batch has no ready item left and the post
 * has no words: such a post would show nothing. A hidden item still counts,
 * since a moderator may restore it. The write only matches while the post
 * still announces this batch, so a post deleted meanwhile is left alone.
 * A failed write is logged and thrown.
 */
export async function releaseEmptyGalleryPost(
  deps: Pick<GalleryDeps, "payload" | "log">,
  batchId: number,
): Promise<void> {
  const {
    docs: [post],
  } = await deps.payload.find({
    collection: "feed-posts",
    where: { galleryBatch: { equals: batchId } },
    limit: 1,
    depth: 0,
  });
  if (!post || post.isDeleted || post.content?.trim()) return;
  const { docs: ready } = await deps.payload.find({
    collection: "gallery-items",
    where: {
      and: [{ batch: { equals: batchId } }, { status: { equals: "ready" } }],
    },
    limit: 1,
    depth: 0,
  });
  if (ready.length > 0) return;
  const { errors } = await deps.payload.update({
    collection: "feed-posts",
    where: {
      and: [{ id: { equals: post.id } }, { galleryBatch: { equals: batchId } }],
    },
    data: removedPostData(),
    depth: 0,
  });
  if (errors.length > 0) {
    (deps.log ?? console.error)(
      "[gallery.releaseEmptyGalleryPost] removing an empty gallery post failed",
      { batchId, postId: post.id, errors },
    );
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  }
}
