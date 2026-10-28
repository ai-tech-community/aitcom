import { expect, it } from "vitest";

import {
  classroomContentStatus,
  classroomCourseFromDraft,
  classroomCourseSlug,
  classroomWriteIsMemberVisible,
  classroomWriteNeedsApproval,
} from "@/server/classroom/agent-course-draft";

it("builds a title slug and adds a short number only on collision", () => {
  expect(classroomCourseSlug("Dutch from zero")).toBe("dutch-from-zero");
  expect(
    classroomCourseSlug("Dutch from zero", new Set(["dutch-from-zero"])),
  ).toBe("dutch-from-zero-2");
  expect(classroomCourseSlug("Dutch from zero")).not.toMatch(/\d{13}/);
});

it("treats only a published classroom as member-visible", () => {
  expect(classroomWriteIsMemberVisible("draft")).toBe(false);
  expect(classroomWriteIsMemberVisible("published")).toBe(true);
});

it("reports draft until a write is on a published course", () => {
  expect(classroomContentStatus("draft", false)).toBe("draft");
  expect(classroomContentStatus("published", true)).toBe("draft");
  expect(classroomContentStatus("published", false)).toBe("published");
});

it("saves a draft course immediately and holds a member-visible write", () => {
  expect(classroomWriteNeedsApproval("draft", "draft")).toBe(false);
  expect(classroomWriteNeedsApproval("draft")).toBe(false);
  expect(classroomWriteNeedsApproval("draft", "published")).toBe(true);
  expect(classroomWriteNeedsApproval("published", "draft")).toBe(true);
  expect(classroomWriteNeedsApproval("published")).toBe(true);
});

it("reads the title, address and summary stored on a classroom draft", () => {
  expect(
    classroomCourseFromDraft({
      content: "Price a job",
      metadata: {
        communityId: "c1",
        slug: "price-a-job-1",
        summary: "How to quote.",
        coverImageUrl: null,
      },
    }),
  ).toEqual({
    communityId: "c1",
    title: "Price a job",
    summary: "How to quote.",
    coverImageUrl: null,
    slug: "price-a-job-1",
  });
});
