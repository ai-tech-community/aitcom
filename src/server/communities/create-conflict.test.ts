import { describe, expect, it } from "vitest";
import { communityInsertConflictField } from "./create-conflict";

describe("communityInsertConflictField", () => {
  it.each([
    ["community_name_unique", "name"],
    ["community_name_key", "name"],
    ["community_slug_unique", "slug"],
    ["community_slug_key", "slug"],
  ])(
    "maps %s to %s through a wrapped PostgreSQL error",
    (constraint, field) => {
      const error = new Error("Insert failed", {
        cause: { code: "23505", constraint },
      });
      expect(communityInsertConflictField(error)).toBe(field);
    },
  );

  it("requires a unique violation on a recognized constraint", () => {
    expect(
      communityInsertConflictField({
        code: "23503",
        constraint: "community_name_key",
      }),
    ).toBeNull();
    expect(
      communityInsertConflictField({
        code: "23505",
        constraint: "community_pkey",
      }),
    ).toBeNull();
  });
});
