/** The largest image the upload route accepts. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * What an image in the `media` collection was uploaded for. Uploads with a
 * purpose belong to one owner and one use, so they can be checked when
 * attached and deleted when that use ends. Uploads without one (event and
 * course covers, logos) may be shared and are never deleted automatically.
 */
export const MEDIA_PURPOSES = [
  { label: "Feed post image", value: "feed-post" },
  { label: "Profile photo", value: "avatar" },
] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]["value"];

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return MEDIA_PURPOSES.some((purpose) => purpose.value === value);
}

/**
 * The purposes the general upload route (`/api/upload`) may record. A
 * profile photo has its own route, which uploads and sets it in one step,
 * so no profile photo is ever left uploaded but unused.
 */
const UPLOAD_ROUTE_PURPOSES: readonly MediaPurpose[] = ["feed-post"];

export function isUploadRoutePurpose(value: unknown): value is MediaPurpose {
  return UPLOAD_ROUTE_PURPOSES.some((purpose) => purpose === value);
}

/**
 * The picture types a profile photo may be, with the file extension each is
 * stored under. No SVG: it can carry script.
 */
export const PROFILE_PHOTO_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
