import { describe, it, expect } from "vitest";
import {
  CONTRIBUTION_ACTIONS,
  isContribution,
  windowStart,
  summarizeHealth,
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
});
