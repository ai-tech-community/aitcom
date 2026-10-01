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
] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]["value"];

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return MEDIA_PURPOSES.some((purpose) => purpose.value === value);
}
