import type { getPayloadClient } from "@/server/payload";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";

type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>;

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function fetchWithLimits(
  url: string,
  maxBytes: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "aitcom-event-importer/1.0" },
    });
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      throw new Error("Response too large");
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch an event page's HTML behind the SSRF guard. Throws on a blocked host,
 * a failed request, or a non-HTML content type.
 */
export async function fetchEventPageHtml(url: string): Promise<string> {
  const guard = await validateWebhookUrl(url);
  if (!guard.ok) {
    throw new Error(`Refusing to fetch URL: ${guard.reason}`);
  }
  const res = await fetchWithLimits(url, MAX_HTML_BYTES);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("That link is not an HTML page");
  }
  const html = await res.text();
  return html.slice(0, MAX_HTML_BYTES);
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
    const guard = await validateWebhookUrl(url);
    if (!guard.ok) return null;

    const res = await fetchWithLimits(url, MAX_IMAGE_BYTES);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

    const extension = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
    const media = await payload.create({
      collection: "media",
      data: { alt },
      file: {
        data: buffer,
        name: `event-cover.${extension}`,
        mimetype: contentType.split(";")[0] ?? "image/jpeg",
        size: buffer.byteLength,
      },
    });
    return { id: media.id, url: media.url! };
  } catch {
    return null;
  }
}
