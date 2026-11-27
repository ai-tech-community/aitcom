import { describe, expect, it } from "vitest";
import {
  canOpenMatchingTab,
  defaultMatchingTab,
  matchingRedirectFromPeople,
  parseMatchingTab,
  writeMatchingTab,
} from "./find-a-match-tab";

const read = (search: string, canManage: boolean) =>
  parseMatchingTab(new URLSearchParams(search), canManage);
const redirectFrom = (search: string) =>
  matchingRedirectFromPeople(new URLSearchParams(search))?.toString() ?? null;

describe("find a match tab param", () => {
  it("opens Matches for owners and admins, and the profile for members", () => {
    expect(defaultMatchingTab(true)).toBe("matches");
    expect(defaultMatchingTab(false)).toBe("profile");
    expect(read("", true)).toBe("matches");
    expect(read("", false)).toBe("profile");
  });

  it("lets every member open the profile, and only organizers the rest", () => {
    expect(canOpenMatchingTab("profile", false)).toBe(true);
    expect(canOpenMatchingTab("matches", false)).toBe(false);
    expect(canOpenMatchingTab("introductions", false)).toBe(false);
    expect(canOpenMatchingTab("matches", true)).toBe(true);
    expect(canOpenMatchingTab("introductions", true)).toBe(true);
    expect(canOpenMatchingTab("profile", true)).toBe(true);
  });

  it("opens the tab the URL names", () => {
    expect(read("tab=profile", true)).toBe("profile");
    expect(read("tab=introductions", true)).toBe("introductions");
    expect(read("tab=profile", false)).toBe("profile");
  });

  it("falls back to the profile for a tab a member may not open", () => {
    expect(read("tab=matches", false)).toBe("profile");
    expect(read("tab=introductions", false)).toBe("profile");
  });

  it("falls back to the default for an unknown tab", () => {
    expect(read("tab=directory", true)).toBe("matches");
    expect(read("tab=settings", false)).toBe("profile");
    expect(read("tab=", true)).toBe("matches");
  });

  it("writes the tab and keeps other params", () => {
    const next = writeMatchingTab(
      new URLSearchParams("ref=mail"),
      "introductions",
      true,
    );
    expect(next.toString()).toBe("ref=mail&tab=introductions");
  });

  it("drops the param for the viewer's default tab, so its URL stays clean", () => {
    expect(
      writeMatchingTab(
        new URLSearchParams("tab=introductions&ref=mail"),
        "matches",
        true,
      ).toString(),
    ).toBe("ref=mail");
    expect(
      writeMatchingTab(
        new URLSearchParams("ref=mail"),
        "profile",
        false,
      ).toString(),
    ).toBe("ref=mail");
    expect(
      writeMatchingTab(
        new URLSearchParams("ref=mail"),
        "profile",
        true,
      ).toString(),
    ).toBe("ref=mail&tab=profile");
  });

  it("sends old People links for a matching tab to Find a match", () => {
    expect(redirectFrom("tab=profile&ref=mail")).toBe("tab=profile&ref=mail");
    expect(redirectFrom("tab=matches")).toBe("tab=matches");
    expect(redirectFrom("tab=introductions")).toBe("tab=introductions");
  });

  it("keeps People links for the directory or no tab on People", () => {
    expect(redirectFrom("tab=directory")).toBeNull();
    expect(redirectFrom("")).toBeNull();
    expect(redirectFrom("ref=mail")).toBeNull();
  });
});
