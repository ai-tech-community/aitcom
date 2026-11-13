import type { GalleryErrorCode } from "@/lib/gallery-rules";

/**
 * Why a file or the batch did not upload: a server refusal code, or one of
 * the browser's own. Codes only — the UI turns them into translated copy.
 * Anything unrecognised is `UPLOAD_FAILED`.
 */
export type GalleryUploadErrorCode =
  | GalleryErrorCode
  /** The browser cannot read the photo (HEIC in Chrome, a damaged file). */
  | "UNDECODABLE_PHOTO"
  | "VIDEO_TOO_LONG"
  /** The clip cannot be read or has no picture. */
  | "UNSUPPORTED_VIDEO"
  /** This browser has no H.264 encoder, so no clip can be converted here. */
  | "CANNOT_CONVERT_VIDEO";

type Refusal = {
  /**
   * "file": only this file was refused; the next one still goes. "batch":
   * the refusal holds for every remaining file of the batch, so the run
   * stops there.
   */
  scope: "file" | "batch";
  /**
   * Sending it again with the same settings today would be refused again:
   * a retry leaves it out, and its prepared output is not kept for one.
   */
  repeats: boolean;
};

const FILE_BOUND: Refusal = { scope: "file", repeats: true };
const SAME_SETTINGS: Refusal = { scope: "batch", repeats: true };

/**
 * How every reason plays out: the one table the upload run (which refusals
 * end the batch), `retryableFiles` (which files a retry sends) and the
 * prepared cache (which outputs are worth keeping) all read. A `Record`, so
 * a new code cannot be added without saying how it behaves.
 */
const REFUSALS: Record<GalleryUploadErrorCode, Refusal> = {
  // The file itself is the problem.
  FILE_TOO_LARGE: FILE_BOUND,
  FILE_TYPE_NOT_ALLOWED: FILE_BOUND,
  UNDECODABLE_PHOTO: FILE_BOUND,
  VIDEO_TOO_LONG: FILE_BOUND,
  UNSUPPORTED_VIDEO: FILE_BOUND,
  CANNOT_CONVERT_VIDEO: FILE_BOUND,
  // The batch's settings or the member's standing: the same batch again
  // today is refused again.
  UPLOAD_LIMIT: SAME_SETTINGS,
  BATCH_TOO_LARGE: SAME_SETTINGS,
  EVENT_NOT_ALLOWED: SAME_SETTINGS,
  TOPIC_NOT_FOUND: SAME_SETTINGS,
  NOT_A_MEMBER: SAME_SETTINGS,
  GALLERY_DISABLED: SAME_SETTINGS,
  NOT_ALLOWED: SAME_SETTINGS,
  PUBLIC_NOT_AVAILABLE: SAME_SETTINGS,
  // This batch is done for, but a new one may get through: its window
  // closed, or an admin may make room.
  UPLOAD_EXPIRED: { scope: "batch", repeats: false },
  STORAGE_FULL: { scope: "batch", repeats: false },
  // A transfer or check that failed this time.
  UPLOAD_FAILED: { scope: "file", repeats: false },
  // Report refusals: no upload call gives them. Classified only because
  // every server code must be; were one to arrive, it would hold for the
  // whole batch, every time.
  OWN_ITEM: SAME_SETTINGS,
  ALREADY_REPORTED: SAME_SETTINGS,
};

/** Whether the refusal holds for every remaining file of the batch. */
export function endsBatch(code: GalleryUploadErrorCode): boolean {
  return REFUSALS[code].scope === "batch";
}

/** Whether sending again with the same settings today would be refused again. */
export function wouldRepeat(code: GalleryUploadErrorCode): boolean {
  return REFUSALS[code].repeats;
}
