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

/** Media ids for stored logo and banner URLs. A URL that is not in media stays null. */
export function mediaIdsForUrls(
  urls: { logoUrl?: string | null; bannerUrl?: string | null },
  byUrl: ReadonlyMap<string, number>,
): { logoMediaId: number | null; bannerMediaId: number | null } {
  return {
    logoMediaId: urls.logoUrl ? (byUrl.get(urls.logoUrl) ?? null) : null,
    bannerMediaId: urls.bannerUrl ? (byUrl.get(urls.bannerUrl) ?? null) : null,
  };
}

/** Look up shared media ids from the URLs a community already stores. */
export async function findMediaIdsByUrl(
  payload: PayloadClient,
  urls: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, number>> {
  const wanted = [
    ...new Set(urls.filter((url): url is string => Boolean(url))),
  ];
  if (wanted.length === 0) return new Map();
  const { docs } = await payload.find({
    collection: "media",
    where: { url: { in: wanted } },
    depth: 0,
    limit: wanted.length,
    pagination: false,
  });
  const byUrl = new Map<string, number>();
  for (const doc of docs) {
    if (doc.url) byUrl.set(doc.url, doc.id);
  }
  return byUrl;
}
