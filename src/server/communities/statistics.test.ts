import { describe, expect, it } from "vitest";
import { CONTRIBUTION_ACTIONS } from "./insights";
import {
  buildCommunityStatistics,
  CONTRIBUTION_AREAS,
  statisticsPeriod,
  compareCounts,
  type ActivityAggregate,
} from "./statistics";

const now = new Date("2026-10-30T14:23:00Z");
const row = (
  date: string,
  action: string,
  actorType = "member",
  count = 1,
): ActivityAggregate => ({ date, action, actorType, count });

function build(activity: ActivityAggregate[] = []) {
  return buildCommunityStatistics({
    now,
    days: 7,
    memberships: [
      { status: "active", count: 12 },
      { status: "pending_approval", count: 3 },
      { status: "invited", count: 2 },
      { status: "banned", count: 4 },
    ],
    activity,
    contributors: { current: 2, previous: 3, returning: 1 },
  });
}

describe("complete UTC statistics periods", () => {
  it.each([7, 30, 90] as const)(
    "uses %i whole days and an adjacent prior window",
    (days) => {
      const period = statisticsPeriod(now, days);
      expect(period.end.toISOString()).toBe("2026-10-30T00:00:00.000Z");
      expect(+period.end - +period.start).toBe(days * 86_400_000);
      expect(+period.start - +period.previousStart).toBe(days * 86_400_000);
      expect(now.toISOString()).toBe("2026-10-30T14:23:00.000Z");
    },
  );

  it("uses UTC dates through the Amsterdam daylight-saving change", () => {
    const period = statisticsPeriod(new Date("2026-10-26T00:30:00+01:00"), 7);
    expect(period.end.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(period.start.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });
});

describe("count comparisons", () => {
  it("has no percentage for a zero baseline, including zero-to-zero", () => {
    expect(compareCounts(4, 0)).toEqual({
      current: 4,
      previous: 0,
      change: 4,
      percentChange: null,
    });
    expect(compareCounts(0, 0).percentChange).toBeNull();
    expect(compareCounts(3, 4)).toEqual({
      current: 3,
      previous: 4,
      change: -1,
      percentChange: -25,
    });
  });
});

describe("community statistics", () => {
  it("reports current membership separately from period data", () => {
    const data = build();
    expect(data.members).toEqual({ active: 12, pending: 3, invited: 2 });
    expect(data.generatedAt).toBe(now.toISOString());
    expect(data.daily).toHaveLength(7);
    expect(data.daily[0]).toEqual({
      date: "2026-10-23",
      memberContributions: 0,
      agentContributions: 0,
      joins: 0,
      leaves: 0,
    });
    expect(data.daily.at(-1)?.date).toBe("2026-10-29");
  });

  it("separates actor types, honors both edges, and counts agent-assisted joins", () => {
    const data = build([
      row("2026-10-15", "thread.reply", "member", 100),
      row("2026-10-16", "thread.reply", "member", 4),
      row("2026-10-22", "thread.reply", "member", 2),
      row("2026-10-23", "feed.post_created", "member", 5),
      row("2026-10-29", "thread.reply", "agent", 8),
      row("2026-10-29", "thread.reply", "system", 100),
      row("2026-10-29", "workcell.completed", "member", 100),
      row("2026-10-29", "feed.post_liked", "member", 100),
      row("2026-10-29", "community.joined", "agent", 3),
      row("2026-10-29", "community.left", "member", 1),
      row("2026-10-30", "thread.reply", "member", 100),
    ]);
    expect(data.metrics.contributions).toEqual(compareCounts(5, 6));
    expect(data.metrics.agentContributions.current).toBe(8);
    expect(data.metrics.joins.current).toBe(3);
    expect(data.metrics.leaves.current).toBe(1);
    expect(data.daily.at(-1)).toEqual({
      date: "2026-10-29",
      memberContributions: 0,
      agentContributions: 8,
      joins: 3,
      leaves: 1,
    });
    // SQL computes period-distinct identities: never sum per-day unique counts.
    expect(data.metrics.contributors).toEqual(compareCounts(2, 3));
    expect(data.returningContributors).toBe(1);
  });

  it("maps every canonical action and reconciles area totals", () => {
    expect(Object.keys(CONTRIBUTION_AREAS).sort()).toEqual(
      [...CONTRIBUTION_ACTIONS].sort(),
    );
    const data = build(
      CONTRIBUTION_ACTIONS.flatMap((action) => [
        row("2026-10-28", action, "member", 2),
        row("2026-10-28", action, "agent", 3),
      ]),
    );
    expect(
      data.areas.reduce((n, area) => n + area.memberContributions, 0),
    ).toBe(data.metrics.contributions.current);
    expect(data.areas.reduce((n, area) => n + area.agentContributions, 0)).toBe(
      data.metrics.agentContributions.current,
    );
    expect(data.areas.map((area) => area.key)).toEqual([
      "feed",
      "forum",
      "ideas",
      "projects",
      "events",
      "challenges",
    ]);
  });

  it("handles a community with no rows", () => {
    const data = buildCommunityStatistics({
      now,
      days: 30,
      memberships: [],
      activity: [],
      contributors: { current: 0, previous: 0, returning: 0 },
    });
    expect(data.members.active).toBe(0);
    expect(data.daily).toHaveLength(30);
    expect(data.metrics.contributors.current).toBe(0);
    expect(data.areas.every((area) => area.memberContributions === 0)).toBe(
      true,
    );
  });
});
