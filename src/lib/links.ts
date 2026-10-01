/**
 * Finds web links in plain user text. Shared by the server (which link a post
 * previews) and the client (which words render as links), so both always
 * agree on what counts as a link.
 *
 * Only http(s) is recognised, so a rendered href can never be `javascript:`.
 */

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/**
 * Punctuation that ends up glued to a link: "see https://x.com.", and the
 * marks of a bold or italic link ("**https://x.com/a**", see post-format).
 * A real link ending in * or _ is far rarer than a formatted one.
 */
const TRAILING_PUNCTUATION = /[.,!?:;'"*_]+$/;

/**
 * Drops trailing punctuation and an unbalanced closing bracket, so
 * "(https://x.com/a)" links to /a while "https://en.wikipedia.org/wiki/A_(B)"
 * keeps its own closing bracket.
 */
function trimLink(raw: string): string {
  let link = raw;
  for (;;) {
    const before = link;
    link = link.replace(TRAILING_PUNCTUATION, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
    ] as const) {
      if (
        link.endsWith(close) &&
        link.split(close).length > link.split(open).length
      ) {
        link = link.slice(0, -1);
      }
    }
    if (link === before) return link;
  }
}

/** A well-formed http(s) URL, or null. */
function toHref(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Splits text into plain runs and links, in order. Joining `text` restores the input. */
export function splitTextIntoLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const raw = trimLink(match[0]);
    const href = toHref(raw);
    if (!href) continue;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "link", text: raw, href });
    cursor = start + raw.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/** The first link in the text: the one a post previews. */
export function firstLink(text: string): string | null {
  for (const segment of splitTextIntoLinks(text)) {
    if (segment.kind === "link") return segment.href;
  }
  return null;
}
