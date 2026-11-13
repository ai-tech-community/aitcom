/**
 * The Gallery tab's filters and open item as URL search params (`?event=`,
 * `topic=`, `type=`, `item=`), so a filtered wall or an open photo survives
 * refresh and Back, and other pages (an event's "See all in the gallery")
 * can link straight to it. `?upload=1` opens the upload dialog (an event's
 * "Add yours" adds `&event=<id>`, which also filters the wall to it).
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

/** A change to the params; null removes one. */
export type GalleryParamsPatch = Partial<GalleryFilters> & { upload?: null };

const UPLOAD_PARAM = "upload";
const EVENT_PARAM = "event";

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
  const event = params.get(EVENT_PARAM);
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
  patch: GalleryParamsPatch,
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

/**
 * The upload link in the params: null without `upload=1`, else the event to
 * start the upload with (none when absent or not an event id).
 */
export function readUploadLink(
  params: ParamReader,
): { eventId: number | null } | null {
  if (params.get(UPLOAD_PARAM) !== "1") return null;
  return { eventId: recordId(params.get(EVENT_PARAM)) };
}

/**
 * This page's path with the upload link added, filters kept: where a guest
 * comes back to after signing in, so the upload opens for them there.
 */
export function uploadLinkPath(location: {
  pathname: string;
  search: string;
}): string {
  const params = new URLSearchParams(location.search);
  params.set(UPLOAD_PARAM, "1");
  return `${location.pathname}?${params}`;
}

/**
 * An event page's way into its community's gallery (locale-less, for the
 * app's `Link`): the wall filtered to the event, or with `upload` the
 * upload dialog opened with the event chosen.
 */
export function eventGalleryPath(
  slug: string,
  eventId: number,
  options: { upload?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (options.upload) params.set(UPLOAD_PARAM, "1");
  params.set(EVENT_PARAM, String(eventId));
  return `/communities/${slug}/gallery?${params}`;
}
