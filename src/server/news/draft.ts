export type NewsDraft = {
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  summary: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Canonical article URL. Fragments are not part of the identity. */
export function newsArticleUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  return url.toString();
}

export function newsDraftFromFeed(
  item: Record<string, unknown>,
): NewsDraft | null {
  const url = newsArticleUrl(item.url);
  const title = text(item.title);
  if (!url || !title) return null;
  const publishedRaw = text(item.publishedAt);
  const publishedAt = publishedRaw ? new Date(publishedRaw) : null;
  const author = text(item.author);
  return {
    url,
    title,
    author: author.length > 0 ? author : null,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    summary: text(item.summary),
  };
}

/** First write wins. A repeated URL in one batch is stored once. */
export function newsDraftsFromFeed(
  items: readonly Record<string, unknown>[],
): NewsDraft[] {
  const byUrl = new Map<string, NewsDraft>();
  for (const item of items) {
    const draft = newsDraftFromFeed(item);
    if (!draft || byUrl.has(draft.url)) continue;
    byUrl.set(draft.url, draft);
  }
  return [...byUrl.values()];
}
