import { describe, it, expect } from "vitest";

import { hackathonPhase, type TeamPhaseMarkers } from "./phase";

function team(overrides: Partial<TeamPhaseMarkers> = {}): TeamPhaseMarkers {
  return {
    status: "forming",
    finalRank: null,
    prizeAwardedAt: null,
    ...overrides,
  };
}

describe("hackathonPhase", () => {
  it("is draft while the event is a draft, regardless of team markers", () => {
    expect(
      hackathonPhase({
        eventStatus: "draft",
        challengeStatus: "draft",
        judgingOpenedAt: null,
        teams: [],
      }),
    ).toBe("draft");
    // Defensive: even stray finalize markers never resurrect a draft.
    expect(
      hackathonPhase({
        eventStatus: "draft",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [team({ finalRank: 1 })],
      }),
    ).toBe("draft");
  });

  it("is never live for a cancelled or rejected event", () => {
    for (const eventStatus of ["cancelled", "rejected"]) {
      expect(
        hackathonPhase({
          eventStatus,
          challengeStatus: "active",
          judgingOpenedAt: null,
          teams: [team()],
        }),
      ).toBe("draft");
      // Even stray finalize markers stay closed once the event is cancelled.
      expect(
        hackathonPhase({
          eventStatus,
          challengeStatus: "active",
          judgingOpenedAt: null,
          teams: [team({ finalRank: 1 })],
        }),
      ).toBe("draft");
    }
  });

  it("is live once published with no locked teams and no finalize markers", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [team(), team()],
      }),
    ).toBe("live");
  });

  it("is live when published with zero teams", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [],
      }),
    ).toBe("live");
  });

  it("is locked once any team's roster is locked", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [team(), team({ status: "locked" })],
      }),
    ).toBe("locked");
  });

  it("is finalized once any team carries a finalRank", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [team({ status: "locked", finalRank: 1 })],
      }),
    ).toBe("finalized");
  });

  it("is finalized once any team carries a prizeAwardedAt", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [team({ status: "locked", prizeAwardedAt: new Date() })],
      }),
    ).toBe("finalized");
  });

  it("is finalized when the challenge status is completed, even with no teams", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "completed",
        judgingOpenedAt: null,
        teams: [],
      }),
    ).toBe("finalized");
  });

  it("prefers finalized over locked when both markers are present", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: null,
        teams: [team({ status: "locked" }), team({ finalRank: 2 })],
      }),
    ).toBe("finalized");
  });

  it("advances a locked hackathon to judging once judgingOpenedAt is set", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: new Date(),
        teams: [team({ status: "locked" })],
      }),
    ).toBe("judging");
  });

  it("prefers finalized over judging when finalize markers are present", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: new Date(),
        teams: [team({ status: "locked", finalRank: 1 })],
      }),
    ).toBe("finalized");
  });

  it("stays live (not judging) when no team is locked yet", () => {
    expect(
      hackathonPhase({
        eventStatus: "published",
        challengeStatus: "active",
        judgingOpenedAt: new Date(),
        teams: [team(), team()],
      }),
    ).toBe("live");
  });
});
