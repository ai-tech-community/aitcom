import { TRPCError } from "@trpc/server";

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import type { FeedPost } from "@/payload-types";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** A feed post image: the `media` id a post links and its public URL. */
export type FeedImage = { id: number; url: string };

const NOT_AVAILABLE = "That picture is not available. Please upload it again.";

/** The media id a post's `image` holds, whether populated or not. */
export function imageIdOf(post: Pick<FeedPost, "image">): number | null {
  const image = post.image;
  if (image == null) return null;
  return typeof image === "number" ? image : image.id;
}

/**
 * The member's own feed post image, free to go on `postId` (or a new post).
 * Only images uploaded as feed post images by this member count, so a post
 * can never show someone else's upload or an outside address, and the image
 * can be deleted with the post.
 */
export async function claimFeedImage(
  payload: Payload,
  input: { imageId: number; userId: string; postId?: number },
): Promise<FeedImage> {
  const media = await payload.findByID({
    collection: "media",
    id: input.imageId,
    depth: 0,
    disableErrors: true,
  });
  if (
    !media?.url ||
    media.uploadedBy !== input.userId ||
    media.purpose !== "feed-post"
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: NOT_AVAILABLE });
  }
  const { totalDocs: usedElsewhere } = await payload.count({
    collection: "feed-posts",
    where: {
      and: [
        { image: { equals: media.id } },
        ...(input.postId === undefined
          ? []
          : [{ id: { not_equals: input.postId } }]),
      ],
    },
  });
  if (usedElsewhere > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: NOT_AVAILABLE });
  }
  return { id: media.id, url: media.url };
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
 * Best-effort removal of a feed post image once its post stops using it
 * (an edit replaced or removed it, or the post was deleted). Only feed post
 * images are removed; a legacy post that showed a shared upload leaves it
 * alone. The post change already happened, so a failure is logged; the
 * daily sweep of unused feed images removes it later.
 */
export async function cleanUpPostImage(
  payload: Payload,
  post: Pick<FeedPost, "id" | "image">,
  options: {
    context: string;
    log?: (message: string, detail: unknown) => void;
  },
): Promise<void> {
  const imageId = imageIdOf(post);
  if (imageId === null) return;
  try {
    await payload.delete({
      collection: "media",
      where: {
        and: [
          { id: { equals: imageId } },
          { purpose: { equals: "feed-post" } },
        ],
      },
    });
  } catch (error) {
    (options.log ?? console.error)(
      `[${options.context}] image cleanup failed`,
      {
        postId: post.id,
        imageId,
        error,
      },
    );
  }
}
