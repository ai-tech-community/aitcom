import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetInvestigationLimits,
  EDIT_LIMIT_PER_HOUR,
  VOTE_LIMIT_PER_HOUR,
  checkInvestigationEditLimit,
  checkInvestigationVoteLimit,
} from "./rate-limit";

afterEach(() => {
  __resetInvestigationLimits();
  vi.useRealTimers();
});

describe("checkInvestigationEditLimit", () => {
  it("allows up to EDIT_LIMIT_PER_HOUR per user", () => {
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      expect(checkInvestigationEditLimit("user-1").allowed).toBe(true);
    }
    expect(checkInvestigationEditLimit("user-1").allowed).toBe(false);
  });

  it("isolates limits per user", () => {
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      checkInvestigationEditLimit("user-a");
    }
    expect(checkInvestigationEditLimit("user-a").allowed).toBe(false);
    expect(checkInvestigationEditLimit("user-b").allowed).toBe(true);
  });

  it("resets after the window passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00Z"));
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      checkInvestigationEditLimit("user-x");
    }
    expect(checkInvestigationEditLimit("user-x").allowed).toBe(false);
    vi.setSystemTime(new Date("2026-05-09T01:00:01Z"));
    expect(checkInvestigationEditLimit("user-x").allowed).toBe(true);
  });
});

describe("checkInvestigationVoteLimit", () => {
  it("uses the vote limit independently of the edit limit", () => {
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      checkInvestigationEditLimit("user-y");
    }
    expect(checkInvestigationEditLimit("user-y").allowed).toBe(false);
    expect(checkInvestigationVoteLimit("user-y").allowed).toBe(true);
  });

  it("allows up to VOTE_LIMIT_PER_HOUR votes", () => {
    for (let i = 0; i < VOTE_LIMIT_PER_HOUR; i++) {
      expect(checkInvestigationVoteLimit("user-z").allowed).toBe(true);
    }
    expect(checkInvestigationVoteLimit("user-z").allowed).toBe(false);
  });
});
