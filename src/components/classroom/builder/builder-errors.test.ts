import { describe, expect, it } from "vitest";
import { builderErrorKey } from "./builder-errors";

describe("builderErrorKey", () => {
  it.each([
    ["COURSE_CHANGED", "errorChangedElsewhere"],
    ["LESSON_CHANGED", "errorChangedElsewhere"],
    ["COURSE_ARCHIVED", "errorArchived"],
    ["MODULE_NOT_EMPTY", "errorModuleNotEmpty"],
    ["LESSON_SET_MISMATCH", "errorOutlineOutOfDate"],
    ["MODULE_COURSE_MISMATCH", "errorOutlineOutOfDate"],
    ["MODULE_SET_MISMATCH", "errorOutlineOutOfDate"],
    ["INVALID_EMBED", "errorInvalidEmbed"],
    ["FORBIDDEN", "errorNotAllowed"],
    ["CANNOT_CREATE_COURSE", "errorCannotCreateCourse"],
    ["something raw from the server", "errorGeneric"],
    [undefined, "errorGeneric"],
  ])("maps %s to %s", (code, key) => {
    expect(builderErrorKey(code)).toBe(key);
  });

  it("does not treat inherited object keys as known codes", () => {
    expect(builderErrorKey("toString")).toBe("errorGeneric");
    expect(builderErrorKey("constructor")).toBe("errorGeneric");
  });
});
