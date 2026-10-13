import { parseFeed, NotAFeedError } from "@/server/collectors/helpers/feed";

import { newsArticleUrl } from "./draft";

const TITLE_MAX = 300;
const SOURCE_MAX = 160;
const SUMMARY_MAX = 4_000;
const NAME_MAX = 120;

export type SubmitNewsInput = {
  url?: unknown;
  title?: unknown;
  source?: unknown;
  published_at?: unknown;
  summary?: unknown;
};

export type SubmitNewsResult =
  | { ok: true; inserted: boolean; url: string }
  | { ok: false; status: 400 | 422; error: string };

function text(value: unknown, max: number): string {
  return (typeof value === "string" ? value : "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

/**
 * Store one verified story a bot already read. The summary is the caller's
 * source text; this does not invent one. A repeated URL is not stored again.
 */
export async function submitVerifiedNewsItem(
  input: SubmitNewsInput,
  deps: {
    resolveUrl: (url: string) => Promise<boolean>;
    record: (items: readonly Record<string, unknown>[]) => Promise<number>;
  },
): Promise<SubmitNewsResult> {
  const url = newsArticleUrl(input.url);
  if (!url?.startsWith("https://")) {
    return { ok: false, status: 400, error: "url must be an https URL." };
  }
  const title = text(input.title, TITLE_MAX);
  if (!title) return { ok: false, status: 400, error: "title is required." };
  const source = text(input.source, SOURCE_MAX);
  if (!source) return { ok: false, status: 400, error: "source is required." };
  const summary = text(input.summary, SUMMARY_MAX);
  if (!summary) {
    return {
      ok: false,
      status: 400,
      error: "summary is required and must be the source's own text.",
    };
  }
  const publishedRaw =
    typeof input.published_at === "string" ? input.published_at.trim() : "";
  const publishedAt = new Date(publishedRaw);
  if (!publishedRaw || Number.isNaN(publishedAt.getTime())) {
    return {
      ok: false,
      status: 400,
      error: "published_at must be an ISO 8601 date.",
    };
  }
  const resolves = await deps.resolveUrl(url);
  if (!resolves) {
    return { ok: false, status: 422, error: "url did not resolve." };
  }
  const inserted = await deps.record([
    {
      url,
      title,
      author: source,
      publishedAt: publishedAt.toISOString(),
      summary,
    },
  ]);
  return { ok: true, inserted: inserted > 0, url };
}

export type AddFeedResult =
  | { ok: true; inserted: boolean; name: string; url: string }
  | { ok: false; status: 400 | 422; error: string };

/** Add a feed after checking that it returns RSS or Atom. Duplicate URLs stay as they are. */
export async function addVerifiedNewsFeed(
  input: { name?: unknown; url?: unknown },
  deps: {
    fetchXml: (url: string) => Promise<string>;
    insert: (feed: {
      name: string;
      url: string;
    }) => Promise<"inserted" | "duplicate">;
  },
): Promise<AddFeedResult> {
  const name = text(input.name, NAME_MAX);
  if (!name) return { ok: false, status: 400, error: "name is required." };
  const url = newsArticleUrl(input.url);
  if (!url?.startsWith("https://")) {
    return { ok: false, status: 400, error: "url must be an https URL." };
  }
  try {
    const xml = await deps.fetchXml(url);
    const entries = parseFeed(xml, url).filter(
      (entry) => entry.url && entry.title,
    );
    if (entries.length === 0) {
      return { ok: false, status: 422, error: "The feed has no stories." };
    }
  } catch (err) {
    const error =
      err instanceof NotAFeedError
        ? "Not an RSS or Atom feed."
        : "The feed could not be read.";
    return { ok: false, status: 422, error };
  }
  const outcome = await deps.insert({ name, url });
  return { ok: true, inserted: outcome === "inserted", name, url };
}

export async function newsUrlResolves(url: string): Promise<boolean> {
  const { safeFetch } = await import("@/server/net/safe-fetch");
  const { releaseBody } = await import("@/server/net/pinned-transport");
  try {
    const { response } = await safeFetch(url, {
      userAgent: "AIT-news-submit",
      timeoutMs: 12_000,
      accept: "text/html,application/xhtml+xml,*/*;q=0.5",
      allowErrorStatus: true,
    });
    const ok = response.status >= 200 && response.status < 300;
    await releaseBody(response);
    return ok;
  } catch {
    return false;
  }
}

export async function submitConfiguredNewsItem(
  input: SubmitNewsInput,
): Promise<SubmitNewsResult> {
  const { recordFeedNews } = await import("./record");
  return submitVerifiedNewsItem(input, {
    resolveUrl: newsUrlResolves,
    record: (items) =>
      recordFeedNews(items, {
        summaryDeadline: Date.now() + 20_000,
      }),
  });
}

export async function addConfiguredNewsFeed(input: {
  name?: unknown;
  url?: unknown;
}): Promise<AddFeedResult> {
  const { fetchFeedXml } = await import("./ingest-feeds");
  const { insertNewsFeed } = await import("./catalog");
  return addVerifiedNewsFeed(input, {
    fetchXml: fetchFeedXml,
    insert: insertNewsFeed,
  });
}
