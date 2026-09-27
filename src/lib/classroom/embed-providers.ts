/**
 * Embed providers for classroom lessons (spec 2026-09-27 §3.1, ADR-0037).
 *
 * A registry of strategies: each provider recognises its own links and
 * builds the embed address itself, on a fixed host, from ids it parsed. The
 * author's raw link never reaches an iframe `src`. Adding a provider is one
 * entry here. Pure — shared by the editor, the renderer and the server.
 */
export type EmbedProviderId =
  | "youtube"
  | "vimeo"
  | "loom"
  | "google-slides"
  | "google-docs"
  | "google-sheets"
  | "google-drive"
  | "figma";

export type EmbedAspect = "16:9" | "page";

export type ResolvedEmbed = {
  provider: EmbedProviderId;
  label: string;
  embedSrc: string;
  aspect: EmbedAspect;
  needsPublicSharing: boolean;
};

type EmbedProvider = {
  id: EmbedProviderId;
  label: string;
  aspect: EmbedAspect;
  needsPublicSharing: boolean;
  hosts: readonly string[];
  /** Build the embed address from a parsed URL, or null if it isn't ours. */
  build(url: URL): string | null;
};

const MAX_LINK_LENGTH = 2000;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DIGITS = /^\d+$/;
const VIMEO_HASH = /^[A-Za-z0-9]+$/;
const LOOM_ID = /^[a-f0-9]{32}$/;
const GOOGLE_ID = /^[A-Za-z0-9_-]{20,}$/;
const FIGMA_KEY = /^[A-Za-z0-9]{10,}$/;

function segments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function youtubeStart(url: URL): string {
  const raw = url.searchParams.get("t") ?? url.searchParams.get("start");
  return raw && DIGITS.test(raw) ? `?start=${raw}` : "";
}

const PROVIDERS: readonly EmbedProvider[] = [
  {
    id: "youtube",
    label: "YouTube",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
      "youtube-nocookie.com",
    ],
    build(url) {
      const parts = segments(url);
      let id: string | null = null;
      if (url.hostname === "youtu.be") id = parts[0] ?? null;
      else if (parts[0] === "watch") id = url.searchParams.get("v");
      else if (["embed", "shorts", "live"].includes(parts[0] ?? ""))
        id = parts[1] ?? null;
      // "videoseries" is a playlist player (it fits the id shape); a
      // playlist has no single video to show, so refuse it.
      if (!id || id === "videoseries" || !YOUTUBE_ID.test(id)) return null;
      return `https://www.youtube-nocookie.com/embed/${id}${youtubeStart(url)}`;
    },
  },
  {
    id: "vimeo",
    label: "Vimeo",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
    build(url) {
      const parts = segments(url);
      // Unlisted videos carry a privacy hash: the second path segment on
      // vimeo.com, the `h` query parameter on player links.
      const [id, hash] =
        url.hostname === "player.vimeo.com" && parts[0] === "video"
          ? [parts[1], url.searchParams.get("h") ?? undefined]
          : [parts[0], parts[1]];
      if (!id || !DIGITS.test(id)) return null;
      const h = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : "";
      return `https://player.vimeo.com/video/${id}${h}`;
    },
  },
  {
    id: "loom",
    label: "Loom",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: ["loom.com", "www.loom.com"],
    build(url) {
      const [kind, id] = segments(url);
      if ((kind !== "share" && kind !== "embed") || !id || !LOOM_ID.test(id))
        return null;
      return `https://www.loom.com/embed/${id}`;
    },
  },
  {
    id: "google-slides",
    label: "Google Slides",
    aspect: "16:9",
    needsPublicSharing: true,
    hosts: ["docs.google.com"],
    build(url) {
      const parts = segments(url);
      if (parts[0] !== "presentation" || parts[1] !== "d") return null;
      const published = parts[2] === "e";
      const id = published ? parts[3] : parts[2];
      if (!id || !GOOGLE_ID.test(id)) return null;
      const base = published
        ? `https://docs.google.com/presentation/d/e/${id}`
        : `https://docs.google.com/presentation/d/${id}`;
      return `${base}/embed?start=false&loop=false`;
    },
  },
  {
    id: "google-docs",
    label: "Google Docs",
    aspect: "page",
    needsPublicSharing: true,
    hosts: ["docs.google.com"],
    build(url) {
      const [kind, d, id] = segments(url);
      if (kind !== "document" || d !== "d" || !id || !GOOGLE_ID.test(id))
        return null;
      return `https://docs.google.com/document/d/${id}/preview`;
    },
  },
  {
    id: "google-sheets",
    label: "Google Sheets",
    aspect: "page",
    needsPublicSharing: true,
    hosts: ["docs.google.com"],
    build(url) {
      const [kind, d, id] = segments(url);
      if (kind !== "spreadsheets" || d !== "d" || !id || !GOOGLE_ID.test(id))
        return null;
      return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    },
  },
  {
    id: "google-drive",
    label: "Google Drive",
    aspect: "16:9",
    needsPublicSharing: true,
    hosts: ["drive.google.com"],
    build(url) {
      const parts = segments(url);
      const id =
        parts[0] === "file" && parts[1] === "d"
          ? parts[2]
          : parts[0] === "open"
            ? url.searchParams.get("id")
            : null;
      if (!id || !GOOGLE_ID.test(id)) return null;
      return `https://drive.google.com/file/d/${id}/preview`;
    },
  },
  {
    id: "figma",
    label: "Figma",
    aspect: "16:9",
    needsPublicSharing: false,
    hosts: ["figma.com", "www.figma.com"],
    build(url) {
      const [kind, key] = segments(url);
      if (!["file", "design", "proto", "board"].includes(kind ?? ""))
        return null;
      if (!key || !FIGMA_KEY.test(key)) return null;
      const canonical = `https://www.figma.com/${kind}/${key}`;
      return `https://www.figma.com/embed?embed_host=aitcommunity&url=${encodeURIComponent(canonical)}`;
    },
  },
];

export const EMBED_PROVIDER_LABELS: readonly string[] = PROVIDERS.map(
  (p) => p.label,
);

export function resolveEmbed(raw: string): ResolvedEmbed | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  for (const provider of PROVIDERS) {
    if (!provider.hosts.includes(host)) continue;
    const embedSrc = provider.build(url);
    if (embedSrc) {
      return {
        provider: provider.id,
        label: provider.label,
        embedSrc,
        aspect: provider.aspect,
        needsPublicSharing: provider.needsPublicSharing,
      };
    }
  }
  return null;
}
