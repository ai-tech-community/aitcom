/**
 * Limits, values and names for the community gallery (spec 2026-11-13,
 * ADR-0049). Pure, so the browser (before shrinking and uploading) and the
 * server (before trusting an upload) use the same numbers and can never
 * disagree. Video limits are the feed's, from `video-rules.ts`, unchanged.
 */
import {
  THUMB_CONTENT_TYPE,
  VIDEO_CONTENT_TYPE,
  VIDEO_UPLOADS_PER_DAY,
  type VideoStorageClass,
} from "@/lib/video-rules";

export const GALLERY_MAX_FILES_PER_BATCH = 30;
export const GALLERY_MAX_VIDEOS_PER_BATCH = 10;
export const GALLERY_PHOTOS_PER_DAY = 150;
/** Counted from gallery items only, separately from the feed's videos. */
export const GALLERY_VIDEOS_PER_DAY = VIDEO_UPLOADS_PER_DAY;
export const GALLERY_PHOTO_MAX_SIDE = 2048;
export const GALLERY_THUMB_MAX_SIDE = 480;
export const GALLERY_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const GALLERY_THUMB_MAX_BYTES = 512 * 1024;
export const GALLERY_CAPTION_MAX = 280;
export const GALLERY_ALT_MAX = 500;
export const GALLERY_BATCH_TEXT_MAX = 500;
export const GALLERY_PAGE_SIZE = 40;
/**
 * Batches a member may have open at once, across all communities: each one
 * reserves its plan against the daily quotas until it is finished or its
 * finish window passes.
 */
export const GALLERY_MAX_OPEN_BATCHES = 3;

export const GALLERY_MEDIA_TYPES = ["photo", "video"] as const;
export type GalleryMediaType = (typeof GALLERY_MEDIA_TYPES)[number];
/** Names for the admin panel (members see translated copy instead). */
export const GALLERY_MEDIA_TYPE_LABELS: Record<GalleryMediaType, string> = {
  photo: "Photo",
  video: "Video",
};

export const GALLERY_ITEM_STATUSES = ["uploading", "ready", "failed"] as const;
export type GalleryItemStatus = (typeof GALLERY_ITEM_STATUSES)[number];
export const GALLERY_ITEM_STATUS_LABELS: Record<GalleryItemStatus, string> = {
  uploading: "Uploading",
  ready: "Ready",
  failed: "Failed",
};

export const GALLERY_BATCH_STATUSES = ["open", "finished"] as const;
export type GalleryBatchStatus = (typeof GALLERY_BATCH_STATUSES)[number];
export const GALLERY_BATCH_STATUS_LABELS: Record<GalleryBatchStatus, string> = {
  open: "Open",
  finished: "Finished",
};

export const GALLERY_STORAGE_CLASSES = [
  "public",
  "private",
] as const satisfies readonly VideoStorageClass[];
export const GALLERY_STORAGE_LABELS: Record<VideoStorageClass, string> = {
  public: "Public",
  private: "Private",
};

/**
 * Every refusal the gallery server gives, as the stable code it sends as the
 * error message. Here, not in `src/server/gallery/errors.ts`, so the browser
 * can tell a known code from any other message without importing server
 * code; the server's status table must cover exactly these.
 */
export const GALLERY_ERROR_CODES = [
  "GALLERY_DISABLED",
  "NOT_A_MEMBER",
  "EVENT_NOT_ALLOWED",
  "TOPIC_NOT_FOUND",
  "BATCH_TOO_LARGE",
  "UPLOAD_LIMIT",
  "STORAGE_FULL",
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_TOO_LARGE",
  "UPLOAD_EXPIRED",
  "UPLOAD_FAILED",
  "NOT_ALLOWED",
  /** "Everyone" asked for where outsiders cannot read the community. */
  "PUBLIC_NOT_AVAILABLE",
] as const;
export type GalleryErrorCode = (typeof GALLERY_ERROR_CODES)[number];

export function isGalleryErrorCode(value: unknown): value is GalleryErrorCode {
  return (
    typeof value === "string" &&
    (GALLERY_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Photos are always re-encoded to JPEG in the browser before upload. */
export const GALLERY_PHOTO_CONTENT_TYPES = ["image/jpeg"] as const;
export const GALLERY_VIDEO_CONTENT_TYPE = VIDEO_CONTENT_TYPE;
export const GALLERY_THUMB_CONTENT_TYPE = THUMB_CONTENT_TYPE;

/**
 * The folders every gallery file and thumbnail lives under, by storage class.
 * Outside the feed video folders, so the feed's unused-files sweep never sees
 * them (ADR-0049).
 */
export const GALLERY_KEY_PREFIXES = {
  public: "media/gallery/public/",
  private: "private/gallery/",
} as const;

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const FILE_EXTENSION: Record<GalleryMediaType, string> = {
  photo: "jpg",
  video: "mp4",
};
const GALLERY_KEY =
  /^(?:media\/gallery\/public|private\/gallery)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpg|mp4)$/;

/** Object keys for one item. Throws on ids that could escape their folder. */
export function galleryObjectKeys(input: {
  storage: VideoStorageClass;
  communityId: string;
  uploadId: string;
  mediaType: GalleryMediaType;
}): { fileKey: string; thumbnailKey: string } {
  if (!SAFE_SEGMENT.test(input.communityId)) {
    throw new Error("invalid community id");
  }
  if (!SAFE_SEGMENT.test(input.uploadId)) throw new Error("invalid upload id");
  const stem = `${GALLERY_KEY_PREFIXES[input.storage]}${input.communityId}/${input.uploadId}`;
  return {
    fileKey: `${stem}.${FILE_EXTENSION[input.mediaType]}`,
    thumbnailKey: `${stem}-thumb.jpg`,
  };
}

/**
 * True only for a key shaped exactly like one `galleryObjectKeys` makes. The
 * cleanup sweep removes nothing else, whatever a storage listing returns.
 */
export function isGalleryKey(key: string): boolean {
  return GALLERY_KEY.test(key);
}

export type GalleryItemLabel =
  | { text: string }
  | {
      key: "gallery.label.photoFromEvent" | "gallery.label.videoFromEvent";
      values: { event: string; name: string };
    }
  | {
      key: "gallery.label.photoBy" | "gallery.label.videoBy";
      values: { name: string };
    };

/**
 * An item's accessible name: its caption, else its alt text, else a
 * generated description. The generated one is a message key plus values, so
 * the UI translates it (`"text" in label ? label.text : t(label.key,
 * label.values)`).
 */
export function galleryItemLabel(input: {
  caption: string | null | undefined;
  alt: string | null | undefined;
  mediaType: GalleryMediaType;
  eventTitle: string | null | undefined;
  uploaderName: string;
}): GalleryItemLabel {
  const caption = input.caption?.trim();
  if (caption) return { text: caption };
  const alt = input.alt?.trim();
  if (alt) return { text: alt };
  const event = input.eventTitle?.trim();
  const name = input.uploaderName;
  if (event) {
    return {
      key:
        input.mediaType === "video"
          ? "gallery.label.videoFromEvent"
          : "gallery.label.photoFromEvent",
      values: { event, name },
    };
  }
  return {
    key:
      input.mediaType === "video"
        ? "gallery.label.videoBy"
        : "gallery.label.photoBy",
    values: { name },
  };
}
