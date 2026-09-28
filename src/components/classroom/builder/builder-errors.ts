/**
 * Server error codes → keys in the `classroomBuilder` messages namespace.
 * Raw server text never reaches the UI: anything unknown maps to `errorGeneric`.
 */
const KEYS = {
  COURSE_CHANGED: "errorChangedElsewhere",
  LESSON_CHANGED: "errorLessonChangedElsewhere",
  COURSE_ARCHIVED: "errorArchived",
  MODULE_NOT_EMPTY: "errorModuleNotEmpty",
  LESSON_SET_MISMATCH: "errorOutlineOutOfDate",
  MODULE_COURSE_MISMATCH: "errorOutlineOutOfDate",
  MODULE_SET_MISMATCH: "errorOutlineOutOfDate",
  INVALID_EMBED: "errorInvalidEmbed",
  FORBIDDEN: "errorNotAllowed",
  CANNOT_CREATE_COURSE: "errorCannotCreateCourse",
  PUBLISH_CHECKS_FAILED: "errorPublishChecksFailed",
} as const;

type BuilderErrorCode = keyof typeof KEYS;

export type BuilderErrorKey = (typeof KEYS)[BuilderErrorCode] | "errorGeneric";

function isBuilderErrorCode(message: string): message is BuilderErrorCode {
  // Own keys only, so "toString" / "constructor" never resolve to prototype members.
  return Object.hasOwn(KEYS, message);
}

export function builderErrorKey(message: string | undefined): BuilderErrorKey {
  return message && isBuilderErrorCode(message) ? KEYS[message] : "errorGeneric";
}
