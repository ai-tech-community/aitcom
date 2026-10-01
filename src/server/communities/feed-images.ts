import { TRPCError } from "@trpc/server";

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** A feed post image: the `media` id a post links and its public URL. */
export type FeedImage = { id: number; url: string };

/** A picture as a post is given it: the upload and its description. */
export type FeedImageChoice = { id: number; alt: string };

/** The most pictures one post carries. */
export const MAX_POST_IMAGES = 4;

/** The longest description (alt text) of one picture. */
export const MAX_IMAGE_ALT_LENGTH = 500;

const NOT_AVAILABLE = "That picture is not available. Please upload it again.";

type Linked = number | { id: number } | null | undefined;

/** The media ids a post's `images` hold, populated or not, in order. */
export function imageIdsOf(post: { images?: Linked[] | null }): number[] {
  return (post.images ?? [])
    .map((image) => (typeof image === "number" ? image : (image?.id ?? null)))
    .filter((id): id is number => id !== null);
}

/**
 * The member's own feed post images, free to go on `postId` (or a new
 * post), with their descriptions saved on the uploads. Only images
 * uploaded as feed post images by this member count, so a post can never
 * show someone else's upload or an outside address, and the images can be
 * deleted with the post. Returns them in the given order.
 */
export async function claimFeedImages(
  payload: Payload,
  input: { images: FeedImageChoice[]; userId: string; postId?: number },
): Promise<FeedImage[]> {
  const ids = input.images.map((image) => image.id);
  if (new Set(ids).size !== ids.length || ids.length > MAX_POST_IMAGES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A post has up to ${MAX_POST_IMAGES} different pictures.`,
    });
  }
  if (ids.length === 0) return [];
  const { docs: media } = await payload.find({
    collection: "media",
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 0,
  });
  const byId = new Map(media.map((doc) => [doc.id, doc]));
  for (const id of ids) {
    const doc = byId.get(id);
    if (
      !doc?.url ||
      doc.uploadedBy !== input.userId ||
      doc.purpose !== "feed-post"
    ) {
      throw new TRPCError({ code: "BAD_REQUEST", message: NOT_AVAILABLE });
    }
  }
  const { totalDocs: usedElsewhere } = await payload.count({
    collection: "feed-posts",
    where: {
      and: [
        { images: { in: ids } },
        ...(input.postId === undefined
          ? []
          : [{ id: { not_equals: input.postId } }]),
      ],
    },
  });
  if (usedElsewhere > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: NOT_AVAILABLE });
  }
  for (const image of input.images) {
    const alt = image.alt.trim().slice(0, MAX_IMAGE_ALT_LENGTH);
    if (alt && alt !== byId.get(image.id)?.alt) {
      try {
        await payload.update({
          collection: "media",
          id: image.id,
          data: { alt },
          depth: 0,
        });
      } catch (error) {
        // A description is a courtesy: the post goes ahead without it.
        console.warn("[feed-images] saving a description failed", {
          imageId: image.id,
          error,
        });
      }
    }
  }
  return ids.map((id) => ({ id, url: byId.get(id)!.url! }));
}

/** The image types an imported picture may be. */
const IMPORTABLE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const IMPORT_TIMEOUT_MS = 8000;
const USER_AGENT = "aitcom-feed-image/1.0 (+https://aitcommunity.org)";

export type ImageFetcher = (
  url: string,
) => Promise<{ data: Buffer; mimetype: string }>;

/** Downloads a picture behind the SSRF guard, within the upload size limit. */
export const fetchImage: ImageFetcher = async (url) => {
  const { response } = await safeFetch(url, {
    userAgent: USER_AGENT,
    timeoutMs: IMPORT_TIMEOUT_MS,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Image request failed with ${response.status}`);
  }
  const mimetype = (response.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!(mimetype in IMPORTABLE_TYPES)) {
    await response.body?.cancel();
    throw new Error(`Not an importable image: ${mimetype || "no type"}`);
  }
  return { data: await readBodyCapped(response, MAX_IMAGE_BYTES), mimetype };
};

/**
 * Copies a picture from the web into our storage as `userId`'s feed post
 * image. Used when an owner publishes an agent's draft: agents attach
 * images by address, and a published post must never make its readers
 * load an outside address.
 */
export async function importFeedImage(
  payload: Payload,
  input: { url: string; userId: string },
  fetcher: ImageFetcher = fetchImage,
): Promise<FeedImage> {
  let image: Awaited<ReturnType<ImageFetcher>>;
  try {
    image = await fetcher(input.url);
  } catch (error) {
    console.warn("[feed-images] import failed", { url: input.url, error });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "We couldn't load the picture in this draft. Ask your agent for a different picture, or reject the draft.",
    });
  }
  const media = await payload.create({
    collection: "media",
    data: {
      alt: "Feed post image",
      uploadedBy: input.userId,
      purpose: "feed-post",
    },
    file: {
      data: image.data,
      name: `feed-image.${IMPORTABLE_TYPES[image.mimetype]}`,
      mimetype: image.mimetype,
      size: image.data.byteLength,
    },
  });
  if (!media.url) throw new Error("Stored image has no URL");
  return { id: media.id, url: media.url };
}

/**
 * Best-effort removal of the feed post images a post no longer uses (an
 * edit replaced or removed them, or the post was deleted): every image of
 * `post` not in `keep`. Only feed post images are removed; a legacy post
 * that showed a shared upload leaves it alone. The post change already
 * happened, so a failure is logged; the daily sweep of unused feed images
 * removes them later.
 */
export async function cleanUpPostImages(
  payload: Payload,
  post: { id: number; images?: Linked[] | null },
  keep: readonly number[],
  options: {
    context: string;
    log?: (message: string, detail: unknown) => void;
  },
): Promise<void> {
  const dropped = imageIdsOf(post).filter((id) => !keep.includes(id));
  if (dropped.length === 0) return;
  try {
    await payload.delete({
      collection: "media",
      where: {
        and: [{ id: { in: dropped } }, { purpose: { equals: "feed-post" } }],
      },
    });
  } catch (error) {
    (options.log ?? console.error)(
      `[${options.context}] image cleanup failed`,
      { postId: post.id, imageIds: dropped, error },
    );
  }
}
