/**
 * Article video links. The iframe src is built here, on an allowlisted host,
 * from an id we parsed. The address the author pasted never becomes an
 * iframe src. YouTube uses the nocookie host. Schooltv's player has an embed
 * control, but the page URL does not publish an oEmbed endpoint or a stable
 * embed address, so a Schooltv link stays a card.
 */

export type ArticleVideoProvider = "youtube" | "vimeo" | "schooltv" | "link";

export type ArticleVideo =
  | {
      kind: "embed";
      provider: "youtube" | "vimeo";
      label: string;
      pageUrl: string;
      embedSrc: string;
      thumbnailUrl: string | null;
    }
  | {
      kind: "card";
      provider: "schooltv" | "link";
      label: string;
      href: string;
      title: string;
    };

const MAX_URL_LENGTH = 2000;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[A-Za-z0-9]+$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

const SCHOOLTV_HOSTS = new Set(["schooltv.nl", "www.schooltv.nl"]);

/** Hosts an article iframe may load. Anything else is a link card. */
export const ARTICLE_IFRAME_HOSTS = [
  "www.youtube-nocookie.com",
  "player.vimeo.com",
] as const;

export function safeHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH || /\s/.test(trimmed)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return url;
}

function segments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function youtubeStart(url: URL): string {
  const raw = url.searchParams.get("t") ?? url.searchParams.get("start");
  if (!raw || !/^\d+$/.test(raw)) return "";
  return `?start=${raw}`;
}

function youtubeEmbed(url: URL): ArticleVideo | null {
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  const parts = segments(url);
  let id: string | null = null;
  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    id = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (["embed", "shorts", "live"].includes(parts[0] ?? "")) {
    id = parts[1] ?? null;
  }
  if (!id || id === "videoseries" || !YOUTUBE_ID.test(id)) return null;
  const start = youtubeStart(url);
  const embedSrc = `https://www.youtube-nocookie.com/embed/${id}${start}`;
  const pageUrl = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start.slice("?start=".length)}` : ""}`;
  return {
    kind: "embed",
    provider: "youtube",
    label: "YouTube",
    pageUrl,
    embedSrc,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function vimeoEmbed(url: URL): ArticleVideo | null {
  if (!VIMEO_HOSTS.has(url.hostname)) return null;
  const parts = segments(url);
  const [id, hash] =
    url.hostname === "player.vimeo.com" && parts[0] === "video"
      ? [parts[1], url.searchParams.get("h") ?? undefined]
      : [parts[0], parts[1]];
  if (!id || !VIMEO_ID.test(id)) return null;
  const h = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : "";
  const embedSrc = `https://player.vimeo.com/video/${id}${h}`;
  const pageUrl = h
    ? `https://vimeo.com/${id}/${hash}`
    : `https://vimeo.com/${id}`;
  return {
    kind: "embed",
    provider: "vimeo",
    label: "Vimeo",
    pageUrl,
    embedSrc,
    thumbnailUrl: null,
  };
}

function titleFromPath(url: URL): string {
  const last = segments(url).at(-1);
  if (!last) return "";
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    decoded = last;
  }
  const text = decoded.replace(/[-_]+/g, " ").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function linkCard(url: URL): ArticleVideo {
  const href = url.toString();
  if (SCHOOLTV_HOSTS.has(url.hostname)) {
    return {
      kind: "card",
      provider: "schooltv",
      label: "Schooltv",
      href,
      title: titleFromPath(url) || "Schooltv",
    };
  }
  const label = url.hostname.replace(/^www\./, "");
  return {
    kind: "card",
    provider: "link",
    label,
    href,
    title: titleFromPath(url) || label,
  };
}

/**
 * A pasted or stored http(s) address as either an allowlisted player or a
 * link card. `null` when it is not a usable http(s) URL.
 */
export function resolveArticleVideo(raw: string): ArticleVideo | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  return youtubeEmbed(url) ?? vimeoEmbed(url) ?? linkCard(url);
}

/** True only for the embed addresses this module builds. */
export function isAllowedEmbedSrc(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.hostname === "www.youtube-nocookie.com") {
    if (!/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) return false;
    for (const key of url.searchParams.keys()) {
      if (key !== "start") return false;
    }
    const start = url.searchParams.get("start");
    return start === null || /^\d+$/.test(start);
  }
  if (url.hostname === "player.vimeo.com") {
    if (!/^\/video\/\d+$/.test(url.pathname)) return false;
    for (const key of url.searchParams.keys()) {
      if (key !== "h") return false;
    }
    const hash = url.searchParams.get("h");
    return hash === null || VIMEO_HASH.test(hash);
  }
  return false;
}
