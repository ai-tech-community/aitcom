import type { CollectionBeforeChangeHook } from "payload";

import type { FeedPost } from "@/payload-types";

import { imageIdOf } from "./feed-images";

/**
 * Keeps a post's `imageUrl` in step with its `image` on every write path
 * (members, agents, admin), so feeds read the URL without a join. Writes
 * that do not set the image leave the URL alone, so legacy posts that only
 * have a URL keep it until their picture is changed or removed.
 */
export function feedPostImageUrlBeforeChange(): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, req }) => {
    if (data?.image === undefined) return data;
    const image = data.image as FeedPost["image"];
    const id = imageIdOf({ image });
    if (id === null) {
      // Also clears a legacy post's URL-only picture.
      data.imageUrl = null;
      return data;
    }
    const before = originalDoc ? imageIdOf(originalDoc as FeedPost) : null;
    if (id === before) return data;
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
