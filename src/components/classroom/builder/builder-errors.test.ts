import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import { builderErrorKey } from "./builder-errors";

describe("builderErrorKey", () => {
  it.each([
    ["COURSE_CHANGED", "errorChangedElsewhere"],
    ["LESSON_CHANGED", "errorLessonChangedElsewhere"],
    ["COURSE_ARCHIVED", "errorArchived"],
    ["MODULE_NOT_EMPTY", "errorModuleNotEmpty"],
    ["LESSON_SET_MISMATCH", "errorOutlineOutOfDate"],
    ["MODULE_COURSE_MISMATCH", "errorOutlineOutOfDate"],
    ["MODULE_SET_MISMATCH", "errorOutlineOutOfDate"],
    ["INVALID_EMBED", "errorInvalidEmbed"],
    ["FORBIDDEN", "errorNotAllowed"],
    ["CANNOT_CREATE_COURSE", "errorCannotCreateCourse"],
    ["PUBLISH_CHECKS_FAILED", "errorPublishChecksFailed"],
    ["something raw from the server", "errorGeneric"],
    [undefined, "errorGeneric"],
  ])("maps %s to %s", (code, key) => {
    expect(builderErrorKey(code)).toBe(key);
  });

  it("does not treat inherited object keys as known codes", () => {
    expect(builderErrorKey("toString")).toBe("errorGeneric");
    expect(builderErrorKey("constructor")).toBe("errorGeneric");
  });

  it("has friendly English and Dutch copy for every key", () => {
    const codes = [
      "COURSE_CHANGED",
      "LESSON_CHANGED",
      "COURSE_ARCHIVED",
      "MODULE_NOT_EMPTY",
      "LESSON_SET_MISMATCH",
      "INVALID_EMBED",
      "FORBIDDEN",
      "CANNOT_CREATE_COURSE",
      "PUBLISH_CHECKS_FAILED",
      undefined,
    ];
    for (const code of codes) {
      const key = builderErrorKey(code);
      expect(en.classroomBuilder[key]).toEqual(expect.any(String));
      expect(nl.classroomBuilder[key]).toEqual(expect.any(String));
    }
  });
});
