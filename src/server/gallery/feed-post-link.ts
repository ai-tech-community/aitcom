import { sql } from "@payloadcms/db-postgres";
import { TRPCError } from "@trpc/server";

import { removedPostData } from "@/server/communities/post-media-fields";

import type { GalleryDeps } from "./deps";
import { removeItemFiles } from "./item-files";

/**
 * The gallery's side of a gallery feed post (spec 2026-11-13, Feed post
 * (collage)). The items belong to the gallery, not to the post: deleting the
 * post leaves them. What crosses over lives here:
 *
 * - A moderator removing a reported gallery post removes the batch's items
 *   too (`removeBatchItems`, called by `reviewReport`): the report is about
 *   that content.
 * - Deleting the last ready item of a batch removes its post when the post
 *   has no words left (`releaseEmptyGalleryPost`, called by `deleteItem`;
 *   every other way an item is removed, such as a moderator removing a
 *   reported item, must call it too), the way a feed post that showed only a
 *   deleted picture is removed. `editPost` calls it when an edit empties the
 *   post's text, and `closeBatch` right after announcing, for an item
 *   deleted while the post was being made.
 * - Whenever a post lets go of its batch (`deletePost`, `reviewReport`,
 *   `releaseEmptyGalleryPost`), the batch lets go of the post
 *   (`releaseBatchLink`), so its `feedPostId` always names the live post:
 *   the empty-batch cleanup can then remove a batch whose post is gone.
 *
 * The post is found by its `galleryBatch`, the one link that is always
 * written with the post (the batch's own `feedPostId` may have failed to
 * save).
 */

/**
 * Clears the batch's `feedPostId` once its post was removed, only while it
 * still names that post, so it never clears another post's link. Best
 * effort, since the post is already removed: a failure is logged, and the
 * batch then only waits longer for the cleanup.
 */
export async function releaseBatchLink(
  deps: Pick<GalleryDeps, "payload" | "log">,
  link: { batchId: number; postId: number },
): Promise<void> {
  const log = deps.log ?? console.error;
  try {
    const { errors } = await deps.payload.update({
      collection: "gallery-batches",
      where: {
        and: [
          { id: { equals: link.batchId } },
          { feedPostId: { equals: link.postId } },
        ],
      },
      data: { feedPostId: null },
      depth: 0,
    });
    if (errors.length > 0) {
      log("[gallery.releaseBatchLink] clearing a batch's feed post failed", {
        ...link,
        errors,
      });
    }
  } catch (error) {
    log("[gallery.releaseBatchLink] clearing a batch's feed post failed", {
      ...link,
      error,
    });
  }
}

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
 * since a moderator may restore it.
 *
 * The post is first claimed in one statement that checks, at write time,
 * that it is still live, still has no words and still announces this
 * batch, and in the same write marks it deleted, empties its text and lets
 * go of the batch. A text edit saved meanwhile (`editPost` writes by id,
 * unguarded) therefore either lands first and keeps the post, or finds it
 * deleted. Payload's own `update` cannot do this: it matches its `where`
 * before its hooks and then writes by id. Only a claimed post gets the
 * rest of the removed shape through Payload, and the batch lets go of it
 * (`releaseBatchLink`). A failed Payload write is logged and thrown after
 * the batch link is released (the claim already removed the post).
 *
 * True when this call removed the post.
 */
export async function releaseEmptyGalleryPost(
  deps: Pick<GalleryDeps, "payload" | "log">,
  batchId: number,
): Promise<boolean> {
  const {
    docs: [post],
  } = await deps.payload.find({
    collection: "feed-posts",
    where: { galleryBatch: { equals: batchId } },
    limit: 1,
    depth: 0,
  });
  if (!post || post.isDeleted || post.content?.trim()) return false;
  const { docs: ready } = await deps.payload.find({
    collection: "gallery-items",
    where: {
      and: [{ batch: { equals: batchId } }, { status: { equals: "ready" } }],
    },
    limit: 1,
    depth: 0,
  });
  if (ready.length > 0) return false;
  if (!(await claimEmptyGalleryPost(deps, { postId: post.id, batchId }))) {
    return false;
  }
  let failure: unknown = null;
  try {
    await deps.payload.update({
      collection: "feed-posts",
      id: post.id,
      data: removedPostData(),
      depth: 0,
    });
  } catch (error) {
    failure = error;
    (deps.log ?? console.error)(
      "[gallery.releaseEmptyGalleryPost] removing an empty gallery post failed",
      { batchId, postId: post.id, error },
    );
  }
  await releaseBatchLink(deps, { batchId, postId: post.id });
  if (failure !== null) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return true;
}

/**
 * Marks the post deleted, without words and without its batch, only while
 * it is live, has no words (whitespace counts as none, as `trim()` does)
 * and announces this batch.
 * True when this call claimed it.
 */
async function claimEmptyGalleryPost(
  deps: Pick<GalleryDeps, "payload">,
  claim: { postId: number; batchId: number },
): Promise<boolean> {
  const { rows } = await deps.payload.db.drizzle.execute(sql`
    UPDATE "feed_posts"
      SET "updated_at" = now(),
          "is_deleted" = true,
          "content" = '',
          "gallery_batch_id" = NULL
    WHERE "id" = ${claim.postId}
      AND "is_deleted" IS DISTINCT FROM true
      AND coalesce("content", '') !~ '\\S'
      AND "gallery_batch_id" = ${claim.batchId}
    RETURNING "id"
  `);
  return rows.length > 0;
}
