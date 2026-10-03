import { XMLParser } from "fast-xml-parser";

export type FeedEntry = {
  title: string;
  url: string | null;
  publishedAt: string | null;
  author: string | null;
  summary: string;
};

export class NotAFeedError extends Error {
  constructor() {
    super("Not an RSS or Atom feed");
    this.name = "NotAFeedError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ["item", "entry", "link", "author"].includes(name),
});

type Node = Record<string, unknown>;

/** Parse RSS 2.0 or Atom into entries. Throws NotAFeedError otherwise. */
export function parseFeed(xml: string, baseUrl: string): FeedEntry[] {
  // Declared entities can expand exponentially; real feeds never need them.
  if (/<!ENTITY/i.test(xml)) throw new NotAFeedError();
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new NotAFeedError();
  }
  const rss = asNode(doc.rss);
  const channel = rss ? asNode(rss.channel) : null;
  if (channel)
    return asArray(channel.item).map((i) => rssEntry(asNode(i) ?? {}, baseUrl));
  const feed = asNode(doc.feed);
  if (feed)
    return asArray(feed.entry).map((e) => atomEntry(asNode(e) ?? {}, baseUrl));
  throw new NotAFeedError();
}

function rssEntry(item: Node, baseUrl: string): FeedEntry {
  return {
    title: plainText(text(item.title) ?? "", 500),
    url: webUrl(text(item.link), baseUrl),
    publishedAt: isoDate(text(item.pubDate) ?? text(item["dc:date"])),
    author: text(item["dc:creator"]) ?? text(item.author),
    summary: plainText(
      text(item.description) ?? text(item["content:encoded"]) ?? "",
    ),
  };
}

function atomEntry(entry: Node, baseUrl: string): FeedEntry {
  const links = asArray(entry.link).map((l) => asNode(l) ?? {});
  const link =
    links.find((l) => l["@_rel"] === "alternate") ??
    links.find((l) => l["@_rel"] === undefined);
  const author = asNode(asArray(entry.author)[0]);
  return {
    title: plainText(text(entry.title) ?? "", 500),
    url: webUrl(
      typeof link?.["@_href"] === "string" ? link["@_href"] : null,
      baseUrl,
    ),
    publishedAt: isoDate(text(entry.published) ?? text(entry.updated)),
    author: author ? text(author.name) : null,
    summary: plainText(text(entry.summary) ?? text(entry.content) ?? ""),
  };
}

function asNode(v: unknown): Node | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : null;
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | null {
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "string") return v.trim() || null;
  const node = asNode(v);
  if (node && "#text" in node) return text(node["#text"]);
  return null;
}

function webUrl(raw: string | null, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTML → one line of plain text, capped at `max` characters. */
export function plainText(html: string, max = 1_000): string {
  const decoded = stripTags(html).replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#")) {
        const hex = entity[1] === "x" || entity[1] === "X";
        const codePoint = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return isScalarValue(codePoint)
          ? String.fromCodePoint(codePoint)
          : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/** A Unicode scalar value: in range and not a lone surrogate. */
function isScalarValue(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint >= 0 &&
    codePoint <= 0x10ffff &&
    (codePoint < 0xd800 || codePoint > 0xdfff)
  );
}

const RAW_TEXT_OPEN = /^<(script|style)(?![\w-])/i;
const RAW_TEXT_CLOSE: Record<string, RegExp> = {
  script: /<\/script>/gi,
  style: /<\/style>/gi,
};

/**
 * Replace every tag with a space and drop script/style blocks with their
 * content. A single forward scan: the next ">" and the next closing tag are
 * remembered between steps, so hostile input (thousands of unclosed tags)
 * costs linear time instead of the quadratic backtracking of a regex.
 */
function stripTags(html: string): string {
  const parts: string[] = [];
  /** Index of the next ">" at or after the current tag; -1 when none is left. */
  let nextGt = -2;
  /** Index of the next closing tag per raw-text element; -1 when none is left. */
  const nextClose: Record<string, number> = {};
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      parts.push(html.slice(i));
      break;
    }
    parts.push(html.slice(i, lt));
    if (nextGt !== -1 && nextGt < lt) nextGt = html.indexOf(">", lt);
    // No ">" left: nothing after this point is a tag.
    if (nextGt === -1) {
      parts.push(html.slice(lt));
      break;
    }
    parts.push(" ");
    const rawText = RAW_TEXT_OPEN.exec(
      html.slice(lt, lt + 8),
    )?.[1]?.toLowerCase();
    if (rawText) {
      const close = RAW_TEXT_CLOSE[rawText]!;
      let at = nextClose[rawText] ?? -2;
      if (at !== -1 && at < lt) {
        close.lastIndex = lt;
        at = close.exec(html)?.index ?? -1;
        nextClose[rawText] = at;
      }
      if (at !== -1) {
        i = at + `</${rawText}>`.length;
        continue;
      }
    }
    // An ordinary tag, or a script/style that never closes.
    i = nextGt + 1;
  }
  return parts.join("");
}
