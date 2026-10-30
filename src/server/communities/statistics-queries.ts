import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { activityEvents, communityMemberships } from "@/server/db/schema";
import { CONTRIBUTION_ACTIONS } from "./insights";
import {
  buildCommunityStatistics,
  statisticsPeriod,
  type StatisticsDays,
  type ContributorAggregate,
} from "./statistics";

type DB = typeof _db;
const ACTIONS: string[] = [...CONTRIBUTION_ACTIONS];

/** Only recorded, attributed participation; no commissioned or system work. */
function contributionCondition() {
  return and(
    inArray(activityEvents.action, ACTIONS),
    inArray(activityEvents.actorType, ["member", "agent"]),
    sql`${activityEvents.metadata}->>'isCommissioned' IS DISTINCT FROM 'true'`,
  );
}

/** Three bounded aggregate reads. No raw identities or content leave this loader. */
export async function loadCommunityStatistics(
  db: DB,
  communityId: string,
  now: Date,
  days: StatisticsDays,
) {
  const period = statisticsPeriod(now, days);
  const scope = and(
    eq(activityEvents.communityId, communityId),
    gte(activityEvents.createdAt, period.previousStart),
    lt(activityEvents.createdAt, period.end),
  );
  const date = sql<string>`to_char(${activityEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const [memberships, activity, identities] = await Promise.all([
    db
      .select({
        status: communityMemberships.status,
        count: sql<number>`count(*)::int`,
      })
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, communityId))
      .groupBy(communityMemberships.status),
    db
      .select({
        date,
        action: activityEvents.action,
        actorType: activityEvents.actorType,
        count: sql<number>`count(*)::int`,
      })
      .from(activityEvents)
      .where(
        and(
          scope,
          or(
            contributionCondition(),
            inArray(activityEvents.action, [
              "community.joined",
              "community.left",
            ]),
          ),
        ),
      )
      .groupBy(date, activityEvents.action, activityEvents.actorType),
    // One row per member actor over both windows, then count intersections.
    // Summing daily distinct counts would overcount returning contributors.
    db.execute<ContributorAggregate>(sql`
      SELECT
        (count(*) FILTER (WHERE contributed_now))::int AS current,
        (count(*) FILTER (WHERE contributed_before))::int AS previous,
        (count(*) FILTER (WHERE contributed_now AND contributed_before))::int AS returning
      FROM (
        SELECT ${activityEvents.actorId},
          bool_or(${activityEvents.createdAt} >= ${period.start.toISOString()}::timestamptz) AS contributed_now,
          bool_or(${activityEvents.createdAt} < ${period.start.toISOString()}::timestamptz) AS contributed_before
        FROM ${activityEvents}
        WHERE ${scope}
          AND ${contributionCondition()}
          AND ${activityEvents.actorType} = 'member'
        GROUP BY ${activityEvents.actorId}
      ) contributors
    `),
  ]);
  return buildCommunityStatistics({
    now,
    days,
    memberships,
    activity,
    contributors: identities.rows[0] ?? {
      current: 0,
      previous: 0,
      returning: 0,
    },
  });
}
