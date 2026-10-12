import { db } from "@/server/db";
import { newsItems } from "@/server/db/schema";

import { newsDraftsFromFeed } from "./draft";

/** Store feed rows the first time they are seen. Existing URLs are left as-is. */
export async function recordFeedNews(
  items: readonly Record<string, unknown>[],
): Promise<number> {
  const drafts = newsDraftsFromFeed(items);
  if (drafts.length === 0) return 0;
  await db
    .insert(newsItems)
    .values(
      drafts.map((draft) => ({
        url: draft.url,
        title: draft.title,
        author: draft.author,
        publishedAt: draft.publishedAt,
        summary: draft.summary,
      })),
    )
    .onConflictDoNothing({ target: newsItems.url });
  return drafts.length;
}
