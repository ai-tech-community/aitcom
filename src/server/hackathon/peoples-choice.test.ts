import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import { votingOpen, peoplesChoice } from "./peoples-choice";

describe("votingOpen", () => {
  it("is closed while the hackathon is a draft", () => {
    expect(votingOpen("draft")).toBe(false);
  });

  it("is closed while teams are still forming (live)", () => {
    expect(votingOpen("live")).toBe(false);
  });

  it("opens when rosters lock", () => {
    expect(votingOpen("locked")).toBe(true);
  });

  it("closes at finalize", () => {
    expect(votingOpen("finalized")).toBe(false);
  });
});

describe("peoplesChoice", () => {
  const entry = (
    teamId: string,
    votes: number,
    submittedAt: Date | string | null = null,
  ) => ({ teamId, votes, submittedAt });

  it("returns null when there are no entries", () => {
    expect(peoplesChoice([])).toBeNull();
  });

  it("returns null when no entry has any votes", () => {
    expect(peoplesChoice([entry("a", 0), entry("b", 0)])).toBeNull();
  });

  it("picks the team with the most votes", () => {
    expect(peoplesChoice([entry("a", 2), entry("b", 5), entry("c", 1)])).toBe(
      "b",
    );
  });

  it("breaks a vote tie by earliest submission", () => {
    expect(
      peoplesChoice([
        entry("late", 3, "2026-06-12T12:00:00Z"),
        entry("early", 3, "2026-06-11T09:00:00Z"),
      ]),
    ).toBe("early");
  });

  it("accepts Date submittedAt values (server-side, pre-serialization)", () => {
    expect(
      peoplesChoice([
        entry("late", 3, new Date("2026-06-12T12:00:00Z")),
        entry("early", 3, new Date("2026-06-11T09:00:00Z")),
      ]),
    ).toBe("early");
  });

  it("breaks a full tie (votes + submittedAt) by teamId so the pick is deterministic", () => {
    const when = "2026-06-11T09:00:00Z";
    expect(
      peoplesChoice([entry("zebra", 3, when), entry("alpha", 3, when)]),
    ).toBe("alpha");
  });

  it("treats a missing submittedAt as latest (least preferred) in a tie", () => {
    expect(
      peoplesChoice([
        entry("unknown", 3, null),
        entry("dated", 3, "2026-06-11T09:00:00Z"),
      ]),
    ).toBe("dated");
  });

  it("ignores order of the input (deterministic across query plans)", () => {
    const entries = [
      entry("a", 1, "2026-06-10T00:00:00Z"),
      entry("b", 4, "2026-06-11T00:00:00Z"),
      entry("c", 4, "2026-06-09T00:00:00Z"),
    ];
    expect(peoplesChoice(entries)).toBe("c");
    expect(peoplesChoice([...entries].reverse())).toBe("c");
  });
});

describe("non-scoring guarantee (ADR-0029)", () => {
  it("peoples-choice never imports the scoring module", () => {
    // People's Choice is a parallel recognition award: it must stay
    // structurally incapable of feeding cell-weight scoring or final ranks.
    const source = readFileSync(
      resolve(__dirname, "./peoples-choice.ts"),
      "utf8",
    );
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
    expect(importLines.some((line) => line.includes("scoring"))).toBe(false);
  });
});
