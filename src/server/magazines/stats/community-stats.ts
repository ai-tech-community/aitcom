import { inArray, sql } from "drizzle-orm";
import type { AppLocale } from "@/i18n/messages";
import {
  activityEvents,
  magazineReads,
  magazineSubscriptions,
} from "@/server/db/schema";
import type { Deps } from "../deps";
import { magazineIssueSourceCondition } from "../issue-origin";
import { magazineJoinEventCondition } from "./join-condition";

export const MAGAZINE_STATS_PAGE_SIZE = 10;
type Counts = {
  views: number;
  readers: number;
  subscribers: number;
  joins: number;
};
export type MagazineIssuePerformance = Counts & {
  id: number;
  number: number;
  title: string;
  publishedAt: string | null;
};
export type MagazinePerformance = {
  magazine: { id: number; name: string } | null;
  summary: Counts & { publishedIssues: number };
  issues: MagazineIssuePerformance[];
  page: number;
  totalPages: number;
  pageSize: number;
};
type ReadAggregate = {
  issueId: number | null;
  isTotal: number;
  views: string | number | null;
  readers: string | number;
};
type CountAggregate = {
  issueId: number | null;
  isTotal: number;
  total: string | number;
};

function pageCount(rows: CountAggregate[], id: number | null) {
  return Number(
    rows.find((row) =>
      id === null
        ? Number(row.isTotal) === 1
        : Number(row.isTotal) === 0 && Number(row.issueId) === id,
    )?.total ?? 0,
  );
}
function readCount(rows: ReadAggregate[], id: number | null) {
  const row = rows.find((row) =>
    id === null
      ? Number(row.isTotal) === 1
      : Number(row.isTotal) === 0 && Number(row.issueId) === id,
  );
  return { views: Number(row?.views ?? 0), readers: Number(row?.readers ?? 0) };
}

/** Owner/admin callers only. Reads existing records; never creates a magazine. */
export async function loadCommunityMagazineStats(
  deps: Deps,
  communityId: string,
  locale: AppLocale,
  requestedPage: number,
): Promise<MagazinePerformance> {
  const { docs: magazines } = await deps.payload.find({
    collection: "magazines",
    where: { communityId: { equals: communityId } },
    depth: 0,
    limit: 1,
    pagination: false,
    select: { name: true },
  });
  const magazine = magazines[0];
  const empty: MagazinePerformance = {
    magazine: null,
    summary: {
      publishedIssues: 0,
      views: 0,
      readers: 0,
      subscribers: 0,
      joins: 0,
    },
    issues: [],
    page: 1,
    totalPages: 1,
    pageSize: MAGAZINE_STATS_PAGE_SIZE,
  };
  if (!magazine) return empty;
  const magazineId = Number(magazine.id);
  const loadPage = (page: number) =>
    deps.payload.find({
      collection: "magazine-issues",
      locale,
      depth: 0,
      draft: false,
      where: {
        and: [
          { communityId: { equals: communityId } },
          { magazine: { equals: magazineId } },
          { status: { equals: "published" } },
        ],
      },
      sort: ["-publishedAt", "-id"],
      limit: MAGAZINE_STATS_PAGE_SIZE,
      page,
      select: { number: true, title: true, publishedAt: true },
    });
  let issuePage = await loadPage(requestedPage);
  const page = Math.min(requestedPage, Math.max(1, issuePage.totalPages));
  if (page !== requestedPage) issuePage = await loadPage(page);
  const ids = issuePage.docs.map((issue) => Number(issue.id));
  // Payload owns this table. Its schema and FK are recorded in migration 20261026a.
  const published = sql`SELECT id FROM public.magazine_issues
    WHERE magazine_id = ${magazineId} AND community_id = ${communityId} AND status = 'published'`;
  const [{ rows: reads }, { rows: subscriptions }, { rows: joins }] =
    await Promise.all([
      deps.db.execute<ReadAggregate>(sql`
      WITH published AS (${published})
      SELECT ${magazineReads.issueId} AS "issueId", GROUPING(${magazineReads.issueId}) AS "isTotal",
        COALESCE(SUM(${magazineReads.views}) FILTER (WHERE ${magazineReads.articleId} IS NULL), 0) AS views,
        COUNT(DISTINCT ${magazineReads.readerKey}) AS readers
      FROM ${magazineReads}
      INNER JOIN published ON published.id = ${magazineReads.issueId}
      WHERE ${magazineReads.magazineId} = ${magazineId}
      GROUP BY GROUPING SETS ((${magazineReads.issueId}), ())
      HAVING GROUPING(${magazineReads.issueId}) = 1 OR ${inArray(magazineReads.issueId, ids)}
    `),
      deps.db.execute<CountAggregate>(sql`
      SELECT ${magazineSubscriptions.sourceIssueId} AS "issueId", GROUPING(${magazineSubscriptions.sourceIssueId}) AS "isTotal", COUNT(*) AS total
      FROM ${magazineSubscriptions}
      WHERE ${magazineSubscriptions.magazineId} = ${magazineId} AND ${magazineSubscriptions.confirmedAt} IS NOT NULL
      GROUP BY GROUPING SETS ((${magazineSubscriptions.sourceIssueId}), ())
      HAVING GROUPING(${magazineSubscriptions.sourceIssueId}) = 1 OR ${inArray(magazineSubscriptions.sourceIssueId, ids)}
    `),
      deps.db.execute<CountAggregate>(sql`
      WITH published AS (${published})
      SELECT published.id AS "issueId", GROUPING(published.id) AS "isTotal", COUNT(DISTINCT ${activityEvents.actorId}) AS total
      FROM ${activityEvents}
      INNER JOIN published ON ${magazineIssueSourceCondition(sql`published.id::text`)}
      WHERE ${activityEvents.communityId} = ${communityId} AND ${magazineJoinEventCondition()}
      GROUP BY GROUPING SETS ((published.id), ())
      HAVING GROUPING(published.id) = 1 OR ${inArray(sql`published.id`, ids)}
    `),
    ]);
  return {
    magazine: { id: magazineId, name: magazine.name },
    summary: {
      publishedIssues: issuePage.totalDocs,
      ...readCount(reads, null),
      subscribers: pageCount(subscriptions, null),
      joins: pageCount(joins, null),
    },
    issues: issuePage.docs.map((issue) => ({
      id: Number(issue.id),
      number: Number(issue.number),
      title: issue.title,
      publishedAt: issue.publishedAt
        ? new Date(issue.publishedAt).toISOString()
        : null,
      ...readCount(reads, Number(issue.id)),
      subscribers: pageCount(subscriptions, Number(issue.id)),
      joins: pageCount(joins, Number(issue.id)),
    })),
    page,
    totalPages: Math.max(1, issuePage.totalPages),
    pageSize: MAGAZINE_STATS_PAGE_SIZE,
  };
}
