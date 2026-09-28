import { describe, expect, it } from "vitest";
import {
  isWorkspacePath,
  resolveCommunityLayoutVariant,
} from "./layout-variant";

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

describe("isWorkspacePath", () => {
  it("is true for a community workspace page (locale-free path)", () => {
    expect(isWorkspacePath("/communities/hub/classroom/my-course/edit")).toBe(
      true,
    );
    expect(isWorkspacePath("/communities/hub/classroom/my-course/edit/")).toBe(
      true,
    );
  });
  it("is false everywhere else", () => {
    for (const path of [
      "/",
      "/communities",
      "/communities/hub",
      "/communities/hub/classroom",
      "/communities/hub/classroom/my-course",
      "/classroom/my-course/edit",
      "/events/x/classroom/c/edit",
    ]) {
      expect(isWorkspacePath(path)).toBe(false);
    }
  });
});
