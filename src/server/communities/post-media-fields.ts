import type { FeedPost } from "@/payload-types";

/**
 * Stored field values every writer uses to clear a feed post's media or to
 * remove the post. No dependencies beyond the types, so the collection's own
 * hooks can use them as well as the services.
 */

/** A post with no GIF: every field of the `gif` group cleared. */
export const NO_GIF = {
  giphyId: null,
  title: null,
  mp4Url: null,
  stillUrl: null,
  width: null,
  height: null,
} as const;

/**
 * What a removed post is saved as: the row stays (its comments and likes
 * point at it), marked deleted, without its words, its author's name or its
 * links to pictures, a GIF or a gallery batch. Letting go of the batch frees
 * it (`galleryBatch` is unique) and leaves its items in the gallery; the
 * batch's own link back is cleared with `releaseBatchLink`. The caller
 * removes the files the post owned. Every remover writes this shape.
 */
export function removedPostData() {
  return {
    isDeleted: true,
    content: "",
    authorName: "",
    images: [],
    image: null,
    imageUrl: null,
    gif: NO_GIF,
    galleryBatch: null,
  } satisfies Partial<FeedPost>;
}
