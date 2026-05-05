import { describe, expect, it } from "vitest";

import {
  AssignmentFilterNotFoundError,
  AssignmentMetadataMismatchError,
  requireAssignmentFilter,
  selectAssignmentPrompts,
  validateAssignmentRunMetadata,
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

describe("validateAssignmentRunMetadata", () => {
  it("rejects provider mismatch when assignment provider is set", () => {
    expect(validateAssignmentRunMetadata).toBeTypeOf("function");
    expect(AssignmentMetadataMismatchError).toBeTypeOf("function");
    expect(() =>
      validateAssignmentRunMetadata(
        { modelProvider: "openai", modelId: null, locale: "en-US" },
        { modelProvider: "anthropic", modelId: "claude-opus", locale: "en-US" },
      ),
    ).toThrow("Assignment model provider must match");
  });

  it("rejects model id and locale mismatches when assignment fields are set", () => {
    expect(() =>
      validateAssignmentRunMetadata(
        { modelProvider: null, modelId: "gpt-5", locale: "en-US" },
        { modelProvider: "openai", modelId: "gpt-4.1", locale: "nl-NL" },
      ),
    ).toThrow("Assignment model id must match");

    expect(() =>
      validateAssignmentRunMetadata(
        { modelProvider: null, modelId: null, locale: "en-US" },
        { modelProvider: "openai", modelId: "gpt-5", locale: "nl-NL" },
      ),
    ).toThrow("Assignment locale must match");
  });

  it("allows unset model metadata and matching locale", () => {
    expect(() =>
      validateAssignmentRunMetadata(
        { modelProvider: null, modelId: null, locale: "en-US" },
        { modelProvider: "openai", modelId: "gpt-5", locale: "en-US" },
      ),
    ).not.toThrow();
  });
});
