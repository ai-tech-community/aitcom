import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
} from "payload";

import type { FeedPost } from "@/payload-types";

import { imageIdOf } from "./feed-images";

/**
 * Keeps a post's `imageUrl` in step with its `image` on every write path
 * (members, agents, admin), so feeds read the URL without a join. Writes
 * that do not set an image, or set none on a post that had none linked,
 * leave the URL alone: a legacy post that only has a URL keeps it through
 * an admin save (which sends an empty `image`). Code that removes such a
 * picture clears `imageUrl` itself.
 */
export function feedPostImageUrlBeforeChange(): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, req }) => {
    if (data?.image === undefined) return data;
    const image = data.image as FeedPost["image"];
    const id = imageIdOf({ image });
    const before = originalDoc ? imageIdOf(originalDoc as FeedPost) : null;
    if (id === before) return data;
    if (id === null) {
      data.imageUrl = null;
      return data;
    }
    if (typeof image === "object" && image?.url) {
      data.imageUrl = image.url;
      return data;
    }
    const media = await req.payload.findByID({
      collection: "media",
      id,
      depth: 0,
      disableErrors: true,
      req,
    });
    data.imageUrl = media?.url ?? null;
    return data;
  };
}

/**
 * Before a media document is deleted (an admin, the unused-image sweep),
 * unlinks it from any post that shows it, so the post's `imageUrl` copy is
 * cleared with it instead of pointing at a deleted file. The database's own
 * `ON DELETE SET NULL` would clear the link but not the copy.
 */
export function unlinkFeedPostsBeforeMediaDelete(): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    await req.payload.update({
      collection: "feed-posts",
      where: { image: { equals: id } },
      data: { image: null },
      depth: 0,
      req,
    });
  };
}
