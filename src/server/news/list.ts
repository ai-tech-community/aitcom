import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/server/db";
import { escapeLike } from "@/server/db/escape-like";
import { newsItems } from "@/server/db/schema";

import { loadNewsItemAiFlags } from "./item-ai";

export type NewsListItem = {
  id: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  /** Feed description or excerpt. Not a generated line. */
  summary: string;
  /** TL;DR written at ingest from the feed text. Null until that write lands. */
  aiSummary: string | null;
  /**
   * True when the title and excerpt are about AI. False when they are not.
   * Null when the reading is unclear or the column is not there yet.
   */
  isAi?: boolean | null;
};

const newsListColumns = {
  id: newsItems.id,
  url: newsItems.url,
  title: newsItems.title,
  author: newsItems.author,
  publishedAt: newsItems.publishedAt,
  summary: newsItems.summary,
  aiSummary: newsItems.aiSummary,
};

/** Live issue references need one batch read, without the separate AI flags. */
export async function findNewsItemsByIds(
  ids: readonly string[],
  database: typeof db = db,
): Promise<Map<string, NewsListItem>> {
  if (ids.length === 0) return new Map();
  const rows = await database
    .select(newsListColumns)
    .from(newsItems)
    .where(inArray(newsItems.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Literal title search; an empty query offers the newest headlines. */
export async function searchNewsItems(
  query: string,
  limit: number,
  database: typeof db = db,
  exclude: readonly string[] = [],
): Promise<NewsListItem[]> {
  return database
    .select(newsListColumns)
    .from(newsItems)
    .where(
      and(
        query ? ilike(newsItems.title, `%${escapeLike(query)}%`) : undefined,
        exclude.length ? notInArray(newsItems.id, [...exclude]) : undefined,
      ),
    )
    .orderBy(
      sql`${newsItems.publishedAt} desc nulls last`,
      desc(newsItems.createdAt),
    )
    .limit(limit);
}

/** Topic matches published in the window, newest first, then id. */
export async function suggestNewsItems(
  input: {
    topics: readonly string[];
    since: Date;
    until: Date;
    limit: number;
    exclude: readonly string[];
  },
  database: typeof db = db,
): Promise<(NewsListItem & { matchedTopic: string })[]> {
  if (input.topics.length === 0 || input.limit <= 0) return [];
  const matches = input.topics.map((topic) => {
    const pattern = `%${escapeLike(topic)}%`;
    return or(
      ilike(newsItems.title, pattern),
      ilike(newsItems.summary, pattern),
    )!;
  });
  const matchedTopic = sql<string>`case ${sql.join(
    matches.map(
      (match, index) => sql`when ${match} then ${input.topics[index]}`,
    ),
    sql` `,
  )} end`;
  return database
    .select({ ...newsListColumns, matchedTopic })
    .from(newsItems)
    .where(
      and(
        gte(newsItems.publishedAt, input.since),
        lte(newsItems.publishedAt, input.until),
        or(...matches),
        input.exclude.length
          ? notInArray(newsItems.id, [...input.exclude])
          : undefined,
      ),
    )
    .orderBy(desc(newsItems.publishedAt), newsItems.id)
    .limit(input.limit);
}

async function withAiFlags(rows: NewsListItem[]): Promise<NewsListItem[]> {
  const flags = await loadNewsItemAiFlags(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    isAi: flags.has(row.id) ? flags.get(row.id)! : null,
  }));
}

export async function listNewsItems(limit = 50): Promise<NewsListItem[]> {
  const rows = await db
    .select(newsListColumns)
    .from(newsItems)
    .orderBy(
      sql`${newsItems.publishedAt} desc nulls last`,
      desc(newsItems.createdAt),
    )
    .limit(limit);
  return withAiFlags(rows);
}

export async function findNewsItem(id: string): Promise<NewsListItem | null> {
  const [row] = await db
    .select(newsListColumns)
    .from(newsItems)
    .where(eq(newsItems.id, id))
    .limit(1);
  if (!row) return null;
  const [tagged] = await withAiFlags([row]);
  return tagged ?? null;
}
