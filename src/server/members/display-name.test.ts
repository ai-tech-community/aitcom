import { expect, it } from "vitest";

import { shownMemberName } from "./display-name";

it("uses the profile display name the member directory shows", () => {
  expect(shownMemberName("gregy", "greg")).toBe("gregy");
});

it("falls back to the account name when the profile name is blank", () => {
  expect(shownMemberName(null, "greg")).toBe("greg");
  expect(shownMemberName("  ", "greg")).toBe("greg");
});

it("returns null when the member has no name", () => {
  expect(shownMemberName(null, null)).toBeNull();
  expect(shownMemberName(" ", " ")).toBeNull();
});
