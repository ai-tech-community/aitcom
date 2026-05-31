import { describe, it, expect } from "vitest";
import {
  computeActivationStage,
  selectActivationFunnel,
  type ActivationConfig,
} from "./activation";

const DEFAULT_CFG: ActivationConfig = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};
const C = new Date("2026-06-01T00:00:00.000Z"); // contribution time
const within = new Date("2026-06-05T00:00:00.000Z"); // +4d
const after = new Date("2026-06-10T00:00:00.000Z"); // +9d

describe("computeActivationStage", () => {
  it("unactivated when no contribution", () => {
    expect(
      computeActivationStage({
        firstContributionAt: null,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: within,
      }),
    ).toBe("unactivated");
  });
  it("awaiting_response when contributed, no response yet, window open", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: within,
      }),
    ).toBe("awaiting_response");
  });
  it("activated when response received within window", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: within,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: after,
      }),
    ).toBe("activated");
  });
  it("stalled when window closed without a response", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: after,
      }),
    ).toBe("stalled");
  });
  it("late response (after window) does not activate", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: after,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: after,
      }),
    ).toBe("stalled");
  });
  it("relaxed (no response required) activates on contribution alone", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: {
          requireResponse: false,
          requireProfileComplete: false,
          windowDays: 7,
        },
        now: within,
      }),
    ).toBe("activated");
  });
  it("awaiting_profile when response ok but profile required and incomplete", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: within,
        profileComplete: false,
        config: {
          requireResponse: true,
          requireProfileComplete: true,
          windowDays: 7,
        },
        now: after,
      }),
    ).toBe("awaiting_profile");
  });
  it("activated when response + profile both satisfied", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: within,
        profileComplete: true,
        config: {
          requireResponse: true,
          requireProfileComplete: true,
          windowDays: 7,
        },
        now: after,
      }),
    ).toBe("activated");
  });
  it("awaiting_response at exactly the deadline with no response (window inclusive)", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: new Date("2026-06-08T00:00:00.000Z"),
      }),
    ).toBe("awaiting_response");
  });
  it("activated when response lands exactly at the deadline", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: new Date("2026-06-08T00:00:00.000Z"),
        profileComplete: false,
        config: DEFAULT_CFG,
        now: new Date("2026-06-09T00:00:00.000Z"),
      }),
    ).toBe("activated");
  });
  it("stalled one millisecond after the deadline with no response", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: new Date("2026-06-08T00:00:00.001Z"),
      }),
    ).toBe("stalled");
  });
  it("awaiting_profile persists indefinitely (profile gate is not time-bounded)", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: new Date("2026-06-03T00:00:00.000Z"),
        profileComplete: false,
        config: {
          requireResponse: true,
          requireProfileComplete: true,
          windowDays: 7,
        },
        now: new Date("2026-09-01T00:00:00.000Z"), // ~3 months later
      }),
    ).toBe("awaiting_profile");
  });
});

describe("selectActivationFunnel", () => {
  it("counts cohort, contributed, responded, activated, and per-stage", () => {
    const f = selectActivationFunnel({
      config: DEFAULT_CFG,
      now: after,
      members: [
        {
          userId: "a",
          firstContributionAt: null,
          firstResponseReceivedAt: null,
          profileComplete: false,
        },
        {
          userId: "b",
          firstContributionAt: C,
          firstResponseReceivedAt: null,
          profileComplete: false,
        },
        {
          userId: "c",
          firstContributionAt: C,
          firstResponseReceivedAt: within,
          profileComplete: false,
        },
      ],
    });
    expect(f.cohortSize).toBe(3);
    expect(f.contributed).toBe(2);
    expect(f.responded).toBe(1);
    expect(f.activated).toBe(1);
    expect(f.byStage.unactivated).toBe(1);
    expect(f.byStage.stalled).toBe(1);
    expect(f.byStage.activated).toBe(1);
  });
  it("buckets a member with no response yet as awaiting_response when window still open", () => {
    const f = selectActivationFunnel({
      config: DEFAULT_CFG,
      now: within, // +4d, window open
      members: [
        {
          userId: "x",
          firstContributionAt: C,
          firstResponseReceivedAt: null,
          profileComplete: false,
        },
      ],
    });
    expect(f.byStage.awaiting_response).toBe(1);
    expect(f.contributed).toBe(1);
    expect(f.responded).toBe(0);
    expect(f.activated).toBe(0);
  });
  it("handles an empty cohort", () => {
    const f = selectActivationFunnel({
      config: DEFAULT_CFG,
      now: after,
      members: [],
    });
    expect(f.cohortSize).toBe(0);
    expect(f.activated).toBe(0);
    expect(f.byStage.unactivated).toBe(0);
  });
});
