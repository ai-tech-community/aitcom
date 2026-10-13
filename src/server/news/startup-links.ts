import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import {
  indexNewsStartups,
  matchIndexedNewsStartups,
  type NewsStartupLink,
  type NewsStartupRef,
  type StartupNewsMention,
} from "@/lib/news/startup-match";
import { newsSourceFromUrl } from "@/lib/news/table";
import { db } from "@/server/db";
import {
  newsItems,
  newsItemStartups,
  newsRumors,
  newsRumorStartups,
  startups,
} from "@/server/db/schema";

const MENTION_LIMIT = 8;

/** Rows matched per insert. The cron walks the tables in these chunks. */
export const NEWS_STARTUP_LINK_BATCH = 200;

export type NewsStartupBackfill = {
  stories: number;
  rumors: number;
  storyLinks: number;
  rumorLinks: number;
};

export type { StartupNewsMention };

export async function listMatchableStartups(): Promise<NewsStartupRef[]> {
  return db
    .select({
      id: startups.id,
      slug: startups.slug,
      name: startups.name,
      homepage: startups.homepage,
    })
    .from(startups)
    .where(eq(startups.status, "approved"));
}

async function insertItemLinks(
  pairs: { newsItemId: string; startupId: string }[],
): Promise<number> {
  if (pairs.length === 0) return 0;
  const inserted = await db
    .insert(newsItemStartups)
    .values(pairs)
    .onConflictDoNothing()
    .returning({ newsItemId: newsItemStartups.newsItemId });
  return inserted.length;
}

async function insertRumorLinks(
  pairs: { newsRumorId: string; startupId: string }[],
): Promise<number> {
  if (pairs.length === 0) return 0;
  const inserted = await db
    .insert(newsRumorStartups)
    .values(pairs)
    .onConflictDoNothing()
    .returning({ newsRumorId: newsRumorStartups.newsRumorId });
  return inserted.length;
}

/** Store precise startup matches for rows just ingested. */
export async function linkIngestedNewsItems(
  rows: readonly {
    id: string;
    url: string;
    title: string;
    summary: string;
    aiSummary?: string | null;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const directory = await listMatchableStartups();
  if (directory.length === 0) return;
  const indexed = indexNewsStartups(directory);
  const pairs = rows.flatMap((row) =>
    matchIndexedNewsStartups(
      {
        title: row.title,
        text: `${row.summary}\n${row.aiSummary ?? ""}`,
        url: row.url,
      },
      indexed,
    ).map((startup) => ({ newsItemId: row.id, startupId: startup.id })),
  );
  await insertItemLinks(pairs);
}

/**
 * Link existing news rows and rumors to directory startups.
 * Idempotent: a pair already stored is left in place. One pass indexes the
 * directory once, then reads and writes in batches so this stays off the
 * deploy path.
 */
export async function backfillNewsStartupLinks(): Promise<NewsStartupBackfill> {
  const indexed = indexNewsStartups(await listMatchableStartups());
  if (indexed.length === 0) {
    return { stories: 0, rumors: 0, storyLinks: 0, rumorLinks: 0 };
  }

  let stories = 0;
  let storyLinks = 0;
  let afterStory: string | null = null;
  for (;;) {
    const storyColumns = {
      id: newsItems.id,
      url: newsItems.url,
      title: newsItems.title,
      summary: newsItems.summary,
      aiSummary: newsItems.aiSummary,
    };
    const rows: {
      id: string;
      url: string;
      title: string;
      summary: string;
      aiSummary: string | null;
    }[] = afterStory
      ? await db
          .select(storyColumns)
          .from(newsItems)
          .where(gt(newsItems.id, afterStory))
          .orderBy(asc(newsItems.id))
          .limit(NEWS_STARTUP_LINK_BATCH)
      : await db
          .select(storyColumns)
          .from(newsItems)
          .orderBy(asc(newsItems.id))
          .limit(NEWS_STARTUP_LINK_BATCH);
    if (rows.length === 0) break;
    stories += rows.length;
    afterStory = rows[rows.length - 1]?.id ?? afterStory;
    storyLinks += await insertItemLinks(
      rows.flatMap((row) =>
        matchIndexedNewsStartups(
          {
            title: row.title,
            text: `${row.summary}\n${row.aiSummary ?? ""}`,
            url: row.url,
          },
          indexed,
        ).map((startup) => ({ newsItemId: row.id, startupId: startup.id })),
      ),
    );
    if (rows.length < NEWS_STARTUP_LINK_BATCH) break;
  }

  let rumors = 0;
  let rumorLinks = 0;
  let afterRumor: string | null = null;
  for (;;) {
    const rumorColumns = {
      id: newsRumors.id,
      title: newsRumors.title,
      body: newsRumors.body,
      url: newsRumors.url,
    };
    const rows: {
      id: string;
      title: string;
      body: string;
      url: string | null;
    }[] = afterRumor
      ? await db
          .select(rumorColumns)
          .from(newsRumors)
          .where(gt(newsRumors.id, afterRumor))
          .orderBy(asc(newsRumors.id))
          .limit(NEWS_STARTUP_LINK_BATCH)
      : await db
          .select(rumorColumns)
          .from(newsRumors)
          .orderBy(asc(newsRumors.id))
          .limit(NEWS_STARTUP_LINK_BATCH);
    if (rows.length === 0) break;
    rumors += rows.length;
    afterRumor = rows[rows.length - 1]?.id ?? afterRumor;
    rumorLinks += await insertRumorLinks(
      rows.flatMap((row) =>
        matchIndexedNewsStartups(
          { title: row.title, text: row.body, url: row.url },
          indexed,
        ).map((startup) => ({ newsRumorId: row.id, startupId: startup.id })),
      ),
    );
    if (rows.length < NEWS_STARTUP_LINK_BATCH) break;
  }

  return { stories, rumors, storyLinks, rumorLinks };
}

/** Store precise startup matches for a rumor that was just submitted. */
export async function linkSubmittedRumor(row: {
  id: string;
  title: string;
  body: string;
  url: string | null;
}): Promise<void> {
  const directory = await listMatchableStartups();
  if (directory.length === 0) return;
  const pairs = matchIndexedNewsStartups(
    { title: row.title, text: row.body, url: row.url },
    indexNewsStartups(directory),
  ).map((startup) => ({ newsRumorId: row.id, startupId: startup.id }));
  await insertRumorLinks(pairs);
}

function groupLinks(
  rows: {
    ownerId: string;
    id: string;
    slug: string;
    name: string;
    homepage: string;
    logoUrl: string | null;
  }[],
): Record<string, NewsStartupLink[]> {
  const grouped: Record<string, NewsStartupLink[]> = {};
  for (const row of rows) {
    const link: NewsStartupLink = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      homepage: row.homepage,
      logoUrl: row.logoUrl,
    };
    const list = grouped[row.ownerId] ?? [];
    list.push(link);
    grouped[row.ownerId] = list;
  }
  return grouped;
}

/** Stored startup matches for the rows on the news table. */
export async function listNewsStartupLinks(ids: {
  itemIds: readonly string[];
  rumorIds: readonly string[];
}): Promise<{
  stories: Record<string, NewsStartupLink[]>;
  rumors: Record<string, NewsStartupLink[]>;
}> {
  const [storyRows, rumorRows] = await Promise.all([
    ids.itemIds.length === 0
      ? []
      : db
          .select({
            ownerId: newsItemStartups.newsItemId,
            id: startups.id,
            slug: startups.slug,
            name: startups.name,
            homepage: startups.homepage,
            logoUrl: startups.logoUrl,
          })
          .from(newsItemStartups)
          .innerJoin(startups, eq(startups.id, newsItemStartups.startupId))
          .where(
            and(
              inArray(newsItemStartups.newsItemId, [...ids.itemIds]),
              eq(startups.status, "approved"),
            ),
          ),
    ids.rumorIds.length === 0
      ? []
      : db
          .select({
            ownerId: newsRumorStartups.newsRumorId,
            id: startups.id,
            slug: startups.slug,
            name: startups.name,
            homepage: startups.homepage,
            logoUrl: startups.logoUrl,
          })
          .from(newsRumorStartups)
          .innerJoin(startups, eq(startups.id, newsRumorStartups.startupId))
          .where(
            and(
              inArray(newsRumorStartups.newsRumorId, [...ids.rumorIds]),
              eq(startups.status, "approved"),
            ),
          ),
  ]);
  return {
    stories: groupLinks(storyRows),
    rumors: groupLinks(rumorRows),
  };
}

/** Recent stored matches for one startup profile. Hidden rumors stay out. */
export async function listStartupNewsMentions(
  startupId: string,
): Promise<StartupNewsMention[]> {
  const [stories, rumors] = await Promise.all([
    db
      .select({
        id: newsItems.id,
        title: newsItems.title,
        url: newsItems.url,
        publishedAt: newsItems.publishedAt,
        createdAt: newsItems.createdAt,
      })
      .from(newsItemStartups)
      .innerJoin(newsItems, eq(newsItems.id, newsItemStartups.newsItemId))
      .where(eq(newsItemStartups.startupId, startupId))
      .orderBy(desc(newsItems.publishedAt), desc(newsItems.createdAt))
      .limit(MENTION_LIMIT),
    db
      .select({
        id: newsRumors.id,
        title: newsRumors.title,
        url: newsRumors.url,
        submitterName: newsRumors.submitterName,
        createdAt: newsRumors.createdAt,
      })
      .from(newsRumorStartups)
      .innerJoin(newsRumors, eq(newsRumors.id, newsRumorStartups.newsRumorId))
      .where(
        and(
          eq(newsRumorStartups.startupId, startupId),
          isNull(newsRumors.hiddenAt),
        ),
      )
      .orderBy(desc(newsRumors.createdAt))
      .limit(MENTION_LIMIT),
  ]);

  const mentions: Array<StartupNewsMention & { sort: number }> = [
    ...stories.map((row) => {
      const at = row.publishedAt ?? row.createdAt;
      return {
        kind: "story" as const,
        id: row.id,
        title: row.title,
        href: row.url,
        source: newsSourceFromUrl(row.url).label || row.url,
        at: at ? at.toISOString() : null,
        sort: at ? at.getTime() : 0,
      };
    }),
    ...rumors.map((row) => ({
      kind: "rumor" as const,
      id: row.id,
      title: row.title,
      href: row.url ?? `/news#rumor-${row.id}`,
      source: row.submitterName,
      at: row.createdAt.toISOString(),
      sort: row.createdAt.getTime(),
    })),
  ];
  return mentions
    .sort((a, b) => b.sort - a.sort)
    .slice(0, MENTION_LIMIT)
    .map(({ sort: _sort, ...mention }) => mention);
}
