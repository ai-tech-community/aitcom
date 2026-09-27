import { readMeta, readTitle, resolveUrl } from "@/lib/html-meta";

/** What a post stores about the page its first link points to. */
export interface LinkPreviewMeta {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export const LINK_PREVIEW_LIMITS = {
  title: 200,
  description: 300,
  siteName: 80,
  imageUrl: 2048,
} as const;

function limit(value: string | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Read a link preview from a page's HTML: OpenGraph first, then Twitter
 * cards, then plain <title>/description. Only an https image is kept, so a
 * preview never loads mixed content.
 */
export function parseLinkPreview(
  html: string,
  pageUrl: string,
): LinkPreviewMeta {
  const image = resolveUrl(
    readMeta(html, "og:image") ??
      readMeta(html, "og:image:url") ??
      readMeta(html, "twitter:image"),
    pageUrl,
  );
  return {
    title: limit(
      readMeta(html, "og:title") ??
        readMeta(html, "twitter:title") ??
        readTitle(html),
      LINK_PREVIEW_LIMITS.title,
    ),
    description: limit(
      readMeta(html, "og:description") ??
        readMeta(html, "twitter:description") ??
        readMeta(html, "description"),
      LINK_PREVIEW_LIMITS.description,
    ),
    imageUrl:
      image?.startsWith("https://") &&
      image.length <= LINK_PREVIEW_LIMITS.imageUrl
        ? image
        : null,
    siteName: limit(
      readMeta(html, "og:site_name"),
      LINK_PREVIEW_LIMITS.siteName,
    ),
  };
}

/** True when a page gave us nothing worth showing beyond its address. */
export function isEmptyPreview(meta: LinkPreviewMeta): boolean {
  return !meta.title && !meta.description && !meta.imageUrl;
}
