import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import {
  DEFAULT_NEWS_SECTOR,
  catalogHasRealFeeds,
  newsSectorOrDefault,
  parseNewsSector,
  type NewsSector,
} from "@/lib/news/sectors";
import { communities } from "@/server/db/schema";
import { NEWS_FEEDS } from "@/server/news/feeds";

/** One cron pass. A larger table finishes over later runs. */
export const NEWS_SECTOR_BACKFILL_BATCH = 1000;

export type NewsSectorBackfill = {
  communities: number;
  feeds: number;
  items: number;
  remainingCommunities: number;
  remainingFeeds: number;
  remainingItems: number;
};

export type CommunityNewsStory = {
  id: string;
  url: string;
  title: string;
  publishedAt: string | null;
};

export type CommunityNewsView = {
  sector: NewsSector;
  hasRealFeeds: boolean;
  stories: CommunityNewsStory[];
};

type SqlDb = {
  execute: (query: SQL) => Promise<unknown>;
};

async function defaultDb(): Promise<SqlDb> {
  const { db } = await import("@/server/db");
  return db;
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const record = error as { message?: unknown; cause?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return `${message}\n${errorText(record.cause)}`;
}

/** Preview builds skip migrations, so the sector table or column may be absent. */
export function isMissingNewsSectorSchema(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes("community_news_sector") ||
    /column ["']?sector["']? does not exist/i.test(text) ||
    text.includes("news_item_sector_idx")
  );
}

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }
  return [];
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

function batchSize(batch: number): number {
  return Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
}

/**
 * Writes AI for communities, feeds, and stories that have no sector yet.
 * A row that already has a sector is left alone, so the job can run again.
 */
export async function backfillNewsSectorDefaults(
  batch: number = NEWS_SECTOR_BACKFILL_BATCH,
  database?: SqlDb,
): Promise<NewsSectorBackfill> {
  const sqlDb = database ?? (await defaultDb());
  const size = batchSize(batch);
  const communitiesResult = await sqlDb.execute(sql`
    WITH pending AS (
      SELECT c."id"
      FROM "app"."community" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "app"."community_news_sector" s
        WHERE s."community_id" = c."id"
      )
      ORDER BY c."id"
      LIMIT ${size}
    )
    INSERT INTO "app"."community_news_sector" ("community_id", "sector")
    SELECT "id", 'ai' FROM pending
    ON CONFLICT ("community_id") DO NOTHING
    RETURNING "community_id"
  `);
  const nullSectors = await sqlDb.execute(sql`
    UPDATE "app"."community_news_sector"
    SET "sector" = 'ai'
    WHERE "community_id" IN (
      SELECT "community_id"
      FROM "app"."community_news_sector"
      WHERE "sector" IS NULL
      ORDER BY "community_id"
      LIMIT ${size}
    )
    RETURNING "community_id"
  `);
  const feeds = await sqlDb.execute(sql`
    UPDATE "app"."news_feed"
    SET "sector" = 'ai'
    WHERE "id" IN (
      SELECT "id" FROM "app"."news_feed"
      WHERE "sector" IS NULL
      ORDER BY "id"
      LIMIT ${size}
    )
    RETURNING "id"
  `);
  const items = await sqlDb.execute(sql`
    UPDATE "app"."news_item"
    SET "sector" = 'ai'
    WHERE "id" IN (
      SELECT "id" FROM "app"."news_item"
      WHERE "sector" IS NULL
      ORDER BY "id"
      LIMIT ${size}
    )
    RETURNING "id"
  `);
  const [remainingCommunities, remainingFeeds, remainingItems] =
    await Promise.all([
      sqlDb.execute(sql`
        SELECT count(*)::int AS total
        FROM "app"."community" c
        WHERE NOT EXISTS (
          SELECT 1 FROM "app"."community_news_sector" s
          WHERE s."community_id" = c."id" AND s."sector" IS NOT NULL
        )
      `),
      sqlDb.execute(sql`
        SELECT count(*)::int AS total
        FROM "app"."news_feed"
        WHERE "sector" IS NULL
      `),
      sqlDb.execute(sql`
        SELECT count(*)::int AS total
        FROM "app"."news_item"
        WHERE "sector" IS NULL
      `),
    ]);
  return {
    communities: asRows(communitiesResult).length + asRows(nullSectors).length,
    feeds: asRows(feeds).length,
    items: asRows(items).length,
    remainingCommunities: asCount(asRows(remainingCommunities)[0]?.total),
    remainingFeeds: asCount(asRows(remainingFeeds)[0]?.total),
    remainingItems: asCount(asRows(remainingItems)[0]?.total),
  };
}

/** Missing row, null, or a database that has not migrated yet all read as AI. */
export async function readCommunityNewsSector(
  database: SqlDb,
  communityId: string,
): Promise<NewsSector> {
  try {
    const result = await database.execute(sql`
      SELECT "sector"
      FROM "app"."community_news_sector"
      WHERE "community_id" = ${communityId}
      LIMIT 1
    `);
    return newsSectorOrDefault(asRows(result)[0]?.sector);
  } catch (error) {
    if (!isMissingNewsSectorSchema(error)) throw error;
    return DEFAULT_NEWS_SECTOR;
  }
}

export async function writeCommunityNewsSector(
  database: SqlDb,
  communityId: string,
  sector: NewsSector,
): Promise<void> {
  await database.execute(sql`
    INSERT INTO "app"."community_news_sector" ("community_id", "sector")
    VALUES (${communityId}, ${sector})
    ON CONFLICT ("community_id") DO UPDATE
    SET "sector" = EXCLUDED."sector"
  `);
}

/** Tag a feed row. A missing column leaves it for the cron. */
export async function assignNewsFeedSector(
  url: string,
  sector: NewsSector,
  database?: SqlDb,
): Promise<void> {
  database ??= await defaultDb();
  try {
    await database.execute(sql`
      UPDATE "app"."news_feed"
      SET "sector" = ${sector}
      WHERE "url" = ${url}
    `);
  } catch (error) {
    if (!isMissingNewsSectorSchema(error)) throw error;
  }
}

/** Tag stories just stored from a feed. A missing column leaves them for the cron. */
export async function assignNewsItemSectors(
  groups: ReadonlyArray<{ sector: NewsSector; urls: readonly string[] }>,
  database?: SqlDb,
): Promise<void> {
  database ??= await defaultDb();
  for (const group of groups) {
    const urls = [
      ...new Set(group.urls.filter((url) => url.startsWith("https://"))),
    ];
    if (urls.length === 0) continue;
    try {
      await database.execute(sql`
        UPDATE "app"."news_item"
        SET "sector" = ${group.sector}
        WHERE "url" IN (${sql.join(
          urls.map((url) => sql`${url}`),
          sql`, `,
        )})
      `);
    } catch (error) {
      if (!isMissingNewsSectorSchema(error)) throw error;
    }
  }
}

function sectorPredicate(sector: NewsSector): SQL {
  if (sector === "ai") return sql`("sector" = 'ai' OR "sector" IS NULL)`;
  return sql`"sector" = ${sector}`;
}

/**
 * Enabled feeds that actually exist. The built-in list is AI. A sector with
 * no row here has no real feed, and its pages stay empty.
 */
export async function sectorsWithRealFeeds(
  database?: SqlDb,
): Promise<Set<NewsSector>> {
  database ??= await defaultDb();
  const sectors = new Set<NewsSector>();
  if (NEWS_FEEDS.length > 0 && catalogHasRealFeeds("ai")) sectors.add("ai");
  try {
    const result = await database.execute(sql`
      SELECT DISTINCT "sector" AS sector
      FROM "app"."news_feed"
      WHERE "enabled" = true AND "sector" IS NOT NULL
    `);
    for (const row of asRows(result)) {
      const sector = parseNewsSector(row.sector);
      if (sector) sectors.add(sector);
    }
  } catch (error) {
    if (!isMissingNewsSectorSchema(error)) throw error;
  }
  return sectors;
}

export async function sectorHasRealStories(
  sector: NewsSector,
  database?: SqlDb,
): Promise<boolean> {
  database ??= await defaultDb();
  const feeds = await sectorsWithRealFeeds(database);
  if (!feeds.has(sector)) return false;
  try {
    const result = await database.execute(sql`
      SELECT 1
      FROM "app"."news_item"
      WHERE btrim("title") <> ''
        AND "url" LIKE 'https://%'
        AND ${sectorPredicate(sector)}
      LIMIT 1
    `);
    return asRows(result).length > 0;
  } catch (error) {
    if (!isMissingNewsSectorSchema(error)) throw error;
    if (sector !== "ai") return false;
    const result = await database.execute(sql`
      SELECT 1
      FROM "app"."news_item"
      WHERE btrim("title") <> ''
        AND "url" LIKE 'https://%'
      LIMIT 1
    `);
    return asRows(result).length > 0;
  }
}

function mapStories(result: unknown): CommunityNewsStory[] {
  const stories: CommunityNewsStory[] = [];
  for (const row of asRows(result)) {
    const id = typeof row.id === "string" ? row.id : "";
    const url = typeof row.url === "string" ? row.url : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!id || !title || !url.startsWith("https://")) continue;
    const published = row.published_at;
    const publishedAt =
      published instanceof Date
        ? published.toISOString()
        : typeof published === "string" && published
          ? new Date(published).toISOString()
          : null;
    stories.push({
      id,
      url,
      title,
      publishedAt:
        publishedAt && !Number.isNaN(Date.parse(publishedAt))
          ? publishedAt
          : null,
    });
  }
  return stories;
}

async function selectSectorStories(
  database: SqlDb,
  sector: NewsSector,
  limit: number,
): Promise<CommunityNewsStory[]> {
  const result = await database.execute(sql`
    SELECT "id", "url", "title", "published_at"
    FROM "app"."news_item"
    WHERE btrim("title") <> ''
      AND "url" LIKE 'https://%'
      AND ${sectorPredicate(sector)}
    ORDER BY "published_at" DESC NULLS LAST, "created_at" DESC
    LIMIT ${limit}
  `);
  return mapStories(result);
}

/** Real feed stories for one community. An unfed sector returns no stories. */
export async function listCommunityNews(
  database: SqlDb,
  communityId: string,
  limit = 5,
): Promise<CommunityNewsView> {
  const sector = await readCommunityNewsSector(database, communityId);
  const feeds = await sectorsWithRealFeeds(database);
  const hasRealFeeds = feeds.has(sector);
  if (!hasRealFeeds) return { sector, hasRealFeeds: false, stories: [] };
  const size = batchSize(limit);
  try {
    const stories = await selectSectorStories(database, sector, size);
    return { sector, hasRealFeeds: true, stories };
  } catch (error) {
    if (!isMissingNewsSectorSchema(error) || sector !== "ai") {
      if (isMissingNewsSectorSchema(error)) {
        return { sector, hasRealFeeds: false, stories: [] };
      }
      throw error;
    }
    const result = await database.execute(sql`
      SELECT "id", "url", "title", "published_at"
      FROM "app"."news_item"
      WHERE btrim("title") <> ''
        AND "url" LIKE 'https://%'
      ORDER BY "published_at" DESC NULLS LAST, "created_at" DESC
      LIMIT ${size}
    `);
    return { sector, hasRealFeeds: true, stories: mapStories(result) };
  }
}

export async function listCommunityNewsBySlug(
  slug: string,
): Promise<CommunityNewsView> {
  const { db } = await import("@/server/db");
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: { id: true },
  });
  if (!community) {
    return { sector: DEFAULT_NEWS_SECTOR, hasRealFeeds: false, stories: [] };
  }
  return listCommunityNews(db, community.id);
}
