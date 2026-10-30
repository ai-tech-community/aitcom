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
  INVALID_MATERIAL: "errorInvalidMaterial",
  FORBIDDEN: "errorNotAllowed",
  CANNOT_CREATE_COURSE: "errorCannotCreateCourse",
  PUBLISH_CHECKS_FAILED: "errorPublishChecksFailed",
} as const;

type BuilderErrorCode = keyof typeof KEYS;

/**
 * The codes that mean "someone else changed this first": the builder's
 * autosaves report a conflict (the reload banner), not an error.
 */
export const CLASSROOM_CONFLICT_CODES: ReadonlySet<BuilderErrorCode> = new Set([
  "COURSE_CHANGED",
  "LESSON_CHANGED",
]);

/** Whether a server code is one of the classroom's conflict codes. */
export function isClassroomConflict(code: string | undefined): boolean {
  return (
    code !== undefined &&
    isBuilderErrorCode(code) &&
    CLASSROOM_CONFLICT_CODES.has(code)
  );
}

export type BuilderErrorKey = (typeof KEYS)[BuilderErrorCode] | "errorGeneric";

function isBuilderErrorCode(message: string): message is BuilderErrorCode {
  // Own keys only, so "toString" / "constructor" never resolve to prototype members.
  return Object.hasOwn(KEYS, message);
}

export function builderErrorKey(message: string | undefined): BuilderErrorKey {
  return message && isBuilderErrorCode(message)
    ? KEYS[message]
    : "errorGeneric";
}
