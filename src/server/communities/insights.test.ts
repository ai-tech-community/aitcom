import { describe, it, expect } from "vitest";
import {
  CONTRIBUTION_ACTIONS,
  isContribution,
  windowStart,
  summarizeHealth,
  selectAtRisk,
  selectUnactivated,
} from "./insights";

describe("isContribution", () => {
  it("treats a forum reply as a contribution", () => {
    expect(isContribution("thread.reply")).toBe(true);
  });
  it("excludes passive likes", () => {
    expect(isContribution("feed.post_liked")).toBe(false);
  });
  it("excludes admin ops", () => {
    expect(isContribution("community.role_changed")).toBe(false);
  });
  it("CONTRIBUTION_ACTIONS contains event.register and not feed.post_liked", () => {
    expect(CONTRIBUTION_ACTIONS).toContain("event.register");
    expect(CONTRIBUTION_ACTIONS).not.toContain("feed.post_liked");
  });
  it("CONTRIBUTION_ACTIONS does not contain comment.created (Hub-wide, no community attribution)", () => {
    expect(CONTRIBUTION_ACTIONS).not.toContain("comment.created");
  });
});

describe("windowStart", () => {
  it("returns N days before now", () => {
    const now = new Date("2026-05-30T12:00:00.000Z");
    expect(windowStart(now, 14).toISOString()).toBe("2026-05-16T12:00:00.000Z");
  });
});

const at = (iso: string, actorId = "u1", action = "thread.reply") => ({
  actorId,
  action,
  createdAt: new Date(iso),
});

describe("summarizeHealth", () => {
  const now = new Date("2026-05-30T00:00:00.000Z");

  it("counts distinct active members in the current 14d window", () => {
    const res = summarizeHealth({
      contributions: [
        at("2026-05-29T00:00:00Z", "u1"),
        at("2026-05-28T00:00:00Z", "u1"), // same member, still 1 distinct
        at("2026-05-20T00:00:00Z", "u2"),
        at("2026-05-10T00:00:00Z", "u3"), // outside 14d window
      ],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.activeNow).toBe(2);
  });

  it("counts prior-window active members for comparison", () => {
    const res = summarizeHealth({
      contributions: [
        at("2026-05-29T00:00:00Z", "u1"), // current
        at("2026-05-10T00:00:00Z", "u2"), // prior (15-28d ago)
      ],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.activeNow).toBe(1);
    expect(res.activePrev).toBe(1);
  });

  it("counts joins and departures in the current window", () => {
    const res = summarizeHealth({
      contributions: [],
      joins: [at("2026-05-25T00:00:00Z", "u9", "community.joined")],
      departures: [at("2026-05-26T00:00:00Z", "u8", "community.left")],
      now,
      windowDays: 14,
    });
    expect(res.newJoins).toBe(1);
    expect(res.departures).toBe(1);
  });

  it("totals contributions in current vs prior window", () => {
    const res = summarizeHealth({
      contributions: [
        at("2026-05-29T00:00:00Z", "u1"),
        at("2026-05-28T00:00:00Z", "u2"),
        at("2026-05-10T00:00:00Z", "u3"), // prior
      ],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.contributionCount).toBe(2);
    expect(res.contributionPrev).toBe(1);
  });

  it("counts a contribution at exactly the curStart boundary as current (inclusive)", () => {
    const now = new Date("2026-05-30T00:00:00.000Z");
    const res = summarizeHealth({
      contributions: [at("2026-05-16T00:00:00Z", "u1")],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.activeNow).toBe(1);
    expect(res.activePrev).toBe(0);
    expect(res.contributionCount).toBe(1);
  });
});

const mem = (userId: string, role = "member", status = "active") => ({
  userId,
  role,
  status,
  joinedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("selectAtRisk", () => {
  const now = new Date("2026-05-30T00:00:00.000Z");

  it("flags a member active in the prior window but silent in the last 14d", () => {
    const res = selectAtRisk({
      memberships: [mem("u1")],
      contributions: [at("2026-05-10T00:00:00Z", "u1")], // 20d ago: prior, not current
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res.map((m) => m.userId)).toEqual(["u1"]);
    expect(res[0]!.priorContributions).toBe(1);
  });

  it("does NOT flag a currently-active member", () => {
    const res = selectAtRisk({
      memberships: [mem("u1")],
      contributions: [at("2026-05-29T00:00:00Z", "u1")], // current
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res).toEqual([]);
  });

  it("does NOT flag someone who never contributed (that's a newcomer, not at-risk)", () => {
    const res = selectAtRisk({
      memberships: [mem("u1")],
      contributions: [],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res).toEqual([]);
  });

  it("excludes banned/non-active memberships", () => {
    const res = selectAtRisk({
      memberships: [mem("u1", "member", "banned")],
      contributions: [at("2026-05-10T00:00:00Z", "u1")],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res).toEqual([]);
  });

  it("sorts by prior contribution volume desc and respects cap", () => {
    const res = selectAtRisk({
      memberships: [mem("u1"), mem("u2")],
      contributions: [
        at("2026-05-10T00:00:00Z", "u1"),
        at("2026-05-09T00:00:00Z", "u2"),
        at("2026-05-08T00:00:00Z", "u2"),
      ],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 1,
    });
    expect(res.map((m) => m.userId)).toEqual(["u2"]); // u2 has 2 prior, capped to 1
  });

  it("breaks ties in prior-contribution count by role rank (owner before member)", () => {
    const now = new Date("2026-05-30T00:00:00.000Z");
    const res = selectAtRisk({
      memberships: [
        {
          userId: "u1",
          role: "owner",
          status: "active",
          joinedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          userId: "u2",
          role: "member",
          status: "active",
          joinedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      contributions: [
        at("2026-05-10T00:00:00Z", "u1"),
        at("2026-05-09T00:00:00Z", "u1"),
        at("2026-05-10T00:00:00Z", "u2"),
        at("2026-05-09T00:00:00Z", "u2"),
      ],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res.map((m) => m.userId)).toEqual(["u1", "u2"]);
  });
});

const memJoined = (userId: string, joinedIso: string, status = "active") => ({
  userId,
  role: "member",
  status,
  joinedAt: new Date(joinedIso),
});

describe("selectUnactivated", () => {
  const now = new Date("2026-05-30T00:00:00.000Z");

  it("flags a member who joined >=3d ago and never contributed", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-20T00:00:00Z")],
      contributorUserIds: [],
      now,
      minAgeDays: 3,
      maxAgeDays: 30,
    });
    expect(res.map((m) => m.userId)).toEqual(["u1"]);
  });

  it("does NOT flag a member who joined too recently (<3d)", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-29T00:00:00Z")],
      contributorUserIds: [],
      now,
      minAgeDays: 3,
      maxAgeDays: 30,
    });
    expect(res).toEqual([]);
  });

  it("does NOT flag a member who has contributed at all", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-20T00:00:00Z")],
      contributorUserIds: ["u1"],
      now,
      minAgeDays: 3,
      maxAgeDays: 30,
    });
    expect(res).toEqual([]);
  });

  it("excludes non-active memberships", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-20T00:00:00Z", "banned")],
      contributorUserIds: [],
      now,
      minAgeDays: 3,
      maxAgeDays: 30,
    });
    expect(res).toEqual([]);
  });

  it("does NOT flag a member who joined more than maxAgeDays ago (too old, not a newcomer)", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-03-01T00:00:00Z")],
      contributorUserIds: [],
      now,
      minAgeDays: 3,
      maxAgeDays: 30,
    });
    expect(res).toEqual([]);
  });
});
