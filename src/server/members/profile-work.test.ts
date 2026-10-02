// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  profileArticlesWhere,
  profileCoursesWhere,
  profileEventsWhere,
  profileProjectsWhere,
  readableCourseCommunitySlug,
  type CourseCommunityContext,
} from "@/server/members/profile-work";
import { publicArticleWhere } from "@/server/articles/public-articles";

const readable = {
  or: [
    { communityId: { exists: false } },
    { communityId: { not_in: ["hidden-1"] } },
  ],
};

describe("Work queries", () => {
  it("lists only the author's public articles (the blog rule)", () => {
    expect(profileArticlesWhere("u1")).toEqual({
      and: [{ authorId: { equals: "u1" } }, publicArticleWhere()],
    });
  });

  it("lists published projects in communities the viewer may read", () => {
    expect(profileProjectsWhere("u1", ["hidden-1"])).toEqual({
      and: [
        { authorId: { equals: "u1" } },
        { status: { equals: "published" } },
        readable,
      ],
    });
    // Nothing hidden: no community condition at all.
    expect(profileProjectsWhere("u1", [])).toEqual({
      and: [
        { authorId: { equals: "u1" } },
        { status: { equals: "published" } },
      ],
    });
  });

  it("lists native, live or past events the member organises", () => {
    expect(profileEventsWhere("u1", ["hidden-1"])).toEqual({
      and: [
        { organizerId: { equals: "u1" } },
        { status: { in: ["published", "completed"] } },
        { discoverySource: { not_equals: "luma" } },
        readable,
      ],
    });
  });

  it("reads published courses only; access is decided per course", () => {
    expect(profileCoursesWhere("u1")).toEqual({
      and: [
        { authorId: { equals: "u1" } },
        { status: { equals: "published" } },
      ],
    });
  });
});

describe("readableCourseCommunitySlug", () => {
  const course = {
    id: 1,
    title: "T",
    slug: "t",
    status: "published" as const,
    isPublic: false,
    authorId: "author",
    communityId: "c1",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const context = (
    over: Partial<CourseCommunityContext> = {},
  ): CourseCommunityContext => ({
    viewerId: "viewer",
    communitySlugById: new Map([["c1", "club"]]),
    membershipByCommunityId: new Map(),
    ...over,
  });

  it("hides a members-only course from a non-member", () => {
    expect(readableCourseCommunitySlug(course, context())).toBeNull();
  });

  it("shows a members-only course to an active member", () => {
    expect(
      readableCourseCommunitySlug(
        course,
        context({
          membershipByCommunityId: new Map([
            ["c1", { role: "member", active: true }],
          ]),
        }),
      ),
    ).toBe("club");
  });

  it("does not count a membership that is not active", () => {
    expect(
      readableCourseCommunitySlug(
        course,
        context({
          membershipByCommunityId: new Map([
            ["c1", { role: "member", active: false }],
          ]),
        }),
      ),
    ).toBeNull();
  });

  it("shows a public course to anyone, signed out included", () => {
    expect(
      readableCourseCommunitySlug(
        { ...course, isPublic: true },
        context({ viewerId: null }),
      ),
    ).toBe("club");
  });

  it("never shows an unpublished course, not even to its author", () => {
    expect(
      readableCourseCommunitySlug(
        { ...course, status: "draft", isPublic: true },
        context({ viewerId: "author" }),
      ),
    ).toBeNull();
  });

  it("hides a course whose community is gone", () => {
    expect(
      readableCourseCommunitySlug(
        { ...course, isPublic: true },
        context({ communitySlugById: new Map() }),
      ),
    ).toBeNull();
  });
});
