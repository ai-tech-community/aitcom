import { describe, it, expect } from "vitest";

import { splitPodium, prizeRecipients } from "./winners";

interface Row {
  teamId: string;
  finalRank: number | null;
  score: number;
}

function row(teamId: string, finalRank: number | null, score: number): Row {
  return { teamId, finalRank, score };
}

describe("splitPodium", () => {
  it("puts ranks 1..3 on the podium in rank order and the rest in the field", () => {
    const rows = [
      row("d", 4, 10),
      row("b", 2, 40),
      row("a", 1, 50),
      row("c", 3, 30),
    ];
    const { podium, field } = splitPodium(rows);
    expect(podium.map((t) => t.teamId)).toEqual(["a", "b", "c"]);
    expect(field.map((t) => t.teamId)).toEqual(["d"]);
  });

  it("orders the field with ranked teams first, then unranked by score desc", () => {
    const rows = [
      row("never-submitted-low", null, 5),
      row("fifth", 5, 12),
      row("never-submitted-high", null, 20),
      row("first", 1, 90),
      row("fourth", 4, 15),
    ];
    const { podium, field } = splitPodium(rows);
    expect(podium.map((t) => t.teamId)).toEqual(["first"]);
    expect(field.map((t) => t.teamId)).toEqual([
      "fourth",
      "fifth",
      "never-submitted-high",
      "never-submitted-low",
    ]);
  });

  it("handles fewer ranked teams than podium slots", () => {
    const rows = [row("only", 1, 10), row("unranked", null, 0)];
    const { podium, field } = splitPodium(rows);
    expect(podium.map((t) => t.teamId)).toEqual(["only"]);
    expect(field.map((t) => t.teamId)).toEqual(["unranked"]);
  });

  it("returns empty halves for no teams", () => {
    expect(splitPodium([])).toEqual({ podium: [], field: [] });
  });

  it("does not mutate its input", () => {
    const rows = [row("b", 2, 1), row("a", 1, 2)];
    const copy = [...rows];
    splitPodium(rows);
    expect(rows).toEqual(copy);
  });
});

interface PrizeRow {
  teamId: string;
  finalRank: number | null;
  prizeAwarded: boolean;
}

function prizeRow(
  teamId: string,
  finalRank: number | null,
  prizeAwarded: boolean,
): PrizeRow {
  return { teamId, finalRank, prizeAwarded };
}

describe("prizeRecipients", () => {
  it("attributes the prize to the team with the disbursement marker", () => {
    const rows = [
      prizeRow("current-rank-1", 1, false),
      prizeRow("paid-at-first-finalize", 2, true),
      prizeRow("third", 3, false),
    ];
    expect(prizeRecipients(rows).map((t) => t.teamId)).toEqual([
      "paid-at-first-finalize",
    ]);
  });

  it("ignores finalRank entirely when a marker exists, even off the podium", () => {
    const rows = [
      prizeRow("rank-1", 1, false),
      prizeRow("dropped-to-fifth", 5, true),
    ];
    expect(prizeRecipients(rows).map((t) => t.teamId)).toEqual([
      "dropped-to-fifth",
    ]);
  });

  it("falls back to current rank-1 when no team carries the marker (legacy data)", () => {
    const rows = [
      prizeRow("second", 2, false),
      prizeRow("first", 1, false),
      prizeRow("unranked", null, false),
    ];
    expect(prizeRecipients(rows).map((t) => t.teamId)).toEqual(["first"]);
  });

  it("returns empty when nothing is finalized yet", () => {
    const rows = [prizeRow("a", null, false), prizeRow("b", null, false)];
    expect(prizeRecipients(rows)).toEqual([]);
  });

  it("returns empty for no teams", () => {
    expect(prizeRecipients([])).toEqual([]);
  });
});
