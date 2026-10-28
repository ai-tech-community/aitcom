import { TRPCError } from "@trpc/server";

import { COURSE_TITLE_MIN } from "@/lib/classroom/course-title";

/** Agent drafts use this type. Approval creates a published course. */
export const CLASSROOM_COURSE_DRAFT_TYPE = "classroom_course";

export type ClassroomCourseDraft = {
  communityId: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  slug: string;
};

/** Same address the classroom form builds from a title. */
export function classroomCourseSlug(title: string, now = Date.now()): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base}-${now}`;
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
