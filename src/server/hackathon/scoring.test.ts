import { describe, it, expect } from "vitest";
import { teamScore, rankTeams, prizeSplit } from "./scoring";

describe("teamScore", () => {
  it("sums the verified-cell XP weights (test=75, self-report=10)", () => {
    expect(teamScore(["test", "self-report"])).toBe(85);
  });

  it("is 0 for no verified cells", () => {
    expect(teamScore([])).toBe(0);
  });

  it("uses weight 1 (50) for an unknown mode", () => {
    expect(teamScore(["mystery"])).toBe(50);
  });
});

describe("rankTeams", () => {
  const t = (teamId: string, score: number, submittedAt: string | null) => ({
    teamId,
    score,
    submittedAt: submittedAt ? new Date(submittedAt) : null,
  });

  it("ranks by score desc, breaking ties by earliest submittedAt", () => {
    const ranked = rankTeams(
      [
        t("a", 100, "2026-06-09T10:00:00Z"),
        t("b", 100, "2026-06-09T09:00:00Z"),
        t("c", 200, "2026-06-09T11:00:00Z"),
      ],
      "speed",
    );
    expect(ranked.map((r) => [r.teamId, r.rank])).toEqual([
      ["c", 1],
      ["b", 2],
      ["a", 3],
    ]);
  });

  it("ranks un-submitted teams (null submittedAt) last", () => {
    const ranked = rankTeams(
      [t("a", 50, null), t("b", 10, "2026-06-09T09:00:00Z")],
      "speed",
    );
    expect(ranked.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("is deterministic on a full tie (score + submittedAt) via teamId", () => {
    const ranked = rankTeams(
      [t("b", 10, "2026-06-09T09:00:00Z"), t("a", 10, "2026-06-09T09:00:00Z")],
      "speed",
    );
    expect(ranked.map((r) => r.teamId)).toEqual(["a", "b"]);
  });
});

describe("prizeSplit", () => {
  it("floors the per-member share", () => {
    expect(prizeSplit(400, 3)).toBe(133);
  });
  it("is 0 when the team is empty or the prize is 0", () => {
    expect(prizeSplit(400, 0)).toBe(0);
    expect(prizeSplit(0, 4)).toBe(0);
  });
});
