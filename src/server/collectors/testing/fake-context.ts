import { extractEvents } from "../extract/extract-events";
import type { CollectorContext } from "../collector";
import { toCollectorResponse } from "../context/collector-context";
import {
  extractListVia,
  extractTextVia,
  parseXmlVia,
  extractEventsVia,
  type PageExtractor,
} from "../context/extract-capability";
import { extractXml } from "../extract/extract-xml";
import { extractList, extractText } from "../extract/extract-list";

type FakePage = {
  /** Where the request landed after redirects; the requested URL if absent. */
  url?: string;
  status?: number;
  /** Text is sent as UTF-8; bytes as they are (to test other charsets). */
  body: string | Uint8Array;
  headers?: Record<string, string>;
};

/**
 * A CollectorContext that serves canned pages and records every request.
 * `extractList` runs the real pure extractor in-process (no worker), so
 * collector tests exercise real extraction and its refusals.
 */
export function fakeContext(pages: Record<string, FakePage>) {
  const requests: { url: string; accept?: string }[] = [];
  const logs: string[] = [];
  const signal = new AbortController().signal;
  const extractor: PageExtractor = {
    extract: async (html, spec) =>
      "kind" in spec
        ? spec.kind === "xml"
          ? extractXml(html)
          : spec.kind === "events"
            ? extractEvents(html, spec)
            : extractText(html, spec)
        : extractList(html, spec),
  };
  const clock = { isOver: () => signal.aborted };
  const ctx: CollectorContext = {
    signal,
    log: (message) => {
      logs.push(message);
    },
    extractList: extractListVia(extractor, clock),
    extractText: extractTextVia(extractor, clock),
    extractEvents: extractEventsVia(extractor, clock),
    parseXml: parseXmlVia(extractor, clock),
    async fetch(url, opts) {
      requests.push({ url, accept: opts?.accept });
      const page = pages[url];
      if (!page) throw new Error(`unexpected request ${url}`);
      return toCollectorResponse({
        url: page.url ?? url,
        status: page.status ?? 200,
        headers: new Headers(page.headers),
        body: Buffer.from(page.body),
      });
    },
  };
  return { ctx, requests, logs };
}

export async function collectAll<R>(rows: AsyncIterable<R>): Promise<R[]> {
  const out: R[] = [];
  for await (const row of rows) out.push(row);
  return out;
}
