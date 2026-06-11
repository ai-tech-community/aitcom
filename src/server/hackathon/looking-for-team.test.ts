import { describe, it, expect } from "vitest";
import {
  assertCanToggleLookingForTeam,
  lookingForTeamCandidates,
  matchesSkillFilter,
} from "./looking-for-team";

describe("assertCanToggleLookingForTeam", () => {
  it("passes for a solo enrollment during the forming (live) phase", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "live",
        enrollment: { teamId: null },
      }),
    ).not.toThrow();
  });

  it("throws when the caller has no enrollment", () => {
    expect(() =>
      assertCanToggleLookingForTeam({ phase: "live", enrollment: null }),
    ).toThrow(/enroll/i);
  });

  it("throws when the caller is already on a team", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "live",
        enrollment: { teamId: "team-1" },
      }),
    ).toThrow(/already on a team/i);
  });

  it("throws before the hackathon is published (draft)", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "draft",
        enrollment: { teamId: null },
      }),
    ).toThrow(/not open/i);
  });

  it("throws once rosters are locked", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "locked",
        enrollment: { teamId: null },
      }),
    ).toThrow(/closed/i);
  });

  it("throws once the hackathon is finalized", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "finalized",
        enrollment: { teamId: null },
      }),
    ).toThrow(/closed/i);
  });
});

describe("lookingForTeamCandidates", () => {
  const base = {
    teamId: null,
    lookingForTeamAt: new Date("2026-06-12T10:00:00Z"),
    isPublic: true,
    displayName: "Ada",
    skills: ["python"],
  };

  it("includes only opted-in, solo, public-profile rows", () => {
    const rows = [
      { ...base, userId: "u1" },
      // not opted in
      { ...base, userId: "u2", lookingForTeamAt: null },
      // already on a team (stale flag must not surface)
      { ...base, userId: "u3", teamId: "team-1" },
      // hidden profile: excluded entirely, never anonymised
      { ...base, userId: "u4", isPublic: false },
    ];
    const out = lookingForTeamCandidates(rows);
    expect(out.map((c) => c.userId)).toEqual(["u1"]);
  });

  it("sorts by opt-in time, earliest first", () => {
    const rows = [
      {
        ...base,
        userId: "late",
        lookingForTeamAt: new Date("2026-06-12T12:00:00Z"),
      },
      {
        ...base,
        userId: "early",
        lookingForTeamAt: new Date("2026-06-12T08:00:00Z"),
      },
    ];
    const out = lookingForTeamCandidates(rows);
    expect(out.map((c) => c.userId)).toEqual(["early", "late"]);
  });

  it("excludes the viewer when excludeUserId is given", () => {
    const rows = [
      { ...base, userId: "me" },
      { ...base, userId: "other" },
    ];
    const out = lookingForTeamCandidates(rows, { excludeUserId: "me" });
    expect(out.map((c) => c.userId)).toEqual(["other"]);
  });

  it("exposes only public-profile fields (no isPublic/teamId leakage)", () => {
    const out = lookingForTeamCandidates([{ ...base, userId: "u1" }]);
    expect(out[0]).toEqual({
      userId: "u1",
      displayName: "Ada",
      skills: ["python"],
      lookingForTeamAt: base.lookingForTeamAt,
    });
  });
});

describe("matchesSkillFilter", () => {
  it("matches any skill case-insensitively by substring", () => {
    expect(matchesSkillFilter(["Python", "Data Viz"], "py")).toBe(true);
    expect(matchesSkillFilter(["Python", "Data Viz"], "VIZ")).toBe(true);
    expect(matchesSkillFilter(["Python"], "rust")).toBe(false);
  });

  it("accepts everything for an empty or whitespace query", () => {
    expect(matchesSkillFilter([], "")).toBe(true);
    expect(matchesSkillFilter(["python"], "   ")).toBe(true);
  });

  it("never matches a member with no skills against a real query", () => {
    expect(matchesSkillFilter([], "python")).toBe(false);
  });
});
