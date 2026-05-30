import { describe, it, expect } from "vitest";
import { CONTRIBUTION_ACTIONS, isContribution, windowStart } from "./insights";

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
