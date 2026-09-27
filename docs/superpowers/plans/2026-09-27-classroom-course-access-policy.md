# Classroom course access policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One course access policy decides who may read a classroom course, and every classroom read and learner path goes through it. This closes #351: members-only courses are currently readable, enrollable and completable by non-members.

**Architecture:** A pure `resolveCourseAccess()` maps (course, viewer, membership) to `none | visitor | member | manager`. A thin `loadCourseAccess()` loads the community and membership rows and calls it. `classrooms.get`, `list`, `enroll`, `submitExamAttempt` and `markLessonComplete` ask the policy; `none` becomes `NOT_FOUND`, so a members-only course never reveals that it exists. No schema change.

**Tech Stack:** TypeScript, tRPC, Drizzle (`app` schema), Payload local API, Vitest (pure unit tests plus the `RUN_DB_TESTS=1` DB integration harness).

**Spec:** `docs/superpowers/specs/2026-09-27-classroom-lesson-materials-design.md` §1 (slice 0). Issue: #351.

## Global Constraints

- Branch: `fix/classroom-course-access`, from `origin/main`. Run `git branch --show-current` before **every** commit; another session shares the main checkout, so execute in your own worktree.
- No schema change and no migration in this slice. Never run `db:push` or `db:apply`.
- A denied read returns `TRPCError` code `NOT_FOUND`, never `FORBIDDEN`. Members-only courses must not reveal that they exist.
- Access levels are exactly `"none" | "visitor" | "member" | "manager"`.
- Manager roles are exactly `owner`, `admin`, `moderator`. Only `status === "active"` memberships count.
- The exam answer key (`examQuestions` with `correctIndex`) stays **author-only**. Manager access does not widen it.
- Stage files by name (never `git add -A` / `git add .`). No `Co-Authored-By` or AI-credit lines in commits or the PR.
- **Test database setup (once).** Never use host port 5432 for tests: on a dev machine it can be taken by an SSH tunnel to a remote database, and the test gate's "localhost" check cannot tell the difference. Instead: `pnpm dev:db`; expose the Docker Postgres on 55432 (`docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`); create an empty `aitcom_test` database (`docker exec aitcom-postgres-1 createdb -U postgres aitcom_test`); build its schema with `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test SKIP_ENV_VALIDATION=1 pnpm exec drizzle-kit push --force` and then `PAYLOAD_PUSH=true` with the same URL for `pnpm exec tsx scripts/payload-push.ts`. Load non-secret values from `.env.docker` for the test run. Never set `PAYLOAD_PUSH` during test runs.
- DB integration tests run only against the local Docker Postgres. Their gate refuses Neon URLs. Never point them at `.env`'s `DATABASE_URL` (that is production).

## Review Focus

1. **Signed-out visitor opens a members-only course link** → `NOT_FOUND`. Owned by Task 2.
2. **A member is banned after enrolling** and then submits an exam or marks a lesson complete → `NOT_FOUND`. Their old enrollment must not keep the door open. Owned by Task 3.
3. **The community is soft-deleted** → its courses are `NOT_FOUND` for everyone, including the author. Owned by Task 2.
4. **A moderator opens someone else's draft that has an exam** → sees the course, but `examQuestions` is absent from every lesson. Owned by Task 2.
5. **A signed-in non-member opens and enrolls in a *public* course** → still works; no regression for promoted courses. Owned by Tasks 2 and 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/classroom/course-access.ts` (create) | The policy: pure `resolveCourseAccess`, DB-backed `loadCourseAccess`. The only place course read rules live. |
| `src/server/classroom/course-access.test.ts` (create) | Pure unit tests: the full access matrix. |
| `src/server/api/routers/classrooms.ts` (modify) | Call the policy in `get`, `list`, `enroll`, `submitExamAttempt`, `markLessonComplete`. |
| `src/server/api/routers/classroom-access.integration.test.ts` (create) | DB integration tests for every gated procedure. |
| `CONTEXT.md` (modify) | Course entry: moderators and admins can view drafts; the access levels. |

---

### Task 1: Pure course access policy

**Files:**
- Create: `src/server/classroom/course-access.ts`
- Test: `src/server/classroom/course-access.test.ts`

**Interfaces:**
- Consumes: `CommunityRole` from `@/lib/classroom` (`"owner" | "admin" | "moderator" | "member"`).
- Produces:
  ```ts
  export type CourseAccess = "none" | "visitor" | "member" | "manager";
  export type CourseAccessMembership = { role: CommunityRole; active: boolean };
  export type CourseAccessCourse = {
    status: string;
    isPublic?: boolean | null;
    authorId: string;
  };
  export function resolveCourseAccess(input: {
    course: CourseAccessCourse;
    viewerId: string | null;
    membership: CourseAccessMembership | null;
  }): CourseAccess;
  ```

- [ ] **Step 1: Write the failing test**

`src/server/classroom/course-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  resolveCourseAccess,
  type CourseAccessMembership,
} from "./course-access";

const AUTHOR = "author-1";
const VIEWER = "viewer-1";

function course(
  status: "draft" | "published" | "archived",
  isPublic: boolean,
) {
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
    ] as const)(
      "%s: members-only published → none",
      (_label, viewerId, m) => {
        expect(
          resolveCourseAccess({
            course: course("published", false),
            viewerId,
            membership: m,
          }),
        ).toBe("none");
      },
    );

    it("a public draft is still hidden from visitors", () => {
      expect(
        resolveCourseAccess({
          course: course("draft", true),
          viewerId: null,
          membership: null,
        }),
      ).toBe("none");
    });

    it("treats a null isPublic as members-only", () => {
      expect(
        resolveCourseAccess({
          course: { status: "published", isPublic: null, authorId: AUTHOR },
          viewerId: null,
          membership: null,
        }),
      ).toBe("none");
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/server/classroom/course-access.test.ts`
Expected: FAIL. The module `./course-access` cannot be resolved.

- [ ] **Step 3: Write the minimal implementation**

`src/server/classroom/course-access.ts`:

```ts
import type { CommunityRole } from "@/lib/classroom";

/**
 * Who may read a classroom course. The single source of the course read
 * rules (spec 2026-09-27-classroom-lesson-materials §1, issue #351):
 *
 * - none    — may not know the course exists (callers answer NOT_FOUND)
 * - visitor — non-member on a public, published course
 * - member  — active community member on a published course
 * - manager — the author, or an active owner/admin/moderator
 *
 * Manager is about *seeing* (drafts, archived). It does not grant editing
 * and does not widen the exam answer key, which stays author-only.
 */
export type CourseAccess = "none" | "visitor" | "member" | "manager";

export type CourseAccessMembership = { role: CommunityRole; active: boolean };

export type CourseAccessCourse = {
  status: string;
  isPublic?: boolean | null;
  authorId: string;
};

const MANAGER_ROLES: ReadonlySet<CommunityRole> = new Set([
  "owner",
  "admin",
  "moderator",
]);

export function resolveCourseAccess(input: {
  course: CourseAccessCourse;
  viewerId: string | null;
  membership: CourseAccessMembership | null;
}): CourseAccess {
  const { course, viewerId, membership } = input;
  if (viewerId !== null && course.authorId === viewerId) return "manager";

  const role = membership?.active ? membership.role : null;
  if (role !== null && MANAGER_ROLES.has(role)) return "manager";

  if (course.status !== "published") return "none";
  if (role !== null) return "member";
  return course.isPublic === true ? "visitor" : "none";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/server/classroom/course-access.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print fix/classroom-course-access
git add src/server/classroom/course-access.ts src/server/classroom/course-access.test.ts
git commit -m "Classroom: pure course access policy (none/visitor/member/manager)"
```

---

### Task 2: Load access from the database and gate `classrooms.get`

**Files:**
- Modify: `src/server/classroom/course-access.ts` (add `loadCourseAccess`)
- Modify: `src/server/api/routers/classrooms.ts` (the `get` procedure, currently the block commented `// Drafts/archived are visible only to the author.`)
- Create: `src/server/api/routers/classroom-access.integration.test.ts`

**Interfaces:**
- Consumes: `resolveCourseAccess`, `CourseAccess`, `CourseAccessCourse` from Task 1.
- Produces:
  ```ts
  export type LoadableCourse = CourseAccessCourse & { communityId: string };
  export async function loadCourseAccess(
    database: typeof db,
    course: LoadableCourse,
    viewerId: string | null,
  ): Promise<CourseAccess>;
  ```
  Also produces the integration test file and its fixtures. Task 3 adds `describe` blocks to it and reuses `callerAs`, `fx` and `setMembershipStatus`.

- [ ] **Step 1: Write the failing integration tests**

`src/server/api/routers/classroom-access.integration.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("classroom course access [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    authorId: string;
    memberId: string;
    moderatorId: string;
    outsiderId: string;
    communityId: string;
    membersOnly: { id: number; slug: string; lessonId: number };
    publicCourse: { id: number; slug: string; lessonId: number };
    draft: { id: number; slug: string; lessonId: number };
  };
  let fx: Fixture;

  const EXAM = [
    {
      id: "q1",
      prompt: "2+2?",
      type: "single",
      options: ["3", "4"],
      correctIndex: 1,
    },
  ];

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
      ]);
    m = { db, schema, createCaller, payload: await getPayloadClient() };
  }, 120_000);

  async function createCourse(
    label: string,
    status: "draft" | "published",
    isPublic: boolean,
  ) {
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `${label} ${fx.sfx}`,
        slug: `${label}-${fx.sfx}`,
        authorId: fx.authorId,
        authorName: "Author",
        status,
        communityId: fx.communityId,
        isPublic,
        enrollmentCount: 0,
      },
    });
    const lesson = await m.payload.create({
      collection: "lessons",
      data: {
        course: course.id,
        title: `${label} lesson`,
        order: 0,
        examQuestions: EXAM,
        examMandatory: false,
        examPassThreshold: 70,
        examMaxAttempts: 0,
      },
    });
    return { id: course.id, slug: course.slug, lessonId: lesson.id };
  }

  beforeEach(async () => {
    const { db, schema } = m;
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ids = {
      authorId: `ca-author-${sfx}`,
      memberId: `ca-member-${sfx}`,
      moderatorId: `ca-mod-${sfx}`,
      outsiderId: `ca-outsider-${sfx}`,
    };
    await db.insert(schema.user).values(
      Object.values(ids).map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await db
      .insert(schema.communities)
      .values({
        name: `Access ${sfx}`,
        slug: `access-${sfx}`,
        createdBy: ids.authorId,
      })
      .returning();
    await db.insert(schema.communityMemberships).values([
      { communityId: community!.id, userId: ids.authorId, role: "member" },
      { communityId: community!.id, userId: ids.memberId, role: "member" },
      {
        communityId: community!.id,
        userId: ids.moderatorId,
        role: "moderator",
      },
    ]);
    fx = {
      sfx,
      ...ids,
      communityId: community!.id,
      membersOnly: { id: 0, slug: "", lessonId: 0 },
      publicCourse: { id: 0, slug: "", lessonId: 0 },
      draft: { id: 0, slug: "", lessonId: 0 },
    };
    fx.membersOnly = await createCourse("members-only", "published", false);
    fx.publicCourse = await createCourse("public", "published", true);
    fx.draft = await createCourse("draft", "draft", false);
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq, inArray } = await import("drizzle-orm");
    const courseIds = [fx.membersOnly.id, fx.publicCourse.id, fx.draft.id];
    await db
      .delete(schema.lessonExamAttempts)
      .where(inArray(schema.lessonExamAttempts.courseId, courseIds));
    await db
      .delete(schema.lessonCompletions)
      .where(inArray(schema.lessonCompletions.courseId, courseIds));
    await db
      .delete(schema.courseCertificates)
      .where(inArray(schema.courseCertificates.courseId, courseIds));
    await db
      .delete(schema.courseEnrollments)
      .where(inArray(schema.courseEnrollments.courseId, courseIds));
    await m.payload.delete({
      collection: "lessons",
      where: { course: { in: courseIds } },
    });
    await m.payload.delete({
      collection: "courses",
      where: { id: { in: courseIds } },
    });
    await db
      .delete(schema.communityMemberships)
      .where(eq(schema.communityMemberships.communityId, fx.communityId));
    await db
      .delete(schema.communities)
      .where(eq(schema.communities.id, fx.communityId));
    const userIds = [fx.authorId, fx.memberId, fx.moderatorId, fx.outsiderId];
    // A passed course issues a certificate, which awards a badge row that
    // references user.id without cascade — remove it before the users.
    await db
      .delete(schema.memberBadges)
      .where(inArray(schema.memberBadges.userId, userIds));
    for (const id of userIds) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  async function setMembershipStatus(
    userId: string,
    status: "active" | "banned",
  ) {
    const { and, eq } = await import("drizzle-orm");
    await m.db
      .update(m.schema.communityMemberships)
      .set({ status })
      .where(
        and(
          eq(m.schema.communityMemberships.communityId, fx.communityId),
          eq(m.schema.communityMemberships.userId, userId),
        ),
      );
  }

  describe("classrooms.get", () => {
    it("hides a members-only course from signed-out visitors and outsiders", async () => {
      for (const viewer of [null, fx.outsiderId]) {
        await expect(
          callerAs(viewer).classrooms.get({ slug: fx.membersOnly.slug }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    });

    it("hides a members-only course from a banned member", async () => {
      await setMembershipStatus(fx.memberId, "banned");
      await expect(
        callerAs(fx.memberId).classrooms.get({ slug: fx.membersOnly.slug }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("shows a members-only course to an active member", async () => {
      const res = await callerAs(fx.memberId).classrooms.get({
        slug: fx.membersOnly.slug,
      });
      expect(res.lessons.map((l) => l.id)).toEqual([fx.membersOnly.lessonId]);
    });

    it("shows a public course to signed-out visitors and outsiders", async () => {
      for (const viewer of [null, fx.outsiderId]) {
        const res = await callerAs(viewer).classrooms.get({
          slug: fx.publicCourse.slug,
        });
        expect(res.course.id).toBe(fx.publicCourse.id);
      }
    });

    it("hides a draft from members but shows it to the author and moderators", async () => {
      await expect(
        callerAs(fx.memberId).classrooms.get({ slug: fx.draft.slug }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      for (const viewer of [fx.authorId, fx.moderatorId]) {
        const res = await callerAs(viewer).classrooms.get({
          slug: fx.draft.slug,
        });
        expect(res.course.id).toBe(fx.draft.id);
      }
    });

    it("never sends the exam answer key to a moderator", async () => {
      const res = await callerAs(fx.moderatorId).classrooms.get({
        slug: fx.draft.slug,
      });
      for (const lesson of res.lessons) {
        expect(lesson.examQuestions).toBeUndefined();
      }
      expect(JSON.stringify(res)).not.toContain("correctIndex");
    });

    it("still sends the answer key to the author", async () => {
      const res = await callerAs(fx.authorId).classrooms.get({
        slug: fx.draft.slug,
      });
      expect(res.lessons[0]?.examQuestions).toEqual(EXAM);
    });

    it("hides every course of a soft-deleted community, even from the author", async () => {
      const { eq } = await import("drizzle-orm");
      await m.db
        .update(m.schema.communities)
        .set({ deletedAt: new Date() })
        .where(eq(m.schema.communities.id, fx.communityId));
      for (const viewer of [fx.authorId, fx.memberId, null]) {
        await expect(
          callerAs(viewer).classrooms.get({ slug: fx.publicCourse.slug }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Start the local DB if it is not running: `pnpm dev:db`. The test database must be the isolated `aitcom_test` described in Global Constraints.
Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts`
Expected: FAIL. At minimum these fail:
- "hides a members-only course from signed-out visitors and outsiders" (it resolves instead of rejecting)
- "hides a members-only course from a banned member"
- "shows it to … moderators"
- "hides every course of a soft-deleted community"

If the whole suite reports *skipped*, the gate did not see a local URL. Fix the env; do not continue on a skip.

- [ ] **Step 3: Add `loadCourseAccess`**

Append to `src/server/classroom/course-access.ts`, and add these imports at the top of the file:

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
```

```ts
export type LoadableCourse = CourseAccessCourse & { communityId: string };

/**
 * The caller's access to a course, read from the database. A course whose
 * community is missing or soft-deleted is `none` for everyone, including
 * its author.
 */
export async function loadCourseAccess(
  database: typeof db,
  course: LoadableCourse,
  viewerId: string | null,
): Promise<CourseAccess> {
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.id, course.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { id: true },
  });
  if (!community) return "none";

  let membership: CourseAccessMembership | null = null;
  if (viewerId !== null) {
    const row = await database.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, course.communityId),
        eq(communityMemberships.userId, viewerId),
      ),
      columns: { role: true, status: true },
    });
    if (row) membership = { role: row.role, active: row.status === "active" };
  }

  return resolveCourseAccess({ course, viewerId, membership });
}
```

- [ ] **Step 4: Gate `classrooms.get`**

In `src/server/api/routers/classrooms.ts`, add the import:

```ts
import { loadCourseAccess } from "@/server/classroom/course-access";
```

In `get`, replace:

```ts
      // Drafts/archived are visible only to the author.
      if (course.status !== "published" && course.authorId !== userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
```

with:

```ts
      // One policy decides who may read a course (members-only, public,
      // drafts). `none` must not reveal that the course exists.
      const access = await loadCourseAccess(ctx.db, course, userId ?? null);
      if (access === "none") throw new TRPCError({ code: "NOT_FOUND" });
```

Leave the `isAuthor` answer-key logic further down unchanged. It is what keeps the key author-only.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts src/server/classroom/course-access.test.ts`
Expected: PASS. The run must report tests executed, not skipped.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git branch --show-current   # must print fix/classroom-course-access
git add src/server/classroom/course-access.ts src/server/api/routers/classrooms.ts src/server/api/routers/classroom-access.integration.test.ts
git commit -m "Classroom: gate course reads through the access policy (#351)"
```

---

### Task 3: Gate enrollment, exams and completion

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (`enroll`, `submitExamAttempt`, `markLessonComplete`)
- Modify: `src/server/api/routers/classroom-access.integration.test.ts` (add `describe` blocks inside the top-level `describe`)

**Interfaces:**
- Consumes: `loadCourseAccess` (Task 2); `callerAs`, `fx`, `setMembershipStatus` from the test file (Task 2).
- Produces: a module-private helper in `classrooms.ts`:
  ```ts
  async function requireReadableCourse(
    database: typeof db,
    payload: Awaited<ReturnType<typeof getPayloadClient>>,
    courseId: number,
    viewerId: string,
  ): Promise<Course>; // throws NOT_FOUND when access is "none"
  ```
  `Course` is imported as a type from `@/payload-types`.

- [ ] **Step 1: Write the failing tests**

Add inside the top-level `describe` of `classroom-access.integration.test.ts`, after the `classrooms.get` block:

```ts
  describe("classrooms.enroll", () => {
    it("refuses an outsider on a members-only course without revealing it", async () => {
      await expect(
        callerAs(fx.outsiderId).classrooms.enroll({
          courseId: fx.membersOnly.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("lets an outsider enroll in a public course", async () => {
      const res = await callerAs(fx.outsiderId).classrooms.enroll({
        courseId: fx.publicCourse.id,
      });
      expect(res).toEqual({ enrolled: true, already: false });
    });

    it("lets an active member enroll in a members-only course", async () => {
      const res = await callerAs(fx.memberId).classrooms.enroll({
        courseId: fx.membersOnly.id,
      });
      expect(res).toEqual({ enrolled: true, already: false });
    });
  });

  describe("learner actions after losing access", () => {
    beforeEach(async () => {
      await callerAs(fx.memberId).classrooms.enroll({
        courseId: fx.membersOnly.id,
      });
      await setMembershipStatus(fx.memberId, "banned");
    });

    it("refuses an exam attempt from a banned, still-enrolled member", async () => {
      await expect(
        callerAs(fx.memberId).classrooms.submitExamAttempt({
          lessonId: fx.membersOnly.lessonId,
          answers: [{ questionId: "q1", selectedIndex: 1 }],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const { eq } = await import("drizzle-orm");
      const attempts = await m.db
        .select()
        .from(m.schema.lessonExamAttempts)
        .where(eq(m.schema.lessonExamAttempts.userId, fx.memberId));
      expect(attempts).toHaveLength(0);
    });

    it("refuses marking a lesson complete from a banned, still-enrolled member", async () => {
      await expect(
        callerAs(fx.memberId).classrooms.markLessonComplete({
          lessonId: fx.membersOnly.lessonId,
          completed: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("learner actions with access", () => {
    it("an active enrolled member can still pass an exam and complete lessons", async () => {
      const caller = callerAs(fx.memberId);
      await caller.classrooms.enroll({ courseId: fx.membersOnly.id });
      const res = await caller.classrooms.submitExamAttempt({
        lessonId: fx.membersOnly.lessonId,
        answers: [{ questionId: "q1", selectedIndex: 1 }],
      });
      expect(res.passed).toBe(true);
      const get = await caller.classrooms.get({ slug: fx.membersOnly.slug });
      expect(get.completedLessonIds).toEqual([fx.membersOnly.lessonId]);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts`
Expected: FAIL.
- "refuses an outsider on a members-only course" fails: the enroll succeeds.
- Both "banned, still-enrolled" tests fail: the calls succeed.
- The "with access" and public-enroll tests already pass.

- [ ] **Step 3: Add the helper and gate the three procedures**

In `src/server/api/routers/classrooms.ts`, add the type import:

```ts
import type { Course } from "@/payload-types";
```

Add below `issueCertificateIfComplete`:

```ts
/**
 * Load a course and require that the viewer may read it. A course the
 * viewer can't see is NOT_FOUND, the same answer as a course that doesn't
 * exist.
 */
async function requireReadableCourse(
  database: typeof db,
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  viewerId: string,
): Promise<Course> {
  const course = await payload
    .findByID({ collection: "courses", id: courseId, depth: 0 })
    .catch(() => null);
  if (!course) throw new TRPCError({ code: "NOT_FOUND" });
  const access = await loadCourseAccess(database, course, viewerId);
  if (access === "none") throw new TRPCError({ code: "NOT_FOUND" });
  return course;
}
```

In **`enroll`**, replace:

```ts
      const payload = await getPayloadClient();
      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      if (course.status !== "published")
```

with:

```ts
      const payload = await getPayloadClient();
      const course = await requireReadableCourse(
        ctx.db,
        payload,
        input.courseId,
        userId,
      );
      if (course.status !== "published")
```

Also move the gate **before** the "already enrolled" early return. That way a banned member can't even learn they are still enrolled. Restructure the top of `enroll` so the order is:
1. `const userId = …`
2. `const payload = await getPayloadClient();`
3. `const course = await requireReadableCourse(…)`
4. the existing-enrollment lookup and early return
5. the `status !== "published"` check
6. the rest, unchanged

In **`submitExamAttempt`**, directly after `const courseId = lesson.course;`, add:

```ts
      await requireReadableCourse(ctx.db, payload, courseId, userId);
```

In **`markLessonComplete`**, directly after `const courseId = lesson.course;`, add the same line:

```ts
      await requireReadableCourse(ctx.db, payload, courseId, userId);
```

`unenroll` stays ungated: leaving is always allowed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts`
Expected: PASS, with tests executed and not skipped.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git branch --show-current   # must print fix/classroom-course-access
git add src/server/api/routers/classrooms.ts src/server/api/routers/classroom-access.integration.test.ts
git commit -m "Classroom: enrollment, exams and completion require course access (#351)"
```

---

### Task 4: Course list follows the policy; docs

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (`list`)
- Modify: `src/server/api/routers/classroom-access.integration.test.ts`
- Modify: `CONTEXT.md` (the `### Course` entry)

**Interfaces:**
- Consumes: `resolveCourseAccess` (Task 1); `resolveCommunityAndRole` (already in `classrooms.ts`, which returns the caller's **active** role or null).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Add inside the top-level `describe`:

```ts
  describe("classrooms.list", () => {
    async function slugsFor(viewer: string | null) {
      const { communities } = m.schema;
      const { eq } = await import("drizzle-orm");
      const [c] = await m.db
        .select({ slug: communities.slug })
        .from(communities)
        .where(eq(communities.id, fx.communityId));
      const res = await callerAs(viewer).classrooms.list({
        communitySlug: c!.slug,
      });
      return res.map((r) => r.slug).sort();
    }

    it("shows outsiders only public courses", async () => {
      expect(await slugsFor(fx.outsiderId)).toEqual([fx.publicCourse.slug]);
      expect(await slugsFor(null)).toEqual([fx.publicCourse.slug]);
    });

    it("shows members published courses but not others' drafts", async () => {
      expect(await slugsFor(fx.memberId)).toEqual(
        [fx.membersOnly.slug, fx.publicCourse.slug].sort(),
      );
    });

    it("shows moderators drafts too", async () => {
      expect(await slugsFor(fx.moderatorId)).toEqual(
        [fx.draft.slug, fx.membersOnly.slug, fx.publicCourse.slug].sort(),
      );
    });

    it("shows a banned member only public courses", async () => {
      await setMembershipStatus(fx.memberId, "banned");
      expect(await slugsFor(fx.memberId)).toEqual([fx.publicCourse.slug]);
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts -t "classrooms.list"`
Expected: FAIL on "shows moderators drafts too", because today the list shows drafts to their author only. The other cases pass.

- [ ] **Step 3: Implement**

In `src/server/api/routers/classrooms.ts`, extend the course-access import:

```ts
import {
  loadCourseAccess,
  resolveCourseAccess,
} from "@/server/classroom/course-access";
```

In `list`, replace the block from `// A course is listable if it is published-and-visible…` through the `payload.find({ collection: "courses", … })` call with:

```ts
      // The database query narrows candidates (so the 50-row page isn't
      // filled with courses the caller can't see); the access policy is the
      // authority on what is actually returned.
      const isManagerRole =
        role === "owner" || role === "admin" || role === "moderator";
      const candidates: Where[] = isManagerRole
        ? [{ status: { exists: true } }]
        : [
            role === null
              ? {
                  and: [
                    { status: { equals: "published" } },
                    { isPublic: { equals: true } },
                  ],
                }
              : { status: { equals: "published" } },
          ];
      if (userId) candidates.push({ authorId: { equals: userId } });

      const { docs: found } = await payload.find({
        collection: "courses",
        where: {
          and: [
            { communityId: { equals: communityId } },
            { or: candidates },
          ],
        },
        sort: "-enrollmentCount",
        limit: 50,
        depth: 0,
      });
      const membership = role === null ? null : { role, active: true };
      const docs = found.filter(
        (c) =>
          resolveCourseAccess({
            course: c,
            viewerId: userId ?? null,
            membership,
          }) !== "none",
      );
```

The rest of `list` already uses `docs` and stays as is. The listing UI already shows draft and archived badges (`classroom-listing.tsx`), so moderators can tell drafts apart.

- [ ] **Step 4: Run to verify it passes**

Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts`
Expected: PASS, the whole file, executed and not skipped.

- [ ] **Step 5: Update `CONTEXT.md`**

In the `### Course` entry, after the sentence ending "a creator cannot self-publish to the open web.", insert:

```markdown
Who may read a course is one **course access** decision: `none` (may not
know it exists — answered as not-found), `visitor` (non-member on a public
published course), `member` (active member on a published course) or
`manager` (the author, or an active owner/admin/moderator, who also sees
drafts and archived courses). Manager is about *seeing*; the exam answer key
stays author-only. Enrolling, taking an exam and completing a lesson all
require access, so a banned member's old enrollment opens nothing.
```

Then grep `CONTEXT.md` for any other claim that drafts are visible only to their author, and fix every hit:

Run: `grep -n -i "draft" CONTEXT.md`

- [ ] **Step 6: Full verification and commit**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test
RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/api/routers/
```
Expected: typecheck and lint clean. `pnpm test` shows no new failures versus `origin/main` (record any pre-existing failures by name). All router integration suites pass.

```bash
git branch --show-current   # must print fix/classroom-course-access
git add src/server/api/routers/classrooms.ts src/server/api/routers/classroom-access.integration.test.ts CONTEXT.md
git commit -m "Classroom: course list follows the access policy; document course access"
git status --short          # must be empty before push
```

- [ ] **Step 7: Check for parallel work, push, open the PR**

```bash
git fetch origin
git log origin/main --oneline -20 | grep -i -E "access|classroom|#351"
gh pr list --state open --search "351 OR course access"
```
If another session already shipped this, stop and report. Otherwise:

```bash
git push -u origin fix/classroom-course-access
gh pr create --base main --title "Classroom: one course access policy; members-only courses no longer leak (#351)" --body "<see below>"
```

PR body (no AI credit lines):

```markdown
Fixes #351.

## Problem
`classrooms.get` only hid drafts. Any visitor with a slug could read a
published members-only course. `enroll` had no membership check (and paid
the author enrollment XP), and exams/completion only checked enrollment, so
a banned member kept access.

## Change
- `src/server/classroom/course-access.ts`: a pure `resolveCourseAccess`
  (`none | visitor | member | manager`) plus `loadCourseAccess` (community
  soft-delete aware). The only place course read rules live.
- `get`, `list`, `enroll`, `submitExamAttempt`, `markLessonComplete` go
  through it; `none` → `NOT_FOUND`.
- Moderators/admins/owners can now see drafts and archived courses (spec
  2026-09-27 §1). The exam answer key stays author-only.

## Pattern
Policy object: one pure decision function, a thin loader, and callers that
only ask. Rejected alternatives: per-procedure inline checks (how the leak
happened) and a Payload `access` function (tRPC reads use the local API,
which bypasses collection access by default).

## Tests
- Unit: the full access matrix.
- DB integration: every gated procedure, including banned members,
  soft-deleted communities, and the answer key never reaching moderators.
```

---

## Self-review notes

- Spec §1 coverage: the pure function and its table (Task 1); the loader and `get` (Task 2); every entry point that exists today (Tasks 2–4). Playback, file links, watch reports and stats don't exist yet. They adopt `loadCourseAccess` in their own slices.
- `none` → `NOT_FOUND` everywhere (Tasks 2, 3, 4).
- Type names used across tasks: `CourseAccess`, `CourseAccessMembership`, `CourseAccessCourse`, `LoadableCourse`, `loadCourseAccess`, `resolveCourseAccess`, `requireReadableCourse`. They are consistent.
