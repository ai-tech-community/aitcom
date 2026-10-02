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
