/**
 * Small, dependency-free readers for the metadata in a fetched HTML page:
 * <meta> tags (OpenGraph, Twitter, description) and <title>. Shared by the
 * event importer and feed link previews.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
  nbsp: " ",
};

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function clean(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const text = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : undefined;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Read `<meta property|name="key" content="…">`, attributes in either order.
 * A value may contain the other quote kind ("Greg's guide").
 */
export function readMeta(html: string, key: string): string | undefined {
  const k = escapeRegExp(key);
  const keyFirst = new RegExp(
    `<meta\\b[^>]*?\\b(?:property|name)\\s*=\\s*["']${k}["'][^>]*?\\bcontent\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const contentFirst = new RegExp(
    `<meta\\b[^>]*?\\bcontent\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*?\\b(?:property|name)\\s*=\\s*["']${k}["']`,
    "i",
  );
  const m = keyFirst.exec(html) ?? contentFirst.exec(html);
  return m ? clean(m[1] ?? m[2]) : undefined;
}

/** The document's <title> text. */
export function readTitle(html: string): string | undefined {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return clean(m?.[1]);
}

/** Resolve a possibly-relative URL against the page's URL. */
export function resolveUrl(
  raw: string | undefined,
  base: string,
): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, base).href;
  } catch {
    return undefined;
  }
}
