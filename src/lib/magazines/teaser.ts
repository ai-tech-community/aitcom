/** The start of an article a preview reader may receive. Client-safe. */
export const TEASER_OPENING_WORDS = 80;

/** Plain-text excerpt, with an ellipsis only when words were left out. */
export function cutWords(text: string, words: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length > words
    ? `${parts.slice(0, words).join(" ")}…`
    : parts.join(" ");
}

function nodeOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const TEXT_BLOCKS = new Set(["paragraph", "heading", "quote", "list"]);
const TEXT_CONTAINERS = new Set([
  ...TEXT_BLOCKS,
  "listitem",
  "link",
  "autolink",
]);

function textOf(value: unknown): string {
  const node = nodeOf(value);
  if (!node) return "";
  if (node.type === "text")
    return typeof node.text === "string" ? node.text : "";
  if (
    typeof node.type !== "string" ||
    !TEXT_CONTAINERS.has(node.type) ||
    !Array.isArray(node.children)
  )
    return "";
  return node.children.map(textOf).filter(Boolean).join(" ");
}

/** Decision 4: top-level paragraph/heading/quote/list text, in order; never code or media. */
export function openingOf(
  state: unknown,
  words = TEASER_OPENING_WORDS,
): string {
  const children = nodeOf(nodeOf(state)?.root)?.children;
  if (!Array.isArray(children)) return "";
  const text = children
    .filter((value: unknown) => {
      const node = nodeOf(value);
      return typeof node?.type === "string" && TEXT_BLOCKS.has(node.type);
    })
    .map(textOf)
    .filter(Boolean)
    .join(" ");
  return cutWords(text, words);
}
