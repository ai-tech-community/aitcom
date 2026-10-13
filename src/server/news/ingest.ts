import { newsDraftsFromFeed, type NewsDraft } from "./draft";
import type { NewsSummarizer } from "./summary";

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
  /** Rows for these URLs that still have no stored summary. */
  unsummarized(urls: readonly string[]): Promise<InsertedNews[]>;
  /** Precise directory links for rows inserted on this pass. */
  linkStartups?(
    rows: readonly (InsertedNews & { aiSummary: string | null })[],
  ): Promise<void>;
};

/**
 * Summaries are written when a row is stored, including a row whose first
 * attempt did not finish. A row that already has a summary is left alone.
 */
export async function ingestNewsItems(
  database: NewsIngestDb,
  items: readonly Record<string, unknown>[],
  summarize: NewsSummarizer,
): Promise<number> {
  const drafts = newsDraftsFromFeed(items);
  if (drafts.length === 0) return 0;
  const inserted = await database.insertNew(drafts);
  const pending = await database.unsummarized(drafts.map((draft) => draft.url));
  const written = new Map<string, string>();
  for (const row of pending) {
    let aiSummary: string | null = null;
    try {
      aiSummary = await summarize({ title: row.title, summary: row.summary });
    } catch (err) {
      console.error("news: summary failed for a new story", err);
    }
    if (aiSummary) {
      await database.saveSummary(row.id, aiSummary);
      written.set(row.id, aiSummary);
    }
  }
  if (database.linkStartups && inserted.length > 0) {
    await database.linkStartups(
      inserted.map((row) => ({
        ...row,
        aiSummary: written.get(row.id) ?? null,
      })),
    );
  }
  return inserted.length;
}
