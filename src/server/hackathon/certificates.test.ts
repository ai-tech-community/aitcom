import { describe, it, expect } from "vitest";

import { certificateAwards } from "./certificates";

interface Team {
  teamId: string;
  submitted: boolean;
  finalRank: number | null;
  prizeAwarded: boolean;
}

function team(
  teamId: string,
  submitted: boolean,
  finalRank: number | null,
  prizeAwarded: boolean,
): Team {
  return { teamId, submitted, finalRank, prizeAwarded };
}

function member(teamId: string, userId: string) {
  return { teamId, userId };
}

describe("certificateAwards", () => {
  it("gives winner certificates to members of the prize-marker team and participant certificates to other submitted teams", () => {
    const teams = [
      team("winners", true, 1, true),
      team("runners-up", true, 2, false),
      team("third", true, 3, false),
    ];
    const members = [
      member("winners", "w1"),
      member("winners", "w2"),
      member("runners-up", "r1"),
      member("third", "t1"),
    ];
    expect(certificateAwards(teams, members)).toEqual([
      { userId: "w1", kind: "winner" },
      { userId: "w2", kind: "winner" },
      { userId: "r1", kind: "participant" },
      { userId: "t1", kind: "participant" },
    ]);
  });

  it("follows the disbursement marker, not the recomputed rank (re-finalize)", () => {
    // After a re-finalize the current rank-1 team may differ from the team
    // that was actually paid; the certificate follows the payment.
    const teams = [
      team("new-rank-1", true, 1, false),
      team("paid-at-first-finalize", true, 2, true),
    ];
    const members = [
      member("new-rank-1", "a"),
      member("paid-at-first-finalize", "b"),
    ];
    expect(certificateAwards(teams, members)).toEqual([
      { userId: "a", kind: "participant" },
      { userId: "b", kind: "winner" },
    ]);
  });

  it("falls back to current rank 1 when no team carries the marker (legacy finalize)", () => {
    const teams = [
      team("first", true, 1, false),
      team("second", true, 2, false),
    ];
    const members = [member("first", "a"), member("second", "b")];
    expect(certificateAwards(teams, members)).toEqual([
      { userId: "a", kind: "winner" },
      { userId: "b", kind: "participant" },
    ]);
  });

  it("issues nothing to members of teams that never submitted", () => {
    const teams = [
      team("winners", true, 1, true),
      team("never-submitted", false, null, false),
    ];
    const members = [
      member("winners", "w"),
      member("never-submitted", "ghost"),
    ];
    expect(certificateAwards(teams, members)).toEqual([
      { userId: "w", kind: "winner" },
    ]);
  });

  it("ignores members whose team is not in the team list", () => {
    const teams = [team("winners", true, 1, true)];
    const members = [member("winners", "w"), member("unknown-team", "x")];
    expect(certificateAwards(teams, members)).toEqual([
      { userId: "w", kind: "winner" },
    ]);
  });

  it("emits at most one certificate per user, winner taking precedence", () => {
    // Defensive: duplicate membership rows must never yield duplicate
    // certificates (the db unique constraint backs this structurally).
    const teams = [
      team("winners", true, 1, true),
      team("others", true, 2, false),
    ];
    const members = [
      member("others", "dup"),
      member("winners", "dup"),
      member("others", "dup"),
    ];
    expect(certificateAwards(teams, members)).toEqual([
      { userId: "dup", kind: "winner" },
    ]);
  });

  it("is deterministic across re-runs with the same input (idempotent issuance set)", () => {
    const teams = [
      team("winners", true, 1, true),
      team("others", true, 2, false),
    ];
    const members = [member("winners", "w"), member("others", "p")];
    const first = certificateAwards(teams, members);
    const second = certificateAwards(teams, members);
    expect(second).toEqual(first);
  });

  it("returns empty when no teams submitted", () => {
    const teams = [team("forming", false, null, false)];
    expect(certificateAwards(teams, [member("forming", "a")])).toEqual([]);
  });

  it("returns empty for no teams or no members", () => {
    expect(certificateAwards([], [])).toEqual([]);
    expect(certificateAwards([team("t", true, 1, true)], [])).toEqual([]);
  });
});
