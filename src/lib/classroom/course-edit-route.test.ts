import { describe, expect, it } from "vitest";
import { courseEditRoute } from "./course-edit-route";

const base = {
  userId: "author",
  communitySlug: "hub",
  courseSlug: "intro-1",
};

describe("courseEditRoute", () => {
  it("opens the builder for the author, in the course's own community", () => {
    expect(
      courseEditRoute({
        ...base,
        course: { authorId: "author", communitySlug: "hub" },
      }),
    ).toEqual({ kind: "edit" });
  });

  it("sends the author to the builder under the course's own community", () => {
    expect(
      courseEditRoute({
        ...base,
        course: { authorId: "author", communitySlug: "home" },
      }),
    ).toEqual({
      kind: "redirect",
      path: "/communities/home/classroom/intro-1/edit",
    });
  });

  it("sends anyone else to the course page in the course's own community", () => {
    expect(
      courseEditRoute({
        ...base,
        userId: "someone",
        course: { authorId: "author", communitySlug: "home" },
      }),
    ).toEqual({
      kind: "redirect",
      path: "/communities/home/classroom/intro-1",
    });
    expect(
      courseEditRoute({
        ...base,
        userId: "someone",
        course: { authorId: "author", communitySlug: "hub" },
      }),
    ).toEqual({ kind: "redirect", path: "/communities/hub/classroom/intro-1" });
  });

  it("sends a missing course to the course page, which says it is not found", () => {
    expect(courseEditRoute({ ...base, course: null })).toEqual({
      kind: "redirect",
      path: "/communities/hub/classroom/intro-1",
    });
  });

  it("stays in the requested community when the course's community is gone", () => {
    expect(
      courseEditRoute({
        ...base,
        course: { authorId: "author", communitySlug: null },
      }),
    ).toEqual({ kind: "edit" });
  });
});
