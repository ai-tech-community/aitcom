import { describe, expect, it } from "vitest";

import { createCollaborativeGridSchema } from "./work-grid-schema";

/**
 * Pure (no-database) tests of the createCollaborativeGrid input refinement from
 * ADR-0022: a grid must be scoped to EXACTLY ONE of a challenge or a community.
 * An unscoped grid skips all authz (`requireGridAdmin` only runs after a valid
 * input) and would enable self-minted XP, so this refinement is a security
 * firebreak — assert it rejects both-null and both-set, and accepts exactly-one.
 */
describe("createCollaborativeGridSchema scoping refinement", () => {
  const cells = [{ taskType: "solve-code-cell" as const }];

  it("accepts EXACTLY a challenge scope", () => {
    const result = createCollaborativeGridSchema.safeParse({
      challengeId: 42,
      cells,
    });
    expect(result.success).toBe(true);
  });

  it("accepts EXACTLY a community scope", () => {
    const result = createCollaborativeGridSchema.safeParse({
      communityId: "comm-1",
      cells,
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS an unscoped grid (both null/undefined) — the self-minted-XP firebreak", () => {
    const result = createCollaborativeGridSchema.safeParse({ cells });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/exactly one/i);
    }
  });

  it("REJECTS a doubly-scoped grid (both challenge AND community set)", () => {
    const result = createCollaborativeGridSchema.safeParse({
      challengeId: 42,
      communityId: "comm-1",
      cells,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/exactly one/i);
    }
  });

  it("still requires at least one cell regardless of scope", () => {
    const result = createCollaborativeGridSchema.safeParse({
      communityId: "comm-1",
      cells: [],
    });
    expect(result.success).toBe(false);
  });

  it("defaults a cell's verificationMode to self-report", () => {
    const result = createCollaborativeGridSchema.safeParse({
      communityId: "comm-1",
      cells: [{ taskType: "polish-text" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cells[0]!.verificationMode).toBe("self-report");
    }
  });
});
