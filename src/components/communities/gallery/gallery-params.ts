/**
 * The Gallery tab's filters and open item as URL search params (`?event=`,
 * `topic=`, `type=`, `item=`), so a filtered wall or an open photo survives
 * refresh and Back, and other pages (an event's "See all in the gallery")
 * can link straight to it.
 */
import {
  GALLERY_MEDIA_TYPES,
  GALLERY_PAGE_SIZE,
  type GalleryMediaType,
} from "@/lib/gallery-rules";

export type GalleryFilters = {
  /** An event id, `"none"` for items from no event, or null for all. */
  event: number | "none" | null;
  topic: string | null;
  type: GalleryMediaType | null;
  /** The item open in the lightbox. */
  item: number | null;
};

type ParamReader = { get(key: string): string | null };

/** The API's own bound on a topic slug. */
const TOPIC_MAX = 100;

function recordId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isMediaType(value: string | null): value is GalleryMediaType {
  return (GALLERY_MEDIA_TYPES as readonly (string | null)[]).includes(value);
}

/** Reads the params, dropping any value the API would refuse. */
export function parseGalleryParams(params: ParamReader): GalleryFilters {
  const event = params.get("event");
  const topic = params.get("topic")?.trim() ?? "";
  const type = params.get("type");
  return {
    event: event === "none" ? "none" : recordId(event),
    topic: topic && topic.length <= TOPIC_MAX ? topic : null,
    type: isMediaType(type) ? type : null,
    item: recordId(params.get("item")),
  };
}

/** Writes `patch` into a copy of `search`; null removes a param. */
export function writeGalleryParams(
  search: URLSearchParams,
  patch: Partial<GalleryFilters>,
): URLSearchParams {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export function hasGalleryFilters(filters: GalleryFilters): boolean {
  return (
    filters.event !== null || filters.topic !== null || filters.type !== null
  );
}

/** The `gallery.list` input for the wall (the cursor is added per page). */
export function galleryListInput(slug: string, filters: GalleryFilters) {
  return {
    slug,
    ...(filters.event !== null && { eventId: filters.event }),
    ...(filters.topic !== null && { topicSlug: filters.topic }),
    ...(filters.type !== null && { mediaType: filters.type }),
    limit: GALLERY_PAGE_SIZE,
  };
}
