import { TRPCError } from "@trpc/server";

import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";

/** Agent drafts use this type. Approval creates a published course. */
export const CLASSROOM_COURSE_DRAFT_TYPE = "classroom_course";

/** Approval applies a change to a course members can already see. */
export const CLASSROOM_COURSE_UPDATE_DRAFT_TYPE = "classroom_course_update";

/** Approval creates or updates a module on a published course. */
export const CLASSROOM_MODULE_DRAFT_TYPE = "classroom_module";

/** Approval creates or updates a lesson on a published course. */
export const CLASSROOM_LESSON_DRAFT_TYPE = "classroom_lesson";

export type ClassroomCourseDraft = {
  communityId: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  slug: string;
};

const COURSE_SLUG_MAX = 80;

/**
 * Same address shape as a magazine article or forum thread: the title slug,
 * or `title-2`, `title-3`, … only when that address is already taken.
 */
export function classroomCourseSlug(
  title: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  const base = stem.length >= 3 ? stem : "course";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, COURSE_SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, COURSE_SLUG_MAX - 5)}-${taken.size + 2}`;
}

/**
 * A draft course can be written immediately. Publishing, or editing a course
 * members can already see, waits for a person to approve the draft.
 */
export function classroomWriteNeedsApproval(
  courseStatus: string,
  nextStatus?: "draft" | "published",
): boolean {
  if (nextStatus === "published") return true;
  return courseStatus === "published";
}

/** A published course is what members see. A draft course is not. */
export function classroomWriteIsMemberVisible(
  status: "draft" | "published",
): boolean {
  return status === "published";
}

function metaRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/** The published course an approved classroom draft creates. Rejects a damaged draft. */
export function classroomCourseFromDraft(draft: {
  content: string | null;
  metadata: unknown;
}): ClassroomCourseDraft {
  const meta = metaRecord(draft.metadata);
  const title = draft.content ?? "";
  const communityId = meta?.communityId;
  const slug = meta?.slug;
  const summary = meta?.summary;
  const coverImageUrl = meta?.coverImageUrl;
  if (title.length < COURSE_TITLE_MIN || title.length > 200) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no usable title.",
    });
  }
  if (typeof communityId !== "string" || communityId.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no community.",
    });
  }
  if (typeof slug !== "string" || slug.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no address.",
    });
  }
  if (
    summary !== undefined &&
    summary !== null &&
    typeof summary !== "string"
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no usable summary.",
    });
  }
  if (
    coverImageUrl !== undefined &&
    coverImageUrl !== null &&
    typeof coverImageUrl !== "string"
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no usable cover.",
    });
  }
  return {
    communityId,
    title,
    summary: typeof summary === "string" ? summary : null,
    coverImageUrl: typeof coverImageUrl === "string" ? coverImageUrl : null,
    slug,
  };
}

function draftMeta(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function draftString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export type ClassroomCourseUpdateDraft = {
  courseId: number;
  title?: string;
  summary?: string | null;
  coverImageUrl?: string | null;
  status?: "draft" | "published";
};

export function classroomCourseUpdateFromDraft(draft: {
  metadata: unknown;
}): ClassroomCourseUpdateDraft {
  const meta = draftMeta(draft.metadata);
  const courseId = meta?.courseId;
  if (typeof courseId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no course.",
    });
  }
  const status = meta?.status;
  if (status !== undefined && status !== "draft" && status !== "published") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This classroom draft has no usable status.",
    });
  }
  return {
    courseId,
    ...(typeof meta?.title === "string" ? { title: meta.title } : {}),
    ...(meta && "summary" in meta
      ? { summary: draftString(meta.summary) }
      : {}),
    ...(meta && "coverImageUrl" in meta
      ? { coverImageUrl: draftString(meta.coverImageUrl) }
      : {}),
    ...(status === "draft" || status === "published" ? { status } : {}),
  };
}

export type ClassroomModuleDraft = {
  action: "create" | "update";
  courseId: number;
  moduleId: number | null;
  title: string;
  summary?: string | null;
};

export function classroomModuleFromDraft(draft: {
  content: string | null;
  metadata: unknown;
}): ClassroomModuleDraft {
  const meta = draftMeta(draft.metadata);
  const action = meta?.action;
  const courseId = meta?.courseId;
  const moduleId = meta?.moduleId;
  const title = draft.content ?? "";
  if (action !== "create" && action !== "update") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This module draft has no action.",
    });
  }
  if (typeof courseId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This module draft has no course.",
    });
  }
  if (title.length < 1 || title.length > 200) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This module draft has no usable title.",
    });
  }
  if (action === "update" && typeof moduleId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This module draft has no module.",
    });
  }
  return {
    action,
    courseId,
    moduleId: typeof moduleId === "number" ? moduleId : null,
    title,
    ...(meta && "summary" in meta
      ? { summary: draftString(meta.summary) }
      : {}),
  };
}

export type ClassroomLessonDraft = {
  action: "create" | "update";
  courseId: number;
  lessonId: number | null;
  moduleId: number | null;
  title: string;
  /** Omitted when the draft does not change the lesson body. */
  body?: string | null;
};

export function classroomLessonFromDraft(draft: {
  content: string | null;
  metadata: unknown;
}): ClassroomLessonDraft {
  const meta = draftMeta(draft.metadata);
  const action = meta?.action;
  const courseId = meta?.courseId;
  const lessonId = meta?.lessonId;
  const moduleId = meta?.moduleId;
  const title = typeof meta?.title === "string" ? meta.title : "";
  if (action !== "create" && action !== "update") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This lesson draft has no action.",
    });
  }
  if (typeof courseId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This lesson draft has no course.",
    });
  }
  if (title.length < 1 || title.length > 200) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This lesson draft has no usable title.",
    });
  }
  if (action === "update" && typeof lessonId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This lesson draft has no lesson.",
    });
  }
  return {
    action,
    courseId,
    lessonId: typeof lessonId === "number" ? lessonId : null,
    moduleId: typeof moduleId === "number" ? moduleId : null,
    title,
    ...(meta && "body" in meta ? { body: draftString(meta.body) } : {}),
  };
}
