import { describe, expect, it } from "vitest";
import {
  rosterCaptions,
  rosterSubtitle,
  showNewMemberBadge,
} from "./member-directory";

describe("member directory captions", () => {
  it("uses headline, role, and community in that order and leaves unknown subtitles empty", () => {
    expect(
      rosterSubtitle({
        headline: " Builds sensors ",
        role: "Admin",
        community: "Field Repair Studio",
      }),
    ).toBe("Builds sensors");
    expect(
      rosterSubtitle({
        headline: " ",
        role: "Admin",
        community: "Field Repair Studio",
      }),
    ).toBe("Admin");
    expect(rosterSubtitle({ community: "Field Repair Studio" })).toBe(
      "Field Repair Studio",
    );
    expect(rosterSubtitle({})).toBeNull();
  });

  it("distinguishes three same-name Hub accounts created in the same minute", () => {
    const members = [
      {
        userId: "hidden-id-fragment-a",
        name: "Soren Ravn",
        joinedAt: new Date("2026-11-13T18:27:14Z"),
      },
      {
        userId: "hidden-id-fragment-b",
        name: "Soren Ravn",
        joinedAt: new Date("2026-11-13T18:27:41Z"),
      },
      {
        userId: "hidden-id-fragment-c",
        name: "Soren Ravn",
        joinedAt: new Date("2026-11-13T18:27:57Z"),
      },
    ];
    const captions = [...rosterCaptions(members).values()];
    expect(captions).toEqual(
      members.map(({ joinedAt }) => ({
        kind: "joined",
        date: joinedAt,
        includeTime: true,
      })),
    );
    expect(JSON.stringify(captions)).not.toContain("hidden-id-fragment");
  });

  it("prefers distinct facts and omits an invented caption when all public facts match", () => {
    const sameTime = new Date("2026-11-13T18:27:14Z");
    const captions = rosterCaptions([
      {
        userId: "first",
        name: "Sam",
        headline: "@Sam",
        community: "Radio Workshop",
        joinedAt: sameTime,
      },
      { userId: "second", name: "SAM", handle: "@sam", joinedAt: sameTime },
      { userId: "third", name: "sam ", joinedAt: sameTime },
    ]);
    expect([...captions]).toEqual([
      ["first", { kind: "text", text: "Radio Workshop" }],
    ]);
  });

  it("requires a join within 30 days and a community older than 30 days", () => {
    const now = new Date("2026-11-30T12:00:00Z");
    const boundary = new Date("2026-10-31T12:00:00Z");
    const old = new Date("2026-10-31T11:59:59Z");
    expect(showNewMemberBadge(boundary, old, now)).toBe(true);
    expect(showNewMemberBadge(now, boundary, now)).toBe(false);
    expect(showNewMemberBadge(old, old, now)).toBe(false);
  });
});
