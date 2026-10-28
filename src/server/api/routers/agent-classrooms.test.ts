import { expect, it } from "vitest";

import {
  classroomCourseFromDraft,
  classroomCourseSlug,
  classroomWriteIsMemberVisible,
} from "@/server/classroom/agent-course-draft";

it("builds the same course address as the classroom form", () => {
  expect(classroomCourseSlug("Price a job", 1_700_000_000_000)).toBe(
    "price-a-job-1700000000000",
  );
});

it("treats only a published classroom as member-visible", () => {
  expect(classroomWriteIsMemberVisible("draft")).toBe(false);
  expect(classroomWriteIsMemberVisible("published")).toBe(true);
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
