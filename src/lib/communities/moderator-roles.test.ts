import { describe, expect, it } from "vitest";

import { isModeratorRole } from "./moderator-roles";

describe("isModeratorRole", () => {
  it("knows which roles moderate", () => {
    expect(["owner", "admin", "moderator"].every(isModeratorRole)).toBe(true);
    expect(isModeratorRole("member")).toBe(false);
    expect(isModeratorRole(null)).toBe(false);
    expect(isModeratorRole(undefined)).toBe(false);
  });
});
