import { describe, expect, it } from "vitest";
import { parseMembersHubTab, writeMembersHubTab } from "./members-hub-tab";

const read = (search: string, canManage: boolean) =>
  parseMembersHubTab(new URLSearchParams(search), canManage);

describe("members hub tab param", () => {
  it("opens the directory when the URL names no tab", () => {
    expect(read("", true)).toBe("directory");
  });

  it("opens the tab the URL names", () => {
    expect(read("tab=profile", false)).toBe("profile");
    expect(read("tab=matches", true)).toBe("matches");
    expect(read("tab=introductions", true)).toBe("introductions");
  });

  it("falls back to the directory for a tab the viewer may not open", () => {
    expect(read("tab=matches", false)).toBe("directory");
    expect(read("tab=introductions", false)).toBe("directory");
  });

  it("falls back to the directory for an unknown tab", () => {
    expect(read("tab=settings", true)).toBe("directory");
    expect(read("tab=", true)).toBe("directory");
  });

  it("writes the tab and keeps other params", () => {
    const next = writeMembersHubTab(new URLSearchParams("ref=mail"), "matches");
    expect(next.toString()).toBe("ref=mail&tab=matches");
  });

  it("drops the param for the directory, so its URL stays clean", () => {
    const next = writeMembersHubTab(
      new URLSearchParams("tab=profile&ref=mail"),
      "directory",
    );
    expect(next.toString()).toBe("ref=mail");
  });
});
