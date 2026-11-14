import { TRPCError } from "@trpc/server";

import type { GalleryErrorCode } from "@/lib/gallery-rules";

export type { GalleryErrorCode } from "@/lib/gallery-rules";

/**
 * Every refusal the gallery gives, as a stable code (spec 2026-11-13). The
 * code travels as the error message; the UI maps it to translated copy and
 * never shows the message itself. Each code always carries the same tRPC
 * status, so callers and tests can rely on both. The codes themselves are
 * listed in `gallery-rules.ts` (shared with the browser).
 */
const GALLERY_ERROR_STATUS = {
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
  PUBLIC_NOT_AVAILABLE: "BAD_REQUEST",
  OWN_ITEM: "BAD_REQUEST",
  ALREADY_REPORTED: "CONFLICT",
} as const satisfies Record<GalleryErrorCode, TRPCError["code"]>;

export function galleryError(code: GalleryErrorCode): TRPCError {
  return new TRPCError({ code: GALLERY_ERROR_STATUS[code], message: code });
}
