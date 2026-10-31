/** Full descriptions have their own budget, separate from short table cells. */
export const MAX_DESCRIPTION_CHARS = 100_000;

export type DescriptionText = { text: string | null; truncated: boolean };

/** Normalize source text for display/storage, preserving paragraph boundaries. */
export function normalizeDescription(
  value: string | null | undefined,
): DescriptionText {
  const normalized = (value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\0/g, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (part) =>
      part.length === 2 ? part : "\uFFFD",
    )
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = normalized.length > MAX_DESCRIPTION_CHARS;
  let end = Math.min(normalized.length, MAX_DESCRIPTION_CHARS);
  if (truncated && /[\uD800-\uDBFF]/.test(normalized.charAt(end - 1))) end--;
  return { text: normalized.slice(0, end).trimEnd() || null, truncated };
}
