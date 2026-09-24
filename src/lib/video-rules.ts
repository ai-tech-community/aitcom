/**
 * Limits and names for community short videos. Pure, so the browser (before
 * converting and uploading) and the server (before trusting an upload) use
 * the same numbers and can never disagree. See ADR-0036.
 */
export const MAX_VIDEO_SECONDS = 90;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const MAX_THUMB_BYTES = 512 * 1024;
export const VIDEO_LONG_SIDE = 1280;
export const VIDEO_MAX_FPS = 30;
export const VIDEO_BITRATE = 2_500_000;
export const AUDIO_BITRATE = 128_000;
export const VIDEO_UPLOADS_PER_DAY = 20;
export const UPLOAD_GRANT_SECONDS = 600;
export const PLAYBACK_LINK_SECONDS = 3600;
/**
 * Private playback links are signed at the start of a window this long, so
 * every feed refetch inside the window returns the identical URL and a
 * playing video is not reloaded. Links live PLAYBACK_LINK_SECONDS plus one
 * window, so each one still lasts at least PLAYBACK_LINK_SECONDS from the
 * moment it is served.
 */
export const PLAYBACK_LINK_WINDOW_SECONDS = 1800;
export const ABANDONED_UPLOAD_HOURS = 24;
/**
 * Must stay below ABANDONED_UPLOAD_HOURS so a finish and the daily cleanup
 * can never act on the same grant at once.
 */
export const FINISH_WINDOW_HOURS = ABANDONED_UPLOAD_HOURS - 1;
export const VIDEO_CONTENT_TYPE = "video/mp4";
export const THUMB_CONTENT_TYPE = "image/jpeg";

export const VIDEO_VISIBILITIES = ["community", "public"] as const;
export type VideoVisibility = (typeof VIDEO_VISIBILITIES)[number];
/** Names for the admin panel (members see translated copy instead). */
export const VIDEO_VISIBILITY_LABELS: Record<VideoVisibility, string> = {
  community: "Community only",
  public: "Public",
};
export type VideoStorageClass = "public" | "private";

export function storageClassFor(
  visibility: VideoVisibility,
): VideoStorageClass {
  return visibility === "public" ? "public" : "private";
}

const UPLOAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isUploadId(value: string): boolean {
  return UPLOAD_ID.test(value);
}

/** Object keys for one upload. Throws on ids that could escape their folder. */
export function videoObjectKeys(input: {
  visibility: VideoVisibility;
  communityId: string;
  uploadId: string;
}): { video: string; thumbnail: string } {
  if (!isUploadId(input.uploadId)) throw new Error("invalid upload id");
  if (!SAFE_SEGMENT.test(input.communityId)) {
    throw new Error("invalid community id");
  }
  const base =
    storageClassFor(input.visibility) === "public"
      ? `media/videos/public/${input.communityId}/${input.uploadId}`
      : `private/videos/${input.communityId}/${input.uploadId}`;
  return { video: `${base}.mp4`, thumbnail: `${base}.jpg` };
}

/** Scale so the long side is at most `longSide`, even sides, never upscale. */
export function fitWithin(
  width: number,
  height: number,
  longSide: number = VIDEO_LONG_SIDE,
): { width: number; height: number } {
  const valid =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0;
  if (!valid) throw new Error("invalid video size");
  const scale = Math.min(1, longSide / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}
