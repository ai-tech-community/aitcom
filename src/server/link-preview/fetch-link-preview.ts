import { parseLinkPreview, type LinkPreviewMeta } from "@/lib/link-preview";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";

/** Previews are built while a post saves, so the budget stays short. */
const PREVIEW_TIMEOUT_MS = 4000;
/** Preview tags live in <head>; the start of the page is enough. */
const MAX_HTML_BYTES = 512 * 1024;
const USER_AGENT = "aitcom-link-preview/1.0 (+https://aitcommunity.org)";

export type LinkPreviewFetcher = (
  url: string,
) => Promise<LinkPreviewMeta | null>;

/**
 * Fetch a page behind the SSRF guard and read its preview tags. Best-effort:
 * returns null for a blocked host, a failed or slow request, or a response
 * that isn't HTML. A missing preview must never fail the post.
 */
export const fetchLinkPreview: LinkPreviewFetcher = async (url) => {
  try {
    const { response, url: finalUrl } = await safeFetch(url, {
      userAgent: USER_AGENT,
      timeoutMs: PREVIEW_TIMEOUT_MS,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      await response.body?.cancel();
      return null;
    }
    const html = await readBodyCapped(response, MAX_HTML_BYTES, {
      truncate: true,
    });
    return parseLinkPreview(html.toString("utf8"), finalUrl);
  } catch {
    return null;
  }
};
