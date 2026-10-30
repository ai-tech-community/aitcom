import { and, count, countDistinct, eq, isNotNull, sql } from "drizzle-orm";

import type { AppLocale } from "@/i18n/messages";
import type { IssueStatus } from "@/lib/magazines/values";
import { joinSourceCondition } from "@/server/communities/join-sources";
import {
  activityEvents,
  magazineReads,
  magazineSubscriptions,
} from "@/server/db/schema";

import type { Deps } from "../deps";
import { requireRelationId } from "../relation-id";
import { magazineJoinEventCondition } from "./join-condition";

export type IssueStats = {
  issue: {
    id: number;
    number: number;
    title: string;
    publishedAt: string | null;
    status: IssueStatus;
  };
  views: number;
  readers: number;
  newSubscribers: number;
  joins: number;
  articles: {
    articleId: number;
    title: string;
    readers: number;
    readToEnd: number;
  }[];
};

type ReadAggregate = {
  articleId: number | null;
  isTotal: number;
  views: string | number | null;
  readers: string | number;
  readToEnd: string | number;
};

/** Null when the issue is missing. Callers gate with canEditIssueAt first. */
export async function loadIssueStats(
  deps: Deps,
  issueId: number,
  locale: AppLocale,
): Promise<IssueStats | null> {
  const issue = await deps.payload.findByID({
    collection: "magazine-issues",
    id: issueId,
    locale,
    draft: false,
    depth: 1,
    disableErrors: true,
    select: {
      number: true,
      title: true,
      publishedAt: true,
      status: true,
      magazine: true,
      communityId: true,
      items: { article: { article: true } },
    },
    populate: {
      articles: { title: true },
    },
  });
  if (!issue) return null;
  const magazineId = requireRelationId(issue.magazine);

  const [{ rows }, subscriptions, joins] = await Promise.all([
    // GROUPING SETS counts readers across every page without adding up
    // per-article counts. Its total row exists even before the first read.
    deps.db.execute<ReadAggregate>(sql`
      SELECT ${magazineReads.articleId} AS "articleId",
        GROUPING(${magazineReads.articleId}) AS "isTotal",
        SUM(${magazineReads.views}) AS views,
        COUNT(DISTINCT ${magazineReads.readerKey}) AS readers,
        COUNT(${magazineReads.readToEndAt}) AS "readToEnd"
      FROM ${magazineReads}
      WHERE ${magazineReads.issueId} = ${issueId}
      GROUP BY GROUPING SETS ((${magazineReads.articleId}), ())
    `),
    deps.db
      .select({ total: count() })
      .from(magazineSubscriptions)
      .where(
        and(
          eq(magazineSubscriptions.magazineId, magazineId),
          eq(magazineSubscriptions.sourceIssueId, issueId),
          isNotNull(magazineSubscriptions.confirmedAt),
        ),
      ),
    deps.db
      .select({ total: countDistinct(activityEvents.actorId) })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.communityId, issue.communityId),
          joinSourceCondition({
            via: "magazine",
            magazineId,
            issueId,
          }),
          magazineJoinEventCondition(),
        ),
      ),
  ]);

  const perPage = new Map(
    rows
      .filter((row) => Number(row.isTotal) === 0)
      .map((row) => [
        row.articleId === null ? null : Number(row.articleId),
        row,
      ]),
  );
  const total = rows.find((row) => Number(row.isTotal) === 1);

  return {
    issue: {
      id: Number(issue.id),
      number: Number(issue.number),
      title: issue.title,
      publishedAt: issue.publishedAt
        ? new Date(issue.publishedAt).toISOString()
        : null,
      status: issue.status,
    },
    views: Number(perPage.get(null)?.views ?? 0),
    readers: Number(total?.readers ?? 0),
    newSubscribers: Number(subscriptions[0]?.total ?? 0),
    joins: Number(joins[0]?.total ?? 0),
    articles: (issue.items ?? []).flatMap((item) => {
      if (
        !("article" in item) ||
        typeof item.article !== "object" ||
        item.article === null
      )
        return [];
      const articleId = Number(item.article.id);
      const reads = perPage.get(articleId);
      return [
        {
          articleId,
          title: item.article.title,
          readers: Number(reads?.readers ?? 0),
          readToEnd: Number(reads?.readToEnd ?? 0),
        },
      ];
    }),
  };
}
