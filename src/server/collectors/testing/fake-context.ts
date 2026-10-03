import type { CollectorContext } from "../collector";

type FakePage = {
  status?: number;
  body: string;
  headers?: Record<string, string>;
};

/** A CollectorContext that serves canned pages and records every request. */
export function fakeContext(pages: Record<string, FakePage>) {
  const requests: { url: string; accept?: string }[] = [];
  const logs: string[] = [];
  const ctx: CollectorContext = {
    signal: new AbortController().signal,
    log: (message) => {
      logs.push(message);
    },
    async fetch(url, opts) {
      requests.push({ url, accept: opts?.accept });
      const page = pages[url];
      if (!page) throw new Error(`unexpected request ${url}`);
      return {
        url,
        status: page.status ?? 200,
        headers: new Headers(page.headers),
        text: async () => page.body,
        json: async () => JSON.parse(page.body) as unknown,
      };
    },
  };
  return { ctx, requests, logs };
}

export async function collectAll<R>(rows: AsyncIterable<R>): Promise<R[]> {
  const out: R[] = [];
  for await (const row of rows) out.push(row);
  return out;
}
