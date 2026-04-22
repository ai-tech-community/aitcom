import { describe, expect, it } from "vitest";
import { resolvePrimaryCategory } from "./primary-category";

describe("resolvePrimaryCategory", () => {
  it("returns the category in brand.categoryIds with the most mentions", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a", "cat-b"],
      mentionCountsByCategory: { "cat-a": 5, "cat-b": 12 },
    });
    expect(result).toBe("cat-b");
  });

  it("falls back to first brand.categoryIds element on tie", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a", "cat-b"],
      mentionCountsByCategory: { "cat-a": 3, "cat-b": 3 },
    });
    expect(result).toBe("cat-a");
  });

  it("falls back to first brand.categoryIds element when no mention counts present", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a", "cat-b"],
      mentionCountsByCategory: {},
    });
    expect(result).toBe("cat-a");
  });

  it("uses inferred category with most mentions when brand.categoryIds is empty", () => {
    const result = resolvePrimaryCategory({
      categoryIds: [],
      mentionCountsByCategory: { "cat-x": 4, "cat-y": 9 },
    });
    expect(result).toBe("cat-y");
  });

  it("returns null when brand.categoryIds is empty and no mentions recorded", () => {
    const result = resolvePrimaryCategory({
      categoryIds: [],
      mentionCountsByCategory: {},
    });
    expect(result).toBeNull();
  });

  it("ignores categories outside brand.categoryIds when list is non-empty", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a"],
      mentionCountsByCategory: { "cat-a": 1, "cat-unrelated": 100 },
    });
    expect(result).toBe("cat-a");
  });
});
