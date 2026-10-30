import { TRPCError } from "@trpc/server";

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import {
  fetchImage,
  type ImageFetcher,
} from "@/server/communities/feed-images";
import type { PayloadClient } from "./deps";

/** Object key `magazines/<magazineId>/<uuid>-<sanitized>.ext`. The uuid makes a second upload a new object. */
export function magazineImageStorageKey(input: {
  magazineId: number;
  contentType: string;
  originalName?: string;
  id: string;
}): { prefix: string; name: string; mimetype: string } {
  const mimetype = input.contentType.split(";")[0]!.trim().toLowerCase();
  const ext =
    (mimetype.slice("image/".length) || "img")
      .replace("jpeg", "jpg")
      .replace(/[^a-z0-9]+/g, "") || "img";
  const raw = (input.originalName ?? "image").split(/[/\\]/).pop() ?? "image";
  const stem = raw
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const id = input.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "");
  return {
    prefix: `magazines/${input.magazineId}`,
    name: `${id || "image"}-${stem || "image"}.${ext}`,
    mimetype,
  };
}

/** Same ceiling and image-type gate as `POST /api/upload`, which magazine covers use. */
export function assertMagazineImage(input: {
  data: Buffer;
  contentType: string;
  magazineId: number;
  originalName?: string;
  id: string;
}): { data: Buffer; mimetype: string; name: string; prefix: string } {
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
  const key = magazineImageStorageKey(input);
  return { data: input.data, ...key };
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
    magazineSlug: string;
    alt?: string;
    url?: string;
    dataBase64?: string;
    contentType?: string;
  },
  fetcher: ImageFetcher = fetchImage,
): Promise<{ id: number; url: string; key: string }> {
  const { docs } = await payload.find({
    collection: "magazines",
    where: { slug: { equals: input.magazineSlug } },
    depth: 0,
    limit: 1,
    pagination: false,
  });
  const magazine = docs[0];
  if (!magazine) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  const named = {
    magazineId: magazine.id,
    originalName: input.alt,
    id: crypto.randomUUID(),
  };
  const file = input.url
    ? await fileFromUrl(input.url, fetcher, named)
    : assertMagazineImage({
        data: decodeImageBase64(input.dataBase64 ?? ""),
        contentType: input.contentType ?? "",
        ...named,
      });
  const alt = input.alt?.trim();
  const media = await payload.create({
    collection: "media",
    data: {
      alt: alt && alt.length > 0 ? alt : "upload",
      uploadedBy: ownerId,
      // Stored beside the file so the S3 key is magazines/<id>/<uuid>-<name>.ext
      // and a later read builds the same URL. Empty for every other upload.
      prefix: file.prefix,
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
  return {
    id: media.id,
    url: media.url,
    key: `${file.prefix}/${file.name}`,
  };
}

async function fileFromUrl(
  url: string,
  fetcher: ImageFetcher,
  named: { magazineId: number; originalName?: string; id: string },
) {
  try {
    const image = await fetcher(url);
    return assertMagazineImage({
      data: image.data,
      contentType: image.mimetype,
      ...named,
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
