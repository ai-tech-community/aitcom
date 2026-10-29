import { expect, it } from "vitest";

import { classroomBrowseStatus } from "./course-read-status";

it("reports a public course as published even when the editorial column is still draft", () => {
  expect(classroomBrowseStatus({ status: "draft", isPublic: true })).toBe(
    "published",
  );
  expect(classroomBrowseStatus({ status: "published", isPublic: false })).toBe(
    "published",
  );
  expect(classroomBrowseStatus({ status: "draft", isPublic: false })).toBe(
    "draft",
  );
  expect(classroomBrowseStatus({ status: "archived", isPublic: true })).toBe(
    "archived",
  );
});
