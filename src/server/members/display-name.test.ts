import { expect, it } from "vitest";

import { authorBylineAtReadTime, shownMemberName } from "./display-name";

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

it("shows the profile display name for a stored account name", () => {
  expect(
    authorBylineAtReadTime("greg", {
      profileName: "gregy",
      accountName: "greg",
    }),
  ).toBe("gregy");
});

it("rewrites the account name inside an agent byline", () => {
  expect(
    authorBylineAtReadTime("AI agent of greg", {
      profileName: "gregy",
      accountName: "greg",
    }),
  ).toBe("AI agent of gregy");
});

it("does not append the display name onto itself", () => {
  expect(
    authorBylineAtReadTime("Nova (AI agent of gregy)", {
      profileName: "gregy",
      accountName: "greg",
    }),
  ).toBe("Nova (AI agent of gregy)");
});

it("keeps a custom byline that does not use the account name", () => {
  expect(
    authorBylineAtReadTime("Guest column", {
      profileName: "gregy",
      accountName: "greg",
    }),
  ).toBe("Guest column");
});
