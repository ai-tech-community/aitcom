import type { getPayloadClient } from "@/server/payload";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";
import { parseEventFromHtml } from "@/lib/event-link-import";
import type { EventFormat } from "@/lib/event-metadata";

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>;

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_OPTIONS = {
  userAgent: "aitcom-event-importer/1.0",
  timeoutMs: FETCH_TIMEOUT_MS,
};

/**
 * Fetch an event page's HTML behind the SSRF guard. Throws on a blocked host,
 * a failed request, or a non-HTML content type.
 */
export async function fetchEventPageHtml(url: string): Promise<string> {
  const { response: res } = await safeFetch(url, FETCH_OPTIONS);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("That link is not an HTML page");
  }
  const buf = await readBodyCapped(res, MAX_HTML_BYTES);
  return buf.toString("utf8");
}

/**
 * Download a remote image behind the SSRF guard and create a Payload media doc.
 * Returns the media id + url, or null on any failure (best-effort — a missing
 * cover image must never fail the whole import).
 */
export async function ingestRemoteImage(
  payload: PayloadClient,
  url: string,
  alt: string,
): Promise<{ id: number; url: string } | null> {
  try {
    const { response: res } = await safeFetch(url, FETCH_OPTIONS);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = await readBodyCapped(res, MAX_IMAGE_BYTES);
    const mimetype = contentType.split(";")[0] ?? "image/jpeg";
    const extension = mimetype.split("/")[1] ?? "jpg";
    const media = await payload.create({
      collection: "media",
      data: { alt },
      file: {
        data: buffer,
        name: `event-cover.${extension}`,
        mimetype,
        size: buffer.byteLength,
      },
    });
    return { id: media.id, url: media.url! };
  } catch {
    return null;
  }
}

/** Shape returned to the client form. All scalar fields null when unknown. */
export interface EventImportResult {
  title: string | null;
  summary: string | null;
  description: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  format: EventFormat | null;
  sourceUrl: string;
  coverImageId: number | null;
  coverImageUrl: string | null;
}

/**
 * Orchestrates a link import: fetch the page, parse it, ingest its cover image,
 * and shape the result for the form. Throws if the page cannot be fetched.
 * Creates a media doc (only) when a cover image is found — never an event.
 */
export async function runEventImport(
  url: string,
  payload: PayloadClient,
): Promise<EventImportResult> {
  const html = await fetchEventPageHtml(url);
  const parsed = parseEventFromHtml(html, url);

  let coverImage: { id: number; url: string } | null = null;
  if (parsed.coverImageUrl) {
    coverImage = await ingestRemoteImage(
      payload,
      parsed.coverImageUrl,
      parsed.title ?? "Event cover",
    );
  }

  return {
    title: parsed.title ?? null,
    summary: parsed.summary ?? null,
    description: parsed.description ?? null,
    date: parsed.date ?? null,
    startTime: parsed.startTime ?? null,
    endTime: parsed.endTime ?? null,
    location: parsed.location ?? null,
    city: parsed.city ?? null,
    country: parsed.country ?? null,
    format: parsed.format ?? null,
    sourceUrl: parsed.sourceUrl,
    coverImageId: coverImage?.id ?? null,
    coverImageUrl: coverImage?.url ?? null,
  };
}
