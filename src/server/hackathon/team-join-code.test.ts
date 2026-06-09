import { describe, it, expect } from "vitest";
import { generateTeamJoinCode } from "./team-join-code";

describe("generateTeamJoinCode", () => {
  it("matches the TEAM-XXXXXXXX format (8 unambiguous chars)", () => {
    expect(generateTeamJoinCode()).toMatch(/^TEAM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("is non-deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateTeamJoinCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});
