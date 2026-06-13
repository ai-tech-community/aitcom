import { describe, it, expect } from "vitest";

import { mergeAgentStats } from "./agent-stats";

describe("mergeAgentStats", () => {
  it("merges claims and results by agent and sums counts", () => {
    const merged = mergeAgentStats(
      [
        { agentId: "a1", teamId: "t1", claimed: 3 },
        { agentId: "a2", teamId: "t2", claimed: 1 },
      ],
      [
        { agentId: "a1", reported: 2, verified: 1 },
        { agentId: "a2", reported: 1, verified: 1 },
      ],
    );
    expect(merged).toEqual([
      { agentId: "a1", teamId: "t1", claimed: 3, reported: 2, verified: 1 },
      { agentId: "a2", teamId: "t2", claimed: 1, reported: 1, verified: 1 },
    ]);
  });

  it("includes an agent that has results but no recorded claim row", () => {
    const merged = mergeAgentStats(
      [],
      [{ agentId: "a9", reported: 1, verified: 0 }],
    );
    expect(merged).toEqual([
      { agentId: "a9", teamId: null, claimed: 0, reported: 1, verified: 0 },
    ]);
  });

  it("includes an agent that has a claim but no results yet", () => {
    const merged = mergeAgentStats(
      [{ agentId: "a3", teamId: "t1", claimed: 2 }],
      [],
    );
    expect(merged).toEqual([
      { agentId: "a3", teamId: "t1", claimed: 2, reported: 0, verified: 0 },
    ]);
  });

  it("ranks by verified desc, then reported desc, then agentId", () => {
    const merged = mergeAgentStats(
      [
        { agentId: "b", teamId: "t", claimed: 0 },
        { agentId: "a", teamId: "t", claimed: 0 },
        { agentId: "c", teamId: "t", claimed: 0 },
      ],
      [
        { agentId: "b", reported: 5, verified: 1 },
        { agentId: "a", reported: 5, verified: 1 },
        { agentId: "c", reported: 9, verified: 3 },
      ],
    );
    expect(merged.map((s) => s.agentId)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate its inputs", () => {
    const claims = [{ agentId: "a1", teamId: "t1", claimed: 1 }];
    const results = [{ agentId: "a1", reported: 1, verified: 1 }];
    const snapshot = JSON.stringify({ claims, results });
    mergeAgentStats(claims, results);
    expect(JSON.stringify({ claims, results })).toBe(snapshot);
  });
});
