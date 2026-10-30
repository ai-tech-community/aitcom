import { expect, it } from "vitest";

import { uniqueClassroomCourseSlug } from "./course-slug";

it("replaces a timestamp slug with the clean title slug", async () => {
  const payload = {
    find: async () => ({
      docs: [{ slug: "dutch-from-zero-1793210173337" }],
    }),
  };
  await expect(
    uniqueClassroomCourseSlug(
      payload as never,
      "Dutch from zero",
      "dutch-from-zero-1793210173337",
    ),
  ).resolves.toBe("dutch-from-zero");
});

it("adds a short number only when the clean slug is already used", async () => {
  const payload = {
    find: async () => ({
      docs: [
        { slug: "dutch-from-zero" },
        { slug: "dutch-from-zero-1793210173337" },
      ],
    }),
  };
  await expect(
    uniqueClassroomCourseSlug(
      payload as never,
      "Dutch from zero",
      "dutch-from-zero-1793210173337",
    ),
  ).resolves.toBe("dutch-from-zero-2");
});
