import { describe, expect, it } from "vitest";

import { defaultDisplayName } from "./default-display-name";

describe("defaultDisplayName", () => {
  it("uses the account name when there is one", () => {
    expect(defaultDisplayName({ name: "Ada", email: "ada@x.dev" })).toBe("Ada");
  });

  it("falls back to the email local part", () => {
    expect(defaultDisplayName({ name: "", email: "grace@x.dev" })).toBe(
      "grace",
    );
  });

  it("never returns an empty name", () => {
    expect(defaultDisplayName({ name: null, email: null })).toBe("member");
  });
});
