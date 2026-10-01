import { TRPCError } from "@trpc/server";

import { env } from "@/env";

/**
 * GIFs from GIPHY for the post editor. Only the server talks to GIPHY, so
 * the API key never reaches a browser, and a post only ever stores media
 * addresses this module read from GIPHY itself (looked up by GIPHY id),
 * on GIPHY's own media hosts. GIPHY's terms do not allow copying GIFs into
 * our storage, so readers load them from GIPHY.
 */

/** A GIF as the editor and a post use it. */
export type Gif = {
  giphyId: string;
  title: string;
  /** Sized for the feed, as a looping video (far lighter than a .gif). */
  mp4Url: string;
  stillUrl: string;
  width: number;
  height: number;
  /** A small version for the picker's grid. */
  preview: { mp4Url: string; stillUrl: string; width: number; height: number };
};

export type GifPage = { gifs: Gif[]; nextOffset: number | null };

export type GiphyClient = {
  search(input: {
    query: string;
    offset: number;
    lang: string;
  }): Promise<GifPage>;
  trending(input: { offset: number }): Promise<GifPage>;
  /** The GIF with this id, or null when GIPHY does not know it. */
  byId(giphyId: string): Promise<Gif | null>;
};

const API = "https://api.giphy.com/v1/gifs";
const PAGE_SIZE = 24;
/** GIPHY ratings: "pg" keeps a professional community feed safe for work. */
const RATING = "pg";
/** The ratings a post may carry, checked on every path (search and id). */
const ALLOWED_RATINGS = new Set(["g", "pg"]);
/** GIPHY's search offset ceiling. */
const MAX_OFFSET = 4999;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const GIPHY_ID = /^[A-Za-z0-9]{1,64}$/;

/** True for an https address on one of GIPHY's media hosts. */
export function isGiphyMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (/^media\d*\.giphy\.com$/.test(url.hostname) ||
        url.hostname === "i.giphy.com")
    );
  } catch {
    return false;
  }
}

export function isGiphyId(value: string): boolean {
  return GIPHY_ID.test(value);
}

type Rendition = {
  url?: string;
  mp4?: string;
  mp4_size?: string;
  width?: string;
  height?: string;
};

/**
 * The feed shows a GIF at most 384px tall: the full-size video when it is
 * small enough to scroll past cheaply, else GIPHY's 200px-tall one.
 */
const FEED_MP4_MAX_BYTES = 2 * 1024 * 1024;

/** "Happy Dance GIF by Foo" → "Happy Dance": the UI already says "GIF". */
export function cleanGifTitle(title: string): string {
  return title
    .replace(/\s+GIF(\s+by\s+.*)?$/i, "")
    .trim()
    .slice(0, 200);
}
type RawGif = {
  id?: string;
  title?: string;
  rating?: string;
  images?: Record<string, Rendition | undefined>;
};

/**
 * A GIPHY result as a Gif, or null when it lacks what a post needs or is
 * rated above "pg" (a member could otherwise post any GIF by its id).
 */
export function toGif(raw: RawGif): Gif | null {
  const original = raw.images?.original;
  const lighter = raw.images?.fixed_height;
  const feed =
    Number(original?.mp4_size) > 0 &&
    Number(original?.mp4_size) <= FEED_MP4_MAX_BYTES
      ? { video: original, still: raw.images?.original_still }
      : { video: lighter, still: raw.images?.fixed_height_still };
  const small = raw.images?.fixed_width;
  const smallStill = raw.images?.fixed_width_still;
  const urls = [feed.video?.mp4, feed.still?.url, small?.mp4, smallStill?.url];
  if (
    !raw.id ||
    !isGiphyId(raw.id) ||
    !ALLOWED_RATINGS.has(raw.rating ?? "") ||
    !urls.every((url): url is string => !!url && isGiphyMediaUrl(url))
  ) {
    return null;
  }
  const [mp4Url, stillUrl, previewMp4, previewStill] = urls;
  const size = (r: Rendition | undefined) => ({
    width: Math.max(1, Math.round(Number(r?.width) || 0)),
    height: Math.max(1, Math.round(Number(r?.height) || 0)),
  });
  return {
    giphyId: raw.id,
    title: cleanGifTitle(raw.title ?? ""),
    mp4Url: mp4Url!,
    stillUrl: stillUrl!,
    ...size(feed.video),
    preview: { mp4Url: previewMp4!, stillUrl: previewStill!, ...size(small) },
  };
}

function toPage(body: {
  data?: RawGif[];
  pagination?: { offset?: number; count?: number; total_count?: number };
}): GifPage {
  const gifs = (body.data ?? []).map(toGif).filter((g): g is Gif => g !== null);
  const offset = body.pagination?.offset ?? 0;
  const count = body.pagination?.count ?? 0;
  const total = body.pagination?.total_count ?? 0;
  const next = offset + count;
  return {
    gifs,
    nextOffset: count > 0 && next < total && next <= MAX_OFFSET ? next : null,
  };
}

/**
 * A GIPHY client over `fetch`. Search and trending pages are cached for a
 * few minutes per server instance: the editor asks for the same trending
 * page and popular words again and again, and GIPHY counts every call.
 */
export function createGiphyClient(input: {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}): GiphyClient {
  const doFetch = input.fetch ?? fetch;
  const now = input.now ?? Date.now;
  const cache = new Map<string, { expires: number; page: GifPage }>();
  // GIFs seen in a page, by id: posting a GIF just picked costs no call.
  const seen = new Map<string, { expires: number; gif: Gif }>();

  async function call(path: string, params: Record<string, string>) {
    const url = new URL(`${API}/${path}`);
    url.search = new URLSearchParams({
      api_key: input.apiKey,
      ...params,
    }).toString();
    const res = await doFetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "GIF search is busy. Try again in a few minutes.",
      });
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "GIF search is not available right now.",
        cause: new Error(`GIPHY answered ${res.status}`),
      });
    }
    return (await res.json()) as unknown;
  }

  async function page(
    key: string,
    path: string,
    params: Record<string, string>,
  ) {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.page;
    const body = (await call(path, params)) as
      | Parameters<typeof toPage>[0]
      | null;
    const result = toPage(body ?? {});
    for (const gif of result.gifs) {
      if (seen.size >= CACHE_MAX_ENTRIES * 24) {
        const oldest = seen.keys().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      seen.set(gif.giphyId, { expires: now() + CACHE_TTL_MS, gif });
    }
    if (cache.size >= CACHE_MAX_ENTRIES) {
      // Drop the oldest entry (a Map keeps insertion order).
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { expires: now() + CACHE_TTL_MS, page: result });
    return result;
  }

  const offsetParam = (offset: number) =>
    String(Math.min(Math.max(0, Math.floor(offset)), MAX_OFFSET));

  return {
    search({ query, offset, lang }) {
      const q = query.trim().toLowerCase().slice(0, 50);
      return page(`s:${lang}:${q}:${offset}`, "search", {
        q,
        offset: offsetParam(offset),
        limit: String(PAGE_SIZE),
        rating: RATING,
        lang,
      });
    },
    trending({ offset }) {
      return page(`t:${offset}`, "trending", {
        offset: offsetParam(offset),
        limit: String(PAGE_SIZE),
        rating: RATING,
      });
    },
    async byId(giphyId) {
      if (!isGiphyId(giphyId)) return null;
      const hit = seen.get(giphyId);
      if (hit && hit.expires > now()) return hit.gif;
      const body = (await call(giphyId, {})) as { data?: RawGif } | null;
      return body?.data ? toGif(body.data) : null;
    },
  };
}

let shared: GiphyClient | null = null;

/** The app's GIPHY client; GIFs are unavailable without GIPHY_API_KEY. */
export function getGiphyClient(): GiphyClient {
  if (shared) return shared;
  if (!env.GIPHY_API_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GIFs are not available right now.",
    });
  }
  shared = createGiphyClient({ apiKey: env.GIPHY_API_KEY });
  return shared;
}
