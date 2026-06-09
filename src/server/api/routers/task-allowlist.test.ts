import { describe, expect, it } from "vitest";

import { isTaskTypeAllowed } from "./task-allowlist";

/**
 * The task-type allowlist firebreak from ADR-0022: a cell whose task type is
 * outside the commission's allowlist must be rejected before the agent works
 * it. These are pure unit tests of that gate — no database.
 */
describe("isTaskTypeAllowed", () => {
  const allowlist = ["polish-text", "solve-code-cell"];

  it("permits a task type that is in the allowlist", () => {
    expect(isTaskTypeAllowed(allowlist, "polish-text")).toBe(true);
    expect(isTaskTypeAllowed(allowlist, "solve-code-cell")).toBe(true);
  });

  it("rejects a task type outside the allowlist (the firebreak)", () => {
    expect(isTaskTypeAllowed(allowlist, "read-owner-dms")).toBe(false);
    expect(isTaskTypeAllowed(allowlist, "deploy-to-prod")).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isTaskTypeAllowed([], "polish-text")).toBe(false);
  });

  it("rejects everything when the allowlist is missing (null/undefined)", () => {
    expect(isTaskTypeAllowed(null, "polish-text")).toBe(false);
    expect(isTaskTypeAllowed(undefined, "polish-text")).toBe(false);
  });

  it("is an exact-match gate — no prefix or substring leakage", () => {
    expect(isTaskTypeAllowed(allowlist, "polish")).toBe(false);
    expect(isTaskTypeAllowed(allowlist, "polish-text-evil")).toBe(false);
    expect(isTaskTypeAllowed(allowlist, "")).toBe(false);
  });

  it("treats an allowlist of one as a sound envelope", () => {
    expect(isTaskTypeAllowed(["polish-text"], "polish-text")).toBe(true);
    expect(isTaskTypeAllowed(["polish-text"], "solve-code-cell")).toBe(false);
  });
});
