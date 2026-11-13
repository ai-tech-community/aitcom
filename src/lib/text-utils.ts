/**
 * Convert text to a URL-safe slug.
 * Uses NFD normalization to handle accented characters.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Shorten text to at most `max` characters, ending with "…" when cut.
 * Counts and cuts by Unicode code point (as Postgres `varchar(n)` counts),
 * so an emoji or other astral character is never split in half.
 */
export function clipText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  if (max <= 0) return "";
  return `${chars
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
}

/** Text on one line: trimmed, every run of whitespace (newlines too) one space. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * The text with every lone surrogate replaced by U+FFFD, like
 * `String.prototype.toWellFormed` (ES2024; not in this repo's TS lib). Text
 * straight from the browser (a file name, a caption) can hold one, and a
 * lone surrogate makes `encodeURIComponent` — and so a download header —
 * throw.
 */
export function wellFormed(value: string): string {
  return value.replace(LONE_SURROGATE, "\uFFFD");
}

/**
 * Well-formed text cut to at most `max` UTF-16 units — the unit our length
 * limits (zod, Payload `maxLength`) count — without splitting an emoji or
 * other character outside the Basic Multilingual Plane in half.
 */
export function clampText(value: string, max: number): string {
  const text = wellFormed(value);
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  const splitsPair = last >= 0xd800 && last <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max);
}
