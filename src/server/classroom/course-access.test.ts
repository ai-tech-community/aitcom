import { describe, expect, it, vi } from "vitest";
import {
  isCourseManagerRole,
  requireEditableCourse,
  resolveCourseAccess,
  type CourseAccessMembership,
} from "./course-access";

const AUTHOR = "author-1";
const VIEWER = "viewer-1";

function course(status: "draft" | "published" | "archived", isPublic: boolean) {
  return { status, isPublic, authorId: AUTHOR };
}
const active = (role: CourseAccessMembership["role"]) => ({
  role,
  active: true,
});

describe("resolveCourseAccess", () => {
  describe("the author", () => {
    it.each(["draft", "published", "archived"] as const)(
      "manages their own %s course even without a membership",
      (status) => {
        expect(
          resolveCourseAccess({
            communityContentReadable: true,
            course: course(status, false),
            viewerId: AUTHOR,
            membership: null,
          }),
        ).toBe("manager");
      },
    );
  });

  describe("community managers", () => {
    it.each(["owner", "admin", "moderator"] as const)(
      "%s manages drafts, published and archived courses",
      (role) => {
        for (const status of ["draft", "published", "archived"] as const) {
          expect(
            resolveCourseAccess({
              communityContentReadable: true,
              course: course(status, false),
              viewerId: VIEWER,
              membership: active(role),
            }),
          ).toBe("manager");
        }
      },
    );

    it("a manager role that is not active counts for nothing", () => {
      expect(
        resolveCourseAccess({
          communityContentReadable: true,
          course: course("published", false),
          viewerId: VIEWER,
          membership: { role: "admin", active: false },
        }),
      ).toBe("none");
    });
  });

  describe("active members", () => {
    it("are members of published courses, public or not", () => {
      for (const isPublic of [false, true]) {
        expect(
          resolveCourseAccess({
            communityContentReadable: true,
            course: course("published", isPublic),
            viewerId: VIEWER,
            membership: active("member"),
          }),
        ).toBe("member");
      }
    });

    it.each(["draft", "archived"] as const)(
      "cannot see someone else's %s course",
      (status) => {
        expect(
          resolveCourseAccess({
            communityContentReadable: true,
            course: course(status, true),
            viewerId: VIEWER,
            membership: active("member"),
          }),
        ).toBe("none");
      },
    );
  });

  describe("everyone else", () => {
    it.each([
      ["signed out", null, null],
      ["signed-in non-member", VIEWER, null],
      ["banned member", VIEWER, { role: "member", active: false }],
    ] as const)("%s: public published → visitor", (_label, viewerId, m) => {
      expect(
        resolveCourseAccess({
          communityContentReadable: true,
          course: course("published", true),
          viewerId,
          membership: m,
        }),
      ).toBe("visitor");
    });

    it.each([
      ["signed out", null, null],
      ["signed-in non-member", VIEWER, null],
      ["banned member", VIEWER, { role: "member", active: false }],
    ] as const)("%s: members-only published → none", (_label, viewerId, m) => {
      expect(
        resolveCourseAccess({
          communityContentReadable: true,
          course: course("published", false),
          viewerId,
          membership: m,
        }),
      ).toBe("none");
    });

    it("a public draft is still hidden from visitors", () => {
      expect(
        resolveCourseAccess({
          communityContentReadable: true,
          course: course("draft", true),
          viewerId: null,
          membership: null,
        }),
      ).toBe("none");
    });

    it("treats a null isPublic as members-only", () => {
      expect(
        resolveCourseAccess({
          communityContentReadable: true,
          course: { status: "published", isPublic: null, authorId: AUTHOR },
          viewerId: null,
          membership: null,
        }),
      ).toBe("none");
    });
  });
});

describe("isCourseManagerRole", () => {
  it.each(["owner", "admin", "moderator"] as const)(
    "treats %s as a course manager",
    (role) => {
      expect(isCourseManagerRole(role)).toBe(true);
    },
  );

  it.each(["member", null] as const)(
    "does not treat %s as a manager",
    (role) => {
      expect(isCourseManagerRole(role)).toBe(false);
    },
  );
});

describe("requireEditableCourse", () => {
  const payloadWith = (course: unknown) => ({
    findByID: vi.fn().mockResolvedValue(course),
  });

  it("hands the course to its author", async () => {
    const course = { id: 12, authorId: AUTHOR };
    const payload = payloadWith(course);
    await expect(
      requireEditableCourse(payload as never, 12, AUTHOR),
    ).resolves.toBe(course);
    expect(payload.findByID).toHaveBeenCalledWith({
      collection: "courses",
      id: 12,
      depth: 0,
      disableErrors: true,
    });
  });

  it("refuses anyone else", async () => {
    await expect(
      requireEditableCourse(
        payloadWith({ id: 12, authorId: AUTHOR }) as never,
        12,
        VIEWER,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("answers NOT_FOUND for a course that does not exist", async () => {
    await expect(
      requireEditableCourse(payloadWith(null) as never, 12, AUTHOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("in a community whose content the viewer may not read", () => {
    it.each([
      ["signed out", null, null],
      ["signed-in non-member", VIEWER, null],
      ["pending or invited", VIEWER, { role: "member", active: false }],
    ] as const)(
      "%s: a public published course is still hidden (ADR-0050)",
      (_label, viewerId, m) => {
        expect(
          resolveCourseAccess({
            course: course("published", true),
            viewerId,
            membership: m,
            communityContentReadable: false,
          }),
        ).toBe("none");
      },
    );

    it("changes nothing for members, managers and the author", () => {
      const hidden = { communityContentReadable: false } as const;
      expect(
        resolveCourseAccess({
          ...hidden,
          course: course("published", false),
          viewerId: VIEWER,
          membership: active("member"),
        }),
      ).toBe("member");
      expect(
        resolveCourseAccess({
          ...hidden,
          course: course("draft", false),
          viewerId: VIEWER,
          membership: active("moderator"),
        }),
      ).toBe("manager");
      expect(
        resolveCourseAccess({
          ...hidden,
          course: course("draft", false),
          viewerId: AUTHOR,
          membership: null,
        }),
      ).toBe("manager");
    });
  });
});
