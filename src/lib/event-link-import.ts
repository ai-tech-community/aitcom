import type { EVENT_FORMAT_OPTIONS } from "@/lib/event-metadata";

type EventFormat = (typeof EVENT_FORMAT_OPTIONS)[number];

export interface ParsedEventImport {
  title?: string;
  summary?: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  location?: string;
  city?: string;
  country?: string;
  format?: EventFormat;
  coverImageUrl?: string;
  sourceUrl: string;
}

/** Resolve a possibly-relative URL against the page's source URL. */
function resolveUrl(raw: string | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, base).href;
  } catch {
    return undefined;
  }
}

/** Pull the raw text of every <script type="application/ld+json"> block. */
function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) blocks.push(m[1].trim());
  }
  return blocks;
}

/** Walk parsed JSON-LD (object, array, or @graph) and return the first Event. */
function findEventNode(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const isEvent = Array.isArray(type)
      ? type.some((t) => String(t).includes("Event"))
      : typeof type === "string" && type.includes("Event");
    if (isEvent) return obj;
    if (Array.isArray(obj["@graph"])) return findEventNode(obj["@graph"]);
  }
  return null;
}

function findEventInBlocks(blocks: string[]): Record<string, unknown> | null {
  for (const raw of blocks) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const event = findEventNode(parsed);
      if (event) return event;
    } catch {
      // Malformed JSON-LD — skip this block.
    }
  }
  return null;
}

/** Split an ISO-ish datetime ("2026-06-12T18:00:00+02:00") into date + HH:MM. */
function splitDateTime(value: unknown): { date?: string; time?: string } {
  if (typeof value !== "string") return {};
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value.trim());
  if (!m) return {};
  return { date: m[1], time: m[2] };
}

function attendanceToFormat(value: unknown): EventFormat | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.toLowerCase();
  if (s.includes("online")) return "online";
  if (s.includes("offline")) return "in-person";
  if (s.includes("mixed")) return "hybrid";
  return undefined;
}

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** schema.org image can be a string, an array, or an ImageObject. */
function firstImageUrl(value: unknown): string | undefined {
  if (typeof value === "string") return str(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstImageUrl(item);
      if (url) return url;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    return str((value as Record<string, unknown>).url);
  }
  return undefined;
}

function fromJsonLd(
  event: Record<string, unknown>,
  result: ParsedEventImport,
): void {
  result.title = str(event.name);
  result.description = str(event.description);
  const start = splitDateTime(event.startDate);
  result.date = start.date;
  result.startTime = start.time;
  result.endTime = splitDateTime(event.endDate).time;
  result.format = attendanceToFormat(event.eventAttendanceMode);
  result.coverImageUrl = firstImageUrl(event.image);

  const location = event.location;
  if (location && typeof location === "object") {
    const loc = location as Record<string, unknown>;
    result.location = str(loc.name);
    const address = loc.address;
    if (address && typeof address === "object") {
      const addr = address as Record<string, unknown>;
      result.city = str(addr.addressLocality);
      result.country = str(addr.addressCountry);
      result.location ??= str(addr.streetAddress);
    }
  }
}

/** Read <meta property="og:x" content="y"> (property or name attribute). */
function readMeta(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = re.exec(html);
  if (m?.[1]) return decodeHtmlEntities(m[1].trim()) || undefined;
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m2 = re2.exec(html);
  return m2?.[1] ? decodeHtmlEntities(m2[1].trim()) || undefined : undefined;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function applyOpenGraphFallback(html: string, result: ParsedEventImport): void {
  result.title ??= readMeta(html, "og:title");
  result.description ??= readMeta(html, "og:description");
  result.coverImageUrl ??= readMeta(html, "og:image");
}

/**
 * Parse an event from a fetched HTML document. Best-effort: every field is
 * optional except `sourceUrl`. Prefers schema.org Event JSON-LD; falls back to
 * OpenGraph meta tags for anything still missing.
 */
export function parseEventFromHtml(
  html: string,
  sourceUrl: string,
): ParsedEventImport {
  const result: ParsedEventImport = { sourceUrl };

  const event = findEventInBlocks(extractJsonLdBlocks(html));
  if (event) fromJsonLd(event, result);

  applyOpenGraphFallback(html, result);

  result.coverImageUrl = resolveUrl(result.coverImageUrl, sourceUrl);

  result.summary ??= result.description;

  return result;
}
