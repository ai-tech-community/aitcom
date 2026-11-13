import { TRPCError } from "@trpc/server";

/**
 * Every refusal the gallery gives, as a stable code (spec 2026-11-13). The
 * code travels as the error message; the UI maps it to translated copy and
 * never shows the message itself. Each code always carries the same tRPC
 * status, so callers and tests can rely on both.
 */
const GALLERY_ERROR_STATUS = {
  GALLERY_DISABLED: "NOT_FOUND",
  NOT_A_MEMBER: "FORBIDDEN",
  EVENT_NOT_ALLOWED: "BAD_REQUEST",
  TOPIC_NOT_FOUND: "BAD_REQUEST",
  BATCH_TOO_LARGE: "BAD_REQUEST",
  UPLOAD_LIMIT: "TOO_MANY_REQUESTS",
  STORAGE_FULL: "FORBIDDEN",
  FILE_TYPE_NOT_ALLOWED: "BAD_REQUEST",
  FILE_TOO_LARGE: "BAD_REQUEST",
  UPLOAD_EXPIRED: "NOT_FOUND",
  UPLOAD_FAILED: "BAD_REQUEST",
  NOT_ALLOWED: "FORBIDDEN",
} as const satisfies Record<string, TRPCError["code"]>;

export type GalleryErrorCode = keyof typeof GALLERY_ERROR_STATUS;

export function galleryError(code: GalleryErrorCode): TRPCError {
  return new TRPCError({ code: GALLERY_ERROR_STATUS[code], message: code });
}
