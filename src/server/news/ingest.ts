import { newsDraftsFromFeed, type NewsDraft } from "./draft";
import { clampNewsSummary, type NewsSummarizer } from "./summary";

export type InsertedNews = {
  id: string;
  url: string;
  title: string;
  summary: string;
};

export type NewsIngestDb = {
  /** Inserts unseen URLs and returns only the rows that were new. */
  insertNew(
    rows: Array<
      Pick<NewsDraft, "url" | "title" | "author" | "publishedAt" | "summary">
    >,
  ): Promise<InsertedNews[]>;
  saveSummary(id: string, aiSummary: string): Promise<void>;
};

/** Summaries are written for rows inserted now, never for rows already stored. */
export async function ingestNewsItems(
  database: NewsIngestDb,
  items: readonly Record<string, unknown>[],
  summarize: NewsSummarizer,
): Promise<number> {
  const drafts = newsDraftsFromFeed(items);
  if (drafts.length === 0) return 0;
  const inserted = await database.insertNew(drafts);
  for (const row of inserted) {
    let aiSummary: string;
    try {
      aiSummary = await summarize({ title: row.title, summary: row.summary });
    } catch (err) {
      console.error("news: summary failed for a new story", err);
      const fallback = row.summary.trim();
      aiSummary = clampNewsSummary(fallback.length > 0 ? fallback : row.title);
    }
    await database.saveSummary(row.id, aiSummary);
  }
  return inserted.length;
}
