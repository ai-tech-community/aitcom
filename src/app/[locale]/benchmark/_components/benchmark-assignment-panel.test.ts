import { describe, expect, it, vi } from "vitest";

vi.mock("@/trpc/react", () => ({
  api: {
    benchmark: {
      createAssignment: {
        useMutation: vi.fn(),
      },
    },
  },
}));

import {
  ALL_FILTER_VALUE,
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
