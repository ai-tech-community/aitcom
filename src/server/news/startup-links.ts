import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  matchNewsStartups,
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
): Promise<void> {
  if (pairs.length === 0) return;
  await db.insert(newsItemStartups).values(pairs).onConflictDoNothing();
}

async function insertRumorLinks(
  pairs: { newsRumorId: string; startupId: string }[],
): Promise<void> {
  if (pairs.length === 0) return;
  await db.insert(newsRumorStartups).values(pairs).onConflictDoNothing();
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
  const pairs = rows.flatMap((row) =>
    matchNewsStartups(
      {
        title: row.title,
        text: `${row.summary}\n${row.aiSummary ?? ""}`,
        url: row.url,
      },
      directory,
    ).map((startup) => ({ newsItemId: row.id, startupId: startup.id })),
  );
  await insertItemLinks(pairs);
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
  const pairs = matchNewsStartups(
    { title: row.title, text: row.body, url: row.url },
    directory,
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
