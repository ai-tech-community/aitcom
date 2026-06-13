import { describe, it, expect } from "vitest";
import { aggregateJudgeRankings } from "./judge-aggregation";

const ref = {
  automatedScores: new Map<string, number>(),
  submittedAt: new Map<string, Date>(),
};

describe("aggregateJudgeRankings", () => {
  it("ranks by mean judge rank, lower mean first", () => {
    const out = aggregateJudgeRankings(
      [
        { judgeUserId: "j1", teamId: "a", rank: 1 },
        { judgeUserId: "j1", teamId: "b", rank: 2 },
        { judgeUserId: "j2", teamId: "a", rank: 2 },
        { judgeUserId: "j2", teamId: "b", rank: 1 },
        { judgeUserId: "j3", teamId: "a", rank: 1 },
        { judgeUserId: "j3", teamId: "b", rank: 2 },
      ],
      ref.automatedScores,
      ref.submittedAt,
    );
    expect(out).toEqual([
      { teamId: "a", finalRank: 1 },
      { teamId: "b", finalRank: 2 },
    ]);
  });

  it("breaks a mean-rank tie by higher automated score", () => {
    const out = aggregateJudgeRankings(
      [
        { judgeUserId: "j1", teamId: "a", rank: 1 },
        { judgeUserId: "j1", teamId: "b", rank: 2 },
        { judgeUserId: "j2", teamId: "a", rank: 2 },
        { judgeUserId: "j2", teamId: "b", rank: 1 },
      ],
      new Map([
        ["a", 10],
        ["b", 99],
      ]),
      new Map(),
    );
    expect(out.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("breaks a full tie by earliest submission, then teamId", () => {
    const out = aggregateJudgeRankings(
      [
        { judgeUserId: "j1", teamId: "b", rank: 1 },
        { judgeUserId: "j1", teamId: "a", rank: 2 },
        { judgeUserId: "j2", teamId: "b", rank: 2 },
        { judgeUserId: "j2", teamId: "a", rank: 1 },
      ],
      new Map([
        ["a", 5],
        ["b", 5],
      ]),
      new Map([
        ["a", new Date("2026-06-13T10:00:00Z")],
        ["b", new Date("2026-06-13T09:00:00Z")],
      ]),
    );
    expect(out.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("ignores teams with no judge rankings", () => {
    const out = aggregateJudgeRankings(
      [{ judgeUserId: "j1", teamId: "a", rank: 1 }],
      new Map(),
      new Map(),
    );
    expect(out).toEqual([{ teamId: "a", finalRank: 1 }]);
  });
});
