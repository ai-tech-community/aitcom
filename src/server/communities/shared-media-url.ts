import { TRPCError } from "@trpc/server";

import type { PayloadClient } from "@/server/magazines/deps";

/**
 * The URL for a media id from `upload-image` (or the same shared upload).
 * Feed-post images are refused: they are deleted with the post. The file
 * must belong to the owner the agent acts for.
 */
export async function sharedMediaUrl(
  payload: PayloadClient,
  mediaId: number,
  ownerId: string,
): Promise<string> {
  const media = await payload
    .findByID({
      collection: "media",
      id: mediaId,
      depth: 0,
      disableErrors: true,
    })
    .catch(() => null);
  if (!media?.url) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unknown image. Upload it with upload-image first.",
    });
  }
  if (media.purpose === "feed-post") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That image belongs to a feed post",
    });
  }
  if (media.uploadedBy !== ownerId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That image was uploaded by someone else",
    });
  }
  return media.url;
}
