import { describe, expect, it } from "vitest";

import {
  AssignmentFilterNotFoundError,
  requireAssignmentFilter,
  selectAssignmentPrompts,
} from "./assignment";

describe("selectAssignmentPrompts", () => {
  it("selects prompts with deterministic order and limit", () => {
    const prompts = [
      { id: "b", approvedAt: new Date("2026-01-02") },
      { id: "a", approvedAt: new Date("2026-01-01") },
    ];

    expect(selectAssignmentPrompts(prompts, 1).map((p) => p.id)).toEqual([
      "b",
    ]);
  });

  it("breaks approvedAt ties by id ascending", () => {
    const prompts = [
      { id: "b", approvedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", approvedAt: "2026-01-01T00:00:00.000Z" },
    ];

    expect(selectAssignmentPrompts(prompts, 2).map((p) => p.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns no prompts when limit is below one", () => {
    const prompts = [{ id: "a", approvedAt: new Date("2026-01-01") }];

    expect(selectAssignmentPrompts(prompts, 0)).toEqual([]);
  });
});

describe("requireAssignmentFilter", () => {
  it("throws when a provided category slug is not resolved", () => {
    expect(requireAssignmentFilter).toBeTypeOf("function");
    expect(AssignmentFilterNotFoundError).toBeTypeOf("function");
    expect(() =>
      requireAssignmentFilter("Category", "typo", undefined),
    ).toThrow("Category not found");
  });
});
