import { describe, expect, it } from "vitest";
import { resolveCommunityLayoutVariant } from "./layout-variant";

describe("resolveCommunityLayoutVariant", () => {
  it("uses the workspace layout for the course builder", () => {
    expect(
      resolveCommunityLayoutVariant(["classroom", "my-course", "edit"]),
    ).toBe("workspace");
  });
  it("keeps the standard layout everywhere else", () => {
    for (const segs of [
      [],
      ["classroom"],
      ["classroom", "new"],
      ["classroom", "my-course"],
      ["events", "x", "edit"],
      ["classroom", "edit"],
    ]) {
      expect(resolveCommunityLayoutVariant(segs)).toBe("standard");
    }
  });
  it("ignores route groups", () => {
    expect(
      resolveCommunityLayoutVariant(["(authoring)", "classroom", "c", "edit"]),
    ).toBe("workspace");
  });
});
