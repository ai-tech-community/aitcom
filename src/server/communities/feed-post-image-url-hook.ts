import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
} from "payload";

import type { FeedPost } from "@/payload-types";

import { imageIdsOf } from "./feed-images";

/**
 * Keeps a post's `imageUrl` (and the deprecated `image` field) in step with
 * its first picture on every write path (members, agents, admin), so older
 * readers (agents, MCP, the previous version) get one picture without a
 * join. Writes that do not set `images`, or leave the
 * first picture as it was, leave the URL alone: a legacy post that only
 * has a URL keeps it through an admin save (which sends an empty list).
 * Code that removes such a picture clears `imageUrl` itself.
 */
export function feedPostImageUrlBeforeChange(): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, req }) => {
    if (data?.images === undefined) return data;
    const images = (data.images ?? []) as FeedPost["images"];
    const first = imageIdsOf({ images })[0] ?? null;
    const before = originalDoc
      ? (imageIdsOf(originalDoc as FeedPost)[0] ?? null)
      : null;
    // The deprecated single-picture field mirrors the first picture. An
    // empty list on a post that never had one (an admin save of a post
    // written by the previous version) leaves it alone; code that removes
    // pictures on purpose clears it itself.
    if (first !== null || before !== null) data.image = first;
    if (first === before) return data;
    if (first === null) {
      data.imageUrl = null;
      return data;
    }
    const populated = images?.find(
      (image) => typeof image === "object" && image?.id === first,
    );
    if (populated && typeof populated === "object" && populated.url) {
      data.imageUrl = populated.url;
      return data;
    }
    const media = await req.payload.findByID({
      collection: "media",
      id: first,
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
 * takes it out of every post that shows it, so the post's picture list and
 * its `imageUrl` copy move on with it instead of pointing at a deleted
 * file. The database's own cascade would drop the link but not the copy.
 */
export function unlinkFeedPostsBeforeMediaDelete(): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    const mediaId = Number(id);
    const { docs } = await req.payload.find({
      collection: "feed-posts",
      where: { images: { in: [mediaId] } },
      depth: 0,
      pagination: false,
      req,
    });
    for (const post of docs) {
      await req.payload.update({
        collection: "feed-posts",
        id: post.id,
        data: {
          images: imageIdsOf(post).filter((other) => other !== mediaId),
        },
        depth: 0,
        req,
      });
    }
  };
}
