import { TRPCError } from "@trpc/server";

export const CONTENT_IMAGE_ALT_MAX = 200;
export const CONTENT_IMAGE_URL_MAX = 2000;

export type ContentImageInput = {
  mediaId?: number | null;
  url?: string | null;
  alt?: string | null;
};

/** Columns to write. A missing key means leave that column alone. */
export type ContentImageColumns = {
  mediaId?: number | null;
  url?: string | null;
  alt?: string | null;
};

export type ContentImageChoice =
  | { kind: "absent" }
  | { kind: "clear"; alt?: string | null }
  | { kind: "media"; mediaId: number; alt?: string | null }
  | { kind: "url"; url: string; alt?: string | null }
  | { kind: "alt"; alt: string | null };

/** An http(s) address. It is not fetched here. */
export function isHttpImageUrl(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > CONTENT_IMAGE_URL_MAX ||
    value !== value.trim()
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function altOf(alt: string | null | undefined): string | null | undefined {
  if (alt === undefined) return undefined;
  if (alt === null) return null;
  const trimmed = alt.trim();
  if (trimmed.length > CONTENT_IMAGE_ALT_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Alt text must be ${CONTENT_IMAGE_ALT_MAX} characters or fewer.`,
    });
  }
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * One picture: a media id, or an http(s) URL, plus optional alt text.
 * Sending both a media id and a URL is refused. Null clears the picture.
 * Alt alone does not clear the picture.
 */
export function contentImageChoice(
  input: ContentImageInput,
): ContentImageChoice {
  const hasMedia = input.mediaId !== undefined;
  const hasUrl = input.url !== undefined;
  const alt = altOf(input.alt);
  if (input.mediaId != null && input.url != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Send a media id or an http(s) URL, not both.",
    });
  }
  if (
    input.mediaId != null &&
    (!Number.isInteger(input.mediaId) || input.mediaId <= 0)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Media id must be a positive integer.",
    });
  }
  if (input.url != null && !isHttpImageUrl(input.url)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use an http(s) image URL.",
    });
  }
  if (!hasMedia && !hasUrl) {
    if (alt === undefined) return { kind: "absent" };
    return { kind: "alt", alt };
  }
  if (input.mediaId != null) {
    return {
      kind: "media",
      mediaId: input.mediaId,
      ...(alt !== undefined ? { alt } : {}),
    };
  }
  if (input.url != null) {
    return {
      kind: "url",
      url: input.url,
      ...(alt !== undefined ? { alt } : {}),
    };
  }
  return { kind: "clear", ...(alt !== undefined ? { alt } : {}) };
}

/** Columns for a resolved choice. `resolvedUrl` is the media row's URL. */
export function contentImageColumns(
  choice: ContentImageChoice,
  resolved?: { url: string; alt: string | null },
): ContentImageColumns | undefined {
  switch (choice.kind) {
    case "absent":
      return undefined;
    case "alt":
      return { alt: choice.alt };
    case "clear":
      return {
        mediaId: null,
        url: null,
        alt: choice.alt ?? null,
      };
    case "media":
      if (!resolved?.url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown image. Upload it with upload-image first.",
        });
      }
      return {
        mediaId: choice.mediaId,
        url: resolved.url,
        alt: choice.alt !== undefined ? choice.alt : resolved.alt,
      };
    case "url":
      return {
        mediaId: null,
        url: choice.url,
        alt: choice.alt ?? null,
      };
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}
