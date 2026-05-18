import { describe, expect, it, vi } from "vitest";

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: vi.fn(() => ({
      benchmark: {
        listOpenAssignments: { invalidate: vi.fn() },
        listMyAssignments: { invalidate: vi.fn() },
      },
    })),
    benchmark: {
      listOpenAssignments: { useQuery: vi.fn() },
      listMyAssignments: { useQuery: vi.fn() },
      grabAssignment: { useMutation: vi.fn() },
      releaseAssignment: { useMutation: vi.fn() },
    },
  },
}));

import {
  ALL_FILTER_VALUE,
  buildAgentRunSampleValues,
  resolveSelectedSlug,
} from "./benchmark-assignment-panel";

describe("resolveSelectedSlug", () => {
  const rows = [
    { id: "cat-1", slug: "ai-tools" },
    { id: "cat-2", slug: "crm" },
  ];

  it("returns undefined for the all filter", () => {
    expect(resolveSelectedSlug(rows, ALL_FILTER_VALUE)).toBeUndefined();
  });

  it("returns the slug for the selected id", () => {
    expect(resolveSelectedSlug(rows, "cat-2")).toBe("crm");
  });

  it("returns undefined when the selected id is not loaded", () => {
    expect(resolveSelectedSlug(rows, "missing")).toBeUndefined();
  });
});

describe("buildAgentRunSampleValues", () => {
  it("uses assignment metadata when present", () => {
    expect(
      buildAgentRunSampleValues({
        modelProvider: "anthropic",
        modelId: "claude-opus-4.5",
        locale: "nl-NL",
      }),
    ).toEqual({
      modelProvider: "anthropic",
      modelId: "claude-opus-4.5",
      locale: "nl-NL",
    });
  });

  it("keeps placeholders for missing optional model metadata", () => {
    expect(buildAgentRunSampleValues({ locale: "nl-NL" })).toEqual({
      modelProvider: "openai",
      modelId: "gpt-5-pro",
      locale: "nl-NL",
    });
  });
});
