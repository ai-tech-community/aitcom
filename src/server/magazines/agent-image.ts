import { TRPCError } from "@trpc/server";

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import {
  fetchImage,
  type ImageFetcher,
} from "@/server/communities/feed-images";
import type { PayloadClient } from "./deps";

/** Same ceiling and image-type gate as `POST /api/upload`, which magazine covers use. */
export function assertMagazineImage(input: {
  data: Buffer;
  contentType: string;
}): { data: Buffer; mimetype: string; name: string } {
  const mimetype = input.contentType.split(";")[0]!.trim().toLowerCase();
  if (!mimetype.startsWith("image/")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only images are allowed",
    });
  }
  if (input.data.byteLength === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No file provided" });
  }
  if (input.data.byteLength > MAX_IMAGE_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "File too large (max 2MB)",
    });
  }
  const ext = (mimetype.slice("image/".length) || "img").replace("jpeg", "jpg");
  return { data: input.data, mimetype, name: `magazine-image.${ext}` };
}

export function decodeImageBase64(value: string): Buffer {
  const raw = value.replace(/^data:[^;]+;base64,/, "").trim();
  return Buffer.from(raw, "base64");
}

/**
 * Stores a magazine image in the shared `media` collection, the same place
 * issue covers and logos go (no feed-post purpose, so it can be reused on
 * an article or a cover). Returns the stored URL.
 */
export async function uploadMagazineImage(
  payload: PayloadClient,
  ownerId: string,
  input: {
    alt?: string;
    url?: string;
    dataBase64?: string;
    contentType?: string;
  },
  fetcher: ImageFetcher = fetchImage,
): Promise<{ id: number; url: string }> {
  const file = input.url
    ? await fileFromUrl(input.url, fetcher)
    : assertMagazineImage({
        data: decodeImageBase64(input.dataBase64 ?? ""),
        contentType: input.contentType ?? "",
      });
  const alt = input.alt?.trim();
  const media = await payload.create({
    collection: "media",
    data: {
      alt: alt && alt.length > 0 ? alt : "upload",
      uploadedBy: ownerId,
    },
    file: {
      data: file.data,
      name: file.name,
      mimetype: file.mimetype,
      size: file.data.byteLength,
    },
  });
  if (!media.url) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored image has no URL",
    });
  }
  return { id: media.id, url: media.url };
}

async function fileFromUrl(url: string, fetcher: ImageFetcher) {
  try {
    const image = await fetcher(url);
    return assertMagazineImage({
      data: image.data,
      contentType: image.mimetype,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "We couldn't load that image. Use a JPEG, PNG, WebP or GIF under 2MB.",
    });
  }
}
