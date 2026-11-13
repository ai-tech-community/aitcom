"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import {
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
  isGalleryErrorCode,
} from "@/lib/gallery-rules";
import type en from "../../../../messages/en.json";
import type { GalleryUploadErrorCode } from "./use-gallery-upload";

/** A key with copy under `gallery.errors`. */
export type GalleryErrorCopyKey = keyof (typeof en)["gallery"]["errors"];

/** The numbers some error copy names, from the rules themselves. */
const ERROR_VALUES = {
  maxFiles: GALLERY_MAX_FILES_PER_BATCH,
  maxVideos: GALLERY_MAX_VIDEOS_PER_BATCH,
};

type ErrorLike = { message?: unknown; data?: { code?: unknown } | null };

/**
 * Turns a failed gallery call into translated copy. The server answers with
 * stable codes (`NOT_ALLOWED`, …) or tRPC's `NOT_FOUND`; a code with copy in
 * `gallery.errors` gets it; anything else (a network failure, a server
 * error) gets `fallback`, never the "gone" copy. The raw message
 * is never shown (DESIGN.md Gate-Before-Fail: no raw `error.message`).
 */
export function useGalleryErrorText() {
  const t = useTranslations("gallery.errors");
  return useCallback(
    (error: unknown, fallback: GalleryErrorCopyKey): string => {
      const { message, data } = (error ?? {}) as ErrorLike;
      if (isGalleryErrorCode(message) && t.has(message)) {
        return t(message, ERROR_VALUES);
      }
      if (data?.code === "NOT_FOUND") return t("NOT_FOUND");
      return t(fallback);
    },
    [t],
  );
}

/**
 * Copy for why a file or a batch did not upload. The video problems say
 * what the feed's video upload says, word for word.
 */
export function useGalleryUploadErrorText() {
  const t = useTranslations("gallery.errors");
  const video = useTranslations("communities.video");
  return useCallback(
    (code: GalleryUploadErrorCode): string => {
      switch (code) {
        case "VIDEO_TOO_LONG":
          return video("tooLong");
        case "UNSUPPORTED_VIDEO":
          return video("unreadable");
        case "CANNOT_CONVERT_VIDEO":
          return video("unsupported");
        default:
          return t(code, ERROR_VALUES);
      }
    },
    [t, video],
  );
}
