import { describe, expect, it } from "vitest";
import {
  isWorkspacePath,
  resolveCommunityIdentityDensity,
  resolveCommunityLayoutVariant,
} from "./layout-variant";

describe("resolveCommunityLayoutVariant", () => {
  it("uses the workspace layout for the course builder", () => {
    expect(
      resolveCommunityLayoutVariant(["classroom", "my-course", "edit"]),
    ).toBe("workspace");
  });
  it("uses the workspace layout for the event editor", () => {
    expect(resolveCommunityLayoutVariant(["events", "new"])).toBe("workspace");
    expect(resolveCommunityLayoutVariant(["events", "my-event", "edit"])).toBe(
      "workspace",
    );
    expect(isWorkspacePath("/communities/hub/events/new")).toBe(true);
  });
  it("uses the workspace layout for the issue builder", () => {
    expect(
      resolveCommunityLayoutVariant(["magazine", "issues", "5", "edit"]),
    ).toBe("workspace");
    expect(isWorkspacePath("/communities/hub/magazine/issues/5/edit")).toBe(
      true,
    );
  });
  it("keeps the standard layout on the Magazine tab", () => {
    expect(resolveCommunityLayoutVariant(["magazine"])).toBe("standard");
    expect(resolveCommunityLayoutVariant(["magazine", "issues", "5"])).toBe(
      "standard",
    );
  });
  it("keeps the standard layout everywhere else", () => {
    for (const segs of [
      [],
      ["classroom"],
      ["classroom", "new"],
      ["classroom", "my-course"],
      ["events"],
      ["events", "x"],
      ["events", "x", "attendees"],
      ["events", "x", "manage"],
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

describe("resolveCommunityIdentityDensity", () => {
  it("shows the full identity on the Overview, even to a member", () => {
    expect(resolveCommunityIdentityDensity([], true)).toBe("full");
    expect(resolveCommunityIdentityDensity(["(feed)"], true)).toBe("full");
  });
  it("keeps a member's other pages compact, so the whole tab list fits", () => {
    for (const segs of [
      ["insights"],
      ["forum"],
      ["settings", "spaces"],
      ["events", "x"],
    ]) {
      expect(resolveCommunityIdentityDensity(segs, true)).toBe("compact");
    }
  });
  it("shows the full identity to someone who is not a member, on every page", () => {
    for (const segs of [[], ["forum"], ["events", "x"]]) {
      expect(resolveCommunityIdentityDensity(segs, false)).toBe("full");
    }
  });
});
