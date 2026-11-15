import { describe, expect, it } from "vitest";
import {
  isCommunityOverview,
  isOutsiderRoute,
  isWorkspacePath,
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

describe("isCommunityOverview", () => {
  it("is the community's root page", () => {
    expect(isCommunityOverview([])).toBe(true);
  });
  it("ignores route groups", () => {
    expect(isCommunityOverview(["(authoring)"])).toBe(true);
  });
  it("is not any tab page", () => {
    expect(isCommunityOverview(["forum"])).toBe(false);
    expect(isCommunityOverview(["events", "abc"])).toBe(false);
  });
});

describe("isOutsiderRoute", () => {
  it("keeps the paid offers open to someone on their way in", () => {
    expect(isOutsiderRoute(["offers"])).toBe(true);
    expect(isOutsiderRoute(["offers", "42"])).toBe(true);
    expect(isOutsiderRoute(["(group)", "offers"])).toBe(true);
  });

  it("closes the Overview and every tab", () => {
    for (const segments of [
      [],
      ["forum"],
      ["members"],
      ["gallery"],
      ["magazine"],
      ["events"],
      ["spaces", "general"],
      ["referrals"],
    ]) {
      expect(isOutsiderRoute(segments)).toBe(false);
    }
  });
});
