/**
 * Markdown image syntax in article text: `![alt](url)`.
 * Only https addresses become images. Anything else stays text.
 */

const MAX_URL_LENGTH = 2000;
const IMAGE = /!\[([^\]\n]*)\]\((https:\/\/[^\s)]+)\)/g;

export type MarkdownImageSegment =
  | { kind: "text"; text: string }
  | { kind: "image"; alt: string; url: string };

/** An https address with no credentials. Null when it must stay text. */
export function httpsImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH || /\s/.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Split `![alt](https://...)` out of a string. Other image syntax stays text. */
export function splitMarkdownImages(source: string): MarkdownImageSegment[] {
  const segments: MarkdownImageSegment[] = [];
  let cursor = 0;
  for (const match of source.matchAll(IMAGE)) {
    const start = match.index ?? 0;
    const alt = match[1] ?? "";
    const rawUrl = match[2] ?? "";
    const url = httpsImageUrl(rawUrl);
    if (!url) continue;
    if (start > cursor) {
      segments.push({ kind: "text", text: source.slice(cursor, start) });
    }
    segments.push({ kind: "image", alt: alt.trim(), url });
    cursor = start + match[0].length;
  }
  if (cursor < source.length) {
    segments.push({ kind: "text", text: source.slice(cursor) });
  }
  if (segments.length === 0) {
    return [{ kind: "text", text: source }];
  }
  return segments;
}

/** True when the string is only https markdown images and whitespace. */
export function markdownImagesOnly(
  source: string,
): MarkdownImageSegment[] | null {
  const segments = splitMarkdownImages(source.trim());
  const images = segments.filter((segment) => segment.kind === "image");
  const text = segments
    .filter((segment) => segment.kind === "text")
    .map((segment) => segment.text)
    .join("");
  if (images.length === 0 || text.trim().length > 0) return null;
  return images;
}
