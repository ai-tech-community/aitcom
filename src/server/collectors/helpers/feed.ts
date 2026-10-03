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
  const stripped = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10));
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
