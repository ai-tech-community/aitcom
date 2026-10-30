import { CONTRIBUTION_ACTIONS } from "./insights";

export type StatisticsDays = 7 | 30 | 90;
const DAY_MS = 86_400_000;
type ContributionAction = (typeof CONTRIBUTION_ACTIONS)[number];
export const AREA_KEYS = [
  "feed",
  "forum",
  "ideas",
  "projects",
  "events",
  "challenges",
] as const;
export type ContributionArea = (typeof AREA_KEYS)[number];

/** Exhaustive mapping of the existing heartbeat, not a new engagement score. */
export const CONTRIBUTION_AREAS = {
  "feed.post_created": "feed",
  "feed.comment_created": "feed",
  "thread.create": "forum",
  "thread.reply": "forum",
  "idea.submitted": "ideas",
  "idea.voted": "ideas",
  "launchpad.project.published": "projects",
  "launchpad.project.voted": "projects",
  "launchpad.update.posted": "projects",
  "launchpad.comment.created": "projects",
  "event.register": "events",
  "event.intent": "events",
  "event.create": "events",
  "event.submit": "events",
  "challenge.enrolled": "challenges",
  "challenge.solution_submitted": "challenges",
  "challenge.completed": "challenges",
} satisfies Record<ContributionAction, ContributionArea>;

export function statisticsPeriod(now: Date, days: StatisticsDays) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return {
    start: new Date(+end - days * DAY_MS),
    end,
    previousStart: new Date(+end - days * 2 * DAY_MS),
  };
}

export function compareCounts(current: number, previous: number) {
  return {
    current,
    previous,
    change: current - previous,
    percentChange:
      previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}
export type CountComparison = ReturnType<typeof compareCounts>;
export type ActivityAggregate = {
  date: string;
  action: string;
  actorType: string;
  count: number;
};
export type MembershipAggregate = { status: string; count: number };
export type ContributorAggregate = {
  current: number;
  previous: number;
  returning: number;
};
export type DailyStatistics = {
  date: string;
  memberContributions: number;
  agentContributions: number;
  joins: number;
  leaves: number;
};

/** Takes SQL aggregates only. Identity deduplication stays in the database. */
export function buildCommunityStatistics(input: {
  now: Date;
  days: StatisticsDays;
  memberships: MembershipAggregate[];
  activity: ActivityAggregate[];
  contributors: ContributorAggregate;
}) {
  const { now, days, memberships, activity, contributors } = input;
  const { start, end, previousStart } = statisticsPeriod(now, days);
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  const previousKey = dateKey(previousStart);
  const daily: DailyStatistics[] = Array.from({ length: days }, (_, i) => ({
    date: dateKey(new Date(+start + i * DAY_MS)),
    memberContributions: 0,
    agentContributions: 0,
    joins: 0,
    leaves: 0,
  }));
  const byDate = new Map(daily.map((row) => [row.date, row]));
  const areas = AREA_KEYS.map((key) => ({
    key,
    memberContributions: 0,
    agentContributions: 0,
  }));
  const byArea = new Map(areas.map((row) => [row.key, row]));
  const current = {
    contributions: 0,
    agentContributions: 0,
    joins: 0,
    leaves: 0,
  };
  const previous = { ...current };

  for (const row of activity) {
    if (row.date < previousKey || row.date >= endKey) continue;
    const inCurrent = row.date >= startKey;
    const totals = inCurrent ? current : previous;
    const day = byDate.get(row.date);
    if (row.action === "community.joined" || row.action === "community.left") {
      const key = row.action === "community.joined" ? "joins" : "leaves";
      totals[key] += row.count;
      if (day) day[key] += row.count;
      continue;
    }
    if (!CONTRIBUTION_ACTIONS.includes(row.action as ContributionAction))
      continue;
    if (row.actorType !== "member" && row.actorType !== "agent") continue;
    const key =
      row.actorType === "member" ? "memberContributions" : "agentContributions";
    totals[
      row.actorType === "member" ? "contributions" : "agentContributions"
    ] += row.count;
    if (day) day[key] += row.count;
    if (inCurrent) {
      const area = byArea.get(
        CONTRIBUTION_AREAS[row.action as ContributionAction],
      );
      if (area) area[key] += row.count;
    }
  }

  const memberCount = (status: string) =>
    memberships.find((row) => row.status === status)?.count ?? 0;
  return {
    generatedAt: now.toISOString(),
    period: {
      days,
      start: start.toISOString(),
      end: end.toISOString(),
      previousStart: previousStart.toISOString(),
    },
    members: {
      active: memberCount("active"),
      pending: memberCount("pending_approval"),
      invited: memberCount("invited"),
    },
    metrics: {
      contributors: compareCounts(contributors.current, contributors.previous),
      contributions: compareCounts(
        current.contributions,
        previous.contributions,
      ),
      agentContributions: compareCounts(
        current.agentContributions,
        previous.agentContributions,
      ),
      joins: compareCounts(current.joins, previous.joins),
      leaves: compareCounts(current.leaves, previous.leaves),
    },
    returningContributors: contributors.returning,
    daily,
    areas,
  };
}

export type CommunityStatistics = ReturnType<typeof buildCommunityStatistics>;
