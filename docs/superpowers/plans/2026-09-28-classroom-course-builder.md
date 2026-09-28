# Classroom Course Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow stacked course edit form with a full-width, three-pane course builder (outline · one lesson at a time · lesson settings) that autosaves, reorders by drag and drop, and makes publishing a deliberate, checked step.

**Architecture:** The community layout gains a named *layout variant* seam (`standard` | `workspace`); builder routes resolve to `workspace`, which drops the community header, tab bar and width cap. The builder is a container (`CourseBuilder`) that owns data loading and selection (`?lesson=<id>`), composed from focused panes. All non-trivial behaviour lives in pure, unit-tested modules — the outline model (reorder math), the publish checklist, and an autosave hook — so the React panes stay thin. The server gains `reorderLessons`, a `moduleId` on `addLesson`, draft-by-default, an archived-status guard, publish activity logging, and optimistic-concurrency (`expectedUpdatedAt`) on course and lesson saves.

**Tech Stack:** Next.js App Router, tRPC, Payload CMS (courses/lessons/modules collections), Drizzle (activity log), next-intl (en + nl), shadcn/ui primitives, `@dnd-kit/core` + `@dnd-kit/sortable` (new), Vitest + Testing Library.

**Spec:** No separate spec file (user chose plan-and-build). The design brief is in this plan's "Design brief" section below; the critique that motivated it is `.impeccable/critique/2026-09-27T22-23-02Z__src-components-classroom-course-editor-tsx.md` in the main checkout.

## Design brief (source of truth for this plan)

- **Audience:** community organizers/members authoring a course at a laptop. Mode: Operate.
- **Layout (desktop ≥ lg):** full-width *workspace* route. Slim sticky top bar: `← Classroom` link · course title (edit in place) · status badge (Draft / Published / Archived) + visibility (Public / Members only) · save status (`Saving…` / `Saved` / `Couldn't save — Retry`) · Edit/Preview toggle · one orange **Publish** button (becomes a `Published ▾` menu with "Move back to draft" once live).
- **Left pane (18rem):** "Course details" item, then modules → lessons (or a flat lesson list). Drag and drop reorders lessons, including across modules. Each module has an inline "+ Add lesson" row (type title, Enter, next row focused). "+ Add module" at the bottom. Lesson rows show small indicators: has quiz, empty. Every row has a `⋯` menu: Move up, Move down, Move to module…, Delete.
- **Middle pane:** either Course details (title, summary, cover previewed at the learner 16:5 crop, visibility read-only), or one lesson (title + rich text at reading width; the "Add material"/embed toolbar from the lesson-embeds work lives here).
- **Right pane (collapsible):** lesson settings — resources, quiz behind "Add a quiz", completion rules (quiz required, pass mark, attempts), Delete lesson.
- **Saving:** autosave only (≈1s debounce + flush on lesson switch/unmount). Structural changes (reorder/add/delete/rename) apply immediately and optimistically. Leaving with unsaved or failed changes prompts. Two tabs: a stale save gets "This course changed somewhere else — Reload", never a silent overwrite.
- **Delete lesson:** always a confirm dialog (it also removes learner progress on that lesson).
- **Publish:** checklist dialog. Blocks: no title; zero lessons; empty lessons; quiz question without a valid correct answer; empty modules. Warns: no cover. Success → confetti + "View course". New courses start as **draft**.
- **Archived:** opens read-only with a banner; no Publish; the server refuses any status change out of archived by the author.
- **Access:** author only. Non-authors are redirected before the page renders (DESIGN.md Gate-Before-Fail). Guests go to sign-in.
- **Mobile (< lg):** no drag and drop; outline in a Sheet opened from the top bar; settings stack below the lesson body; reorder via the `⋯` menu.
- **Out of scope:** paste-many-lessons, AI outline, duplicate lesson, templates, co-editing.

## Sequencing with the parallel lesson-embeds branch

`feat/classroom-lesson-embeds` (another session, materials slice 1) rewrites parts of `lesson-editor.tsx`, `addLesson`/`updateLesson`, `course-view.tsx`, `rich-text-editor.tsx`, `src/lib/classroom.ts` and `messages/*.json`. It removes the lesson `youtubeUrl` field (video becomes an Embed block in the body).

- **Phase A (Tasks 1–9)** touches none of its lesson-editing files and can run now.
- **Phase B (Tasks 10–12)** builds the lesson pane and deletes the old `LessonEditor`. **Before starting Task 10:** confirm `feat/classroom-lesson-embeds` is merged (`git fetch origin && git log origin/main --oneline | grep -i embed`). If it is not, STOP and report. If it is, `git rebase origin/main`, resolve, run the full suite, then continue.
- New UI copy goes in a **new `classroomBuilder` namespace** in `messages/en.json` and `messages/nl.json` so it does not collide with the embeds branch's `classroom` keys.

## Global Constraints

- Work only in the worktree `/Users/greg/coding-projects/aitcom/.claude/worktrees/classroom-course-builder` on branch `feat/classroom-course-builder`. Run `git branch --show-current` before every commit. Never `git checkout`/`git switch` another branch; never `git stash`; never `git add -A` or `git add .` — stage files by name.
- No `Co-Authored-By` or AI credit lines in commits.
- Never run `db:apply`, `db:push`, or any command against `.env`'s `DATABASE_URL` (it is production). DB integration tests run only against the local test DB: `RUN_DB_TESTS=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test` (never port 5432 — that is an SSH tunnel to a remote DB). If that DB is not reachable, say so; do not point tests elsewhere.
- No schema migrations are needed; if a task seems to need one, stop and report.
- Design system: read `DESIGN.md` before UI work. Tokens from `src/styles/globals.css`; primitives from `src/components/ui/`. One Voice Rule — Signal Orange only on the Publish button and the active outline row. Mono only for counts/IDs/timestamps (`/ LABEL` kickers via `<SectionLabel>`). Flat-by-default: border-defined panes, no decorative shadows. Loading → `<Skeleton>`, errors → `<ErrorState onRetry>`, empty → `<EmptyState>`.
- All user-visible text through next-intl, English **and** Dutch, everyday words (no protocol jargon). Server error codes are mapped to friendly text; raw `err.message` never reaches a toast.
- Accessibility: WCAG 2.2 AA. Every input has a programmatic label; IDs come from `useId()`, never hard-coded. Drag and drop must also work by keyboard, and every reorder must be reachable from the `⋯` menu.
- Site navbar is `sticky top-0` with height `h-12` + 1px border (`src/components/navbar.tsx:149-150`); builder sticky elements offset from `top-12`.

## Review Focus

1. **Switching lessons with an unsaved edit** — the pending save must flush to the lesson it belongs to before the new lesson loads; never lost, never written to the new lesson. Test in Task 11 (`lesson-pane` switch test) and Task 5 (`flush` test).
2. **Two tabs editing the same course/lesson** — a save based on stale data returns `COURSE_CHANGED`/`LESSON_CHANGED` and the UI shows the reload message instead of overwriting. Tests in Task 1 and Task 10 (server) and Task 5 (hook surfaces `conflict`).
3. **Drag into an empty module, out of the last lesson of a module, and in a flat course** — reorder math and server validation must accept all three. Tests in Task 3 (`applyLessonMove`) and Task 2 (server).
4. **Author opens an archived course** — read-only, no status sent on any save, Publish absent. Server test in Task 1; UI test in Task 8.
5. **Network failure mid-save, then leaving the page** — text stays in the field, status shows Retry, `beforeunload` guard is armed while `error` or `dirty`. Test in Task 5.

---

## File structure

**Create**
- `src/lib/communities/layout-variant.ts` (+ `.test.ts`) — pure `resolveCommunityLayoutVariant(segments)`.
- `src/lib/classroom/publish-checklist.ts` (+ `.test.ts`) — pure checks + `lessonHasContent`.
- `src/components/classroom/builder/outline-model.ts` (+ `.test.ts`) — pure outline building and move math.
- `src/components/classroom/builder/use-autosave.ts` (+ `.test.tsx`) — debounced save hook with status + unload guard.
- `src/components/classroom/builder/builder-errors.ts` (+ `.test.ts`) — server code → i18n key.
- `src/components/classroom/builder/course-builder.tsx` — container: data, selection, layout grid.
- `src/components/classroom/builder/builder-top-bar.tsx` — title, status, save state, preview toggle, publish.
- `src/components/classroom/builder/course-details-pane.tsx` — course fields with autosave.
- `src/components/classroom/builder/course-outline.tsx` — outline pane with dnd-kit and menus.
- `src/components/classroom/builder/outline-lesson-row.tsx`, `outline-module-header.tsx`, `add-lesson-row.tsx` — outline pieces.
- `src/components/classroom/builder/publish-dialog.tsx` (+ `.test.tsx`).
- `src/components/classroom/builder/lesson-pane.tsx`, `lesson-settings-pane.tsx`, `resources-editor.tsx` (Phase B).
- `src/components/classroom/new-course-form.tsx` — title-first create step.
- `src/server/api/routers/classroom-builder.integration.test.ts` — server tests for this plan.

**Modify**
- `src/server/api/routers/classrooms.ts` — `create`, `update`, `addLesson`, new `reorderLessons`, `updateLesson` (Phase B).
- `src/app/[locale]/communities/[slug]/_community-layout-client.tsx` — use the variant.
- `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx` — server gate + builder.
- `src/app/[locale]/communities/[slug]/classroom/new/page.tsx` — `NewCourseForm`.
- `src/components/classroom/exam-editor.tsx` — `useId`, labels, "Add a quiz" entry (Task 9).
- `messages/en.json`, `messages/nl.json` — `classroomBuilder` namespace.
- `package.json` / lockfile — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

**Delete (Phase B, Task 12)**
- `src/components/classroom/course-editor.tsx`, `src/components/classroom/lesson-editor.tsx` (after grep proves no importers).

---

## Phase A — no overlap with lesson-embeds

### Task 1: Course status safety and save conflicts on the server

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (`create` ≈ line 369, `update` ≈ line 431)
- Create: `src/server/api/routers/classroom-builder.integration.test.ts`

**Interfaces:**
- Produces:
  - `classrooms.create` input `status` defaults to `"draft"`.
  - `classrooms.update` input: `{ courseId: number; title?: string; summary?: string; status?: "draft" | "published"; coverImageUrl?: string | null; expectedUpdatedAt?: string }` → `{ ok: true; updatedAt: string }`.
  - Errors: `FORBIDDEN "COURSE_ARCHIVED"` when the course is archived and `status` differs; `CONFLICT "COURSE_CHANGED"` when `expectedUpdatedAt` ≠ stored `updatedAt`.
  - Logs `course.published` activity on a draft → published transition via `update`.

- [ ] **Step 1: Write the integration test file with the fixture and failing tests**

Model the fixture on `src/server/api/routers/classroom-access.integration.test.ts` (same `isLocalDbConfigured`, `beforeAll` dynamic imports, `callerAs`). Also delete `modules` and `activityLog` rows for the fixture in `afterEach` (check the activity table name in `src/server/db/schema` — grep `logActivity` in `src/server/agent/activity.ts` for the table it inserts into).

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

describe.skipIf(!RUN_DB)("classroom builder server [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
  };
  let m: Mods;
  let fx: {
    sfx: string;
    authorId: string;
    otherId: string;
    communityId: string;
    communitySlug: string;
    courseIds: number[];
  };

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

  beforeEach(async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const authorId = `cb-author-${sfx}`;
    const otherId = `cb-other-${sfx}`;
    await m.db.insert(m.schema.user).values(
      [authorId, otherId].map((id) => ({ id, email: `${id}@example.test`, name: id })),
    );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Builder ${sfx}`, slug: `builder-${sfx}`, createdBy: authorId })
      .returning();
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: community!.id, userId: authorId, role: "member" },
      { communityId: community!.id, userId: otherId, role: "member" },
    ]);
    fx = { sfx, authorId, otherId, communityId: community!.id, communitySlug: community!.slug, courseIds: [] };
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    if (fx.courseIds.length) {
      await m.payload.delete({ collection: "lessons", where: { course: { in: fx.courseIds } } });
      await m.payload.delete({ collection: "modules", where: { course: { in: fx.courseIds } } });
      await m.payload.delete({ collection: "courses", where: { id: { in: fx.courseIds } } });
    }
    // Replace `activityLog` / `communityId` below with the real table + column
    // `logActivity` writes to (src/server/agent/activity.ts).
    await m.db.delete(m.schema.activityLog).where(eq(m.schema.activityLog.communityId, fx.communityId));
    await m.db.delete(m.schema.communityMemberships).where(eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db.delete(m.schema.communities).where(eq(m.schema.communities.id, fx.communityId));
    await m.db.delete(m.schema.user).where(inArray(m.schema.user.id, [fx.authorId, fx.otherId]));
  });

  function callerAs(userId: string) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: { user: { id: userId, name: userId }, session: {} } as never,
    });
  }

  async function createViaApi(title = "Builder course") {
    const res = await callerAs(fx.authorId).classrooms.create({
      communitySlug: fx.communitySlug,
      title,
    });
    fx.courseIds.push(res.id);
    return res;
  }

  describe("course status", () => {
    it("creates new courses as drafts by default", async () => {
      const { id } = await createViaApi();
      const course = await m.payload.findByID({ collection: "courses", id, depth: 0 });
      expect(course.status).toBe("draft");
    });

    it("refuses to move an archived course back to published", async () => {
      const { id } = await createViaApi();
      await m.payload.update({ collection: "courses", id, data: { status: "archived" } });
      await expect(
        callerAs(fx.authorId).classrooms.update({ courseId: id, status: "published" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "COURSE_ARCHIVED" });
    });

    it("still lets the author fix the title of an archived course without touching status", async () => {
      const { id } = await createViaApi();
      await m.payload.update({ collection: "courses", id, data: { status: "archived" } });
      await callerAs(fx.authorId).classrooms.update({ courseId: id, title: "Fixed title" });
      const course = await m.payload.findByID({ collection: "courses", id, depth: 0 });
      expect(course.status).toBe("archived");
      expect(course.title).toBe("Fixed title");
    });

    it("logs course.published once when a draft is published", async () => {
      const { eq, and } = await import("drizzle-orm");
      const { id } = await createViaApi();
      await callerAs(fx.authorId).classrooms.update({ courseId: id, status: "published" });
      await callerAs(fx.authorId).classrooms.update({ courseId: id, status: "published" });
      const rows = await m.db
        .select()
        .from(m.schema.activityLog)
        .where(and(eq(m.schema.activityLog.action, "course.published"), eq(m.schema.activityLog.targetId, String(id))));
      expect(rows).toHaveLength(1);
    });
  });

  describe("save conflicts", () => {
    it("returns the new updatedAt and accepts it on the next save", async () => {
      const { id } = await createViaApi();
      const before = await m.payload.findByID({ collection: "courses", id, depth: 0 });
      const first = await callerAs(fx.authorId).classrooms.update({
        courseId: id, summary: "one", expectedUpdatedAt: before.updatedAt,
      });
      expect(first.updatedAt).not.toBe(before.updatedAt);
      await expect(
        callerAs(fx.authorId).classrooms.update({ courseId: id, summary: "two", expectedUpdatedAt: first.updatedAt }),
      ).resolves.toMatchObject({ ok: true });
    });

    it("refuses a save based on a stale updatedAt", async () => {
      const { id } = await createViaApi();
      const before = await m.payload.findByID({ collection: "courses", id, depth: 0 });
      await callerAs(fx.authorId).classrooms.update({ courseId: id, summary: "other tab" });
      await expect(
        callerAs(fx.authorId).classrooms.update({ courseId: id, summary: "this tab", expectedUpdatedAt: before.updatedAt }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: "COURSE_CHANGED" });
    });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `RUN_DB_TESTS=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test npx vitest run src/server/api/routers/classroom-builder.integration.test.ts`
Expected: FAIL — status is `published`; archived → published succeeds; `updatedAt` missing from the result.

- [ ] **Step 3: Implement in `classrooms.ts`**

In `create`: change `status: z.enum(["draft", "published"]).default("published")` to `.default("draft")`.

Replace the `update` procedure body with:

```ts
  /**
   * Update own course. Status moves only between draft and published —
   * archiving is a moderator action (moderateArchive), and an archived course
   * cannot be moved back by its author. expectedUpdatedAt makes a save from a
   * stale tab fail loudly instead of overwriting newer edits.
   */
  update: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(3).max(200).optional(),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).optional(),
        coverImageUrl: z.string().url().max(1000).nullable().optional(),
        expectedUpdatedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });

      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (
        input.expectedUpdatedAt !== undefined &&
        new Date(input.expectedUpdatedAt).getTime() !==
          new Date(course.updatedAt).getTime()
      ) {
        throw new TRPCError({ code: "CONFLICT", message: "COURSE_CHANGED" });
      }

      const statusChanges =
        input.status !== undefined && input.status !== course.status;
      if (statusChanges && course.status === "archived") {
        throw new TRPCError({ code: "FORBIDDEN", message: "COURSE_ARCHIVED" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary;
      if (statusChanges) data.status = input.status;
      if (input.coverImageUrl !== undefined)
        data.coverImageUrl = input.coverImageUrl;

      const updated = await payload.update({
        collection: "courses",
        id: input.courseId,
        data,
      });

      if (statusChanges && input.status === "published") {
        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "course.published",
          targetType: "courses",
          targetId: String(course.id),
          communityId: course.communityId,
          metadata: { title: updated.title },
        });
      }

      return { ok: true as const, updatedAt: updated.updatedAt };
    }),
```

Check `course.communityId`'s type in `src/payload-types.ts` (`Course`) — `logActivity`'s `communityId` must match; mirror whatever `create` passes.

- [ ] **Step 4: Fix the old caller so types stay green**

`src/components/classroom/course-editor.tsx` still sends `status` from a state that may be typed wider. Run `npx tsc --noEmit -p .` and fix any type error there by typing the state as `"draft" | "published"` (it already is). Also change its `useState<CourseStatus>("published")` initial value to `"draft"` — it is replaced in Task 6 but must not publish new courses in the meantime.

- [ ] **Step 5: Run the tests and watch them pass**

Run: same command as Step 2. Expected: PASS (6 tests). Then `RUN_DB_TESTS=1 DATABASE_URL=… npx vitest run src/server/api/routers/classroom-access.integration.test.ts` — Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/classrooms.ts src/server/api/routers/classroom-builder.integration.test.ts src/components/classroom/course-editor.tsx
git commit -m "Classroom: new courses start as drafts, archived courses stay archived, stale course saves are refused"
```

---

### Task 2: Reorder lessons and add a lesson to a chosen module

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (`addLesson` ≈ line 471; add `reorderLessons` after `assignLessonToModule`)
- Test: `src/server/api/routers/classroom-builder.integration.test.ts`

**Interfaces:**
- Produces:
  - `classrooms.reorderLessons({ courseId: number; moduleId: number | null; orderedIds: number[] }) → { ok: true }`. `orderedIds` is the complete new order of the target container (module, or the flat course when `moduleId` is null). It must contain every lesson currently in that container and may contain lessons moving in from another module of the same course. Each listed lesson gets `module = moduleId` and `order = index`, in one transaction.
  - Errors: `BAD_REQUEST "LESSON_SET_MISMATCH"` (unknown/duplicate id, or a current member missing), `BAD_REQUEST "MODULE_COURSE_MISMATCH"` (module not in course; non-null module on a flat course; null module on a moduled course), `FORBIDDEN` (not author).
  - `classrooms.addLesson` gains `moduleId?: number`. When given it must belong to the course (`MODULE_COURSE_MISMATCH` otherwise; also rejected on a flat course). When omitted, behaviour is unchanged (last module / flat).

- [ ] **Step 1: Add failing tests** (inside the same `describe`, new nested `describe("lesson order")`)

```ts
  describe("lesson order", () => {
    async function seedModuled() {
      const { id } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      await api.addLesson({ courseId: id, title: "L1" });
      await api.addLesson({ courseId: id, title: "L2" });
      const { id: modA } = await api.addModule({ courseId: id, title: "A" }); // wraps L1, L2
      const { id: modB } = await api.addModule({ courseId: id, title: "B" }); // empty
      const lessons = await m.payload.find({ collection: "lessons", where: { course: { equals: id } }, sort: "order", depth: 0 });
      const [l1, l2] = lessons.docs;
      return { courseId: id, modA, modB, l1: l1!.id, l2: l2!.id };
    }
    const lessonState = async (lessonId: number) => {
      const l = await m.payload.findByID({ collection: "lessons", id: lessonId, depth: 0 });
      return { module: (l.module as number | null) ?? null, order: l.order };
    };

    it("reorders lessons inside a flat course", async () => {
      const { id } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id: a } = await api.addLesson({ courseId: id, title: "A" });
      const { id: b } = await api.addLesson({ courseId: id, title: "B" });
      await api.reorderLessons({ courseId: id, moduleId: null, orderedIds: [b, a] });
      expect(await lessonState(b)).toEqual({ module: null, order: 0 });
      expect(await lessonState(a)).toEqual({ module: null, order: 1 });
    });

    it("moves a lesson into an empty module", async () => {
      const s = await seedModuled();
      await callerAs(fx.authorId).classrooms.reorderLessons({ courseId: s.courseId, moduleId: s.modB, orderedIds: [s.l2] });
      expect(await lessonState(s.l2)).toEqual({ module: s.modB, order: 0 });
    });

    it("lets the last lesson leave a module (the module stays, empty)", async () => {
      const s = await seedModuled();
      const api = callerAs(fx.authorId).classrooms;
      await api.reorderLessons({ courseId: s.courseId, moduleId: s.modB, orderedIds: [s.l1, s.l2] });
      expect(await lessonState(s.l1)).toEqual({ module: s.modB, order: 0 });
      expect(await lessonState(s.l2)).toEqual({ module: s.modB, order: 1 });
      const mods = await m.payload.find({ collection: "modules", where: { course: { equals: s.courseId } }, depth: 0 });
      expect(mods.totalDocs).toBe(2);
    });

    it("refuses an order that drops a lesson already in the module", async () => {
      const s = await seedModuled();
      await expect(
        callerAs(fx.authorId).classrooms.reorderLessons({ courseId: s.courseId, moduleId: s.modA, orderedIds: [s.l2] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "LESSON_SET_MISMATCH" });
    });

    it("refuses a null module on a moduled course and a module from another course", async () => {
      const s = await seedModuled();
      const other = await seedModuled();
      const api = callerAs(fx.authorId).classrooms;
      await expect(api.reorderLessons({ courseId: s.courseId, moduleId: null, orderedIds: [s.l1, s.l2] }))
        .rejects.toMatchObject({ message: "MODULE_COURSE_MISMATCH" });
      await expect(api.reorderLessons({ courseId: s.courseId, moduleId: other.modA, orderedIds: [s.l1, s.l2] }))
        .rejects.toMatchObject({ message: "MODULE_COURSE_MISMATCH" });
    });

    it("refuses another member", async () => {
      const s = await seedModuled();
      await expect(
        callerAs(fx.otherId).classrooms.reorderLessons({ courseId: s.courseId, moduleId: s.modA, orderedIds: [s.l2, s.l1] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("adds a lesson to the chosen module, at its end", async () => {
      const s = await seedModuled();
      const { id } = await callerAs(fx.authorId).classrooms.addLesson({ courseId: s.courseId, title: "New", moduleId: s.modA });
      expect(await lessonState(id)).toEqual({ module: s.modA, order: 2 });
    });

    it("refuses a moduleId on a flat course", async () => {
      const { id } = await createViaApi();
      const other = await seedModuled();
      await expect(
        callerAs(fx.authorId).classrooms.addLesson({ courseId: id, title: "X", moduleId: other.modA }),
      ).rejects.toMatchObject({ message: "MODULE_COURSE_MISMATCH" });
    });
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `RUN_DB_TESTS=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test npx vitest run src/server/api/routers/classroom-builder.integration.test.ts -t "lesson order"`
Expected: FAIL — `reorderLessons` is not a function; `moduleId` ignored.

- [ ] **Step 3: Add a relation-id helper near the top of `classrooms.ts`** (after `resolveCommunityAndRole`)

```ts
/** A Payload relationship read at depth 0 is an id, but its type admits the populated doc. */
function relationId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return (value as { id: number }).id;
  return value as number;
}
```

- [ ] **Step 4: Implement `reorderLessons`** (insert after `assignLessonToModule`)

```ts
  /**
   * Set the complete order of one container — a module, or the flat course
   * when moduleId is null. orderedIds may pull lessons in from another module
   * of the same course (drag across modules); every lesson already in the
   * container must be listed, so nothing is silently dropped. Keeps the
   * flat-or-fully-moduled invariant: a moduled course never gets a null module.
   */
  reorderLessons: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        moduleId: z.number().nullable(),
        orderedIds: z.array(z.number()).min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const course = await payload.findByID({
        collection: "courses",
        id: input.courseId,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      const moduled = modules.length > 0;
      const moduleValid = moduled
        ? input.moduleId !== null &&
          modules.some((mod) => mod.id === input.moduleId)
        : input.moduleId === null;
      if (!moduleValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MODULE_COURSE_MISMATCH",
        });
      }

      const { docs: lessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      const courseLessonIds = new Set(lessons.map((l) => l.id));
      const listed = new Set(input.orderedIds);
      const currentMembers = lessons.filter(
        (l) => relationId(l.module) === input.moduleId,
      );
      if (
        listed.size !== input.orderedIds.length ||
        !input.orderedIds.every((id) => courseLessonIds.has(id)) ||
        !currentMembers.every((l) => listed.has(l.id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "LESSON_SET_MISMATCH",
        });
      }

      // All writes land together — a partial reorder would leave duplicate
      // order values or a lesson stranded between modules.
      const transactionID = await payload.db.beginTransaction();
      const req = transactionID ? { transactionID } : undefined;
      try {
        for (let i = 0; i < input.orderedIds.length; i++) {
          await payload.update({
            collection: "lessons",
            id: input.orderedIds[i]!,
            data: { order: i, module: input.moduleId },
            req,
          });
        }
        if (transactionID) await payload.db.commitTransaction(transactionID);
      } catch (error) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID);
        throw error;
      }
      return { ok: true };
    }),
```

- [ ] **Step 5: Add `moduleId` to `addLesson`**

Add `moduleId: z.number().optional(),` to the input. Replace the block that computes `targetModuleId` with:

```ts
      // Keep the flat-or-fully-moduled invariant: a moduled course's new
      // lesson always lands in a module — the one asked for, else the last.
      const { docs: courseModules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        sort: "-order",
        limit: 1000,
        depth: 0,
      });
      let targetModuleId: number | null = courseModules[0]?.id ?? null;
      if (input.moduleId !== undefined) {
        if (!courseModules.some((mod) => mod.id === input.moduleId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "MODULE_COURSE_MISMATCH",
          });
        }
        targetModuleId = input.moduleId;
      }
```

Leave the rest of `addLesson` unchanged (the embeds branch edits the `youtubeUrl` line in the same procedure; keeping this change confined to the module block keeps the rebase conflict small).

Note: the existing module-order count uses `where: { module: { equals: targetModuleId } }` — lesson orders may have gaps after cross-module moves, so change it to take the max order + 1 instead of the count:

```ts
        const { docs: last } = await payload.find({
          collection: "lessons",
          where: { module: { equals: targetModuleId } },
          sort: "-order",
          limit: 1,
          depth: 0,
        });
        lessonOrder = (last[0]?.order ?? -1) + 1;
```

and the same for the flat branch (`where: { course: { equals: input.courseId } }`). Update `assignLessonToModule`'s `targetCount` the same way (max + 1), since it has the same gap problem.

- [ ] **Step 6: Run and watch them pass**

Run the Step 2 command without `-t`. Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/api/routers/classrooms.ts src/server/api/routers/classroom-builder.integration.test.ts
git commit -m "Classroom: reorder lessons within and across modules; add a lesson to a chosen module"
```

---

### Task 3: Outline model (pure reorder math)

**Files:**
- Create: `src/components/classroom/builder/outline-model.ts`
- Test: `src/components/classroom/builder/outline-model.test.ts`

**Interfaces:**
- Consumes: `groupLessonsByModule`, `ModuleRef` from `@/lib/classroom`.
- Produces:
```ts
export type OutlineLesson = { id: number; title: string; module: number | null; order: number };
export type OutlineModule = { id: number; title: string; order: number; summary?: string | null };
export type OutlineGroup = { moduleId: number | null; title: string | null; summary: string | null; lessonIds: number[] };
export type LessonMove = { moduleId: number | null; orderedIds: number[] };
export function buildOutline(lessons: OutlineLesson[], modules: OutlineModule[]): OutlineGroup[];
export function findLesson(groups: OutlineGroup[], lessonId: number): { groupIndex: number; index: number } | null;
export function applyLessonMove(groups: OutlineGroup[], lessonId: number, target: { moduleId: number | null; index: number }): { groups: OutlineGroup[]; move: LessonMove } | null;
export function moveByStep(groups: OutlineGroup[], lessonId: number, delta: -1 | 1): { groups: OutlineGroup[]; move: LessonMove } | null;
export function readingOrder(groups: OutlineGroup[]): number[];
```
`move` is exactly the `reorderLessons` input minus `courseId`. `null` means no-op.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { applyLessonMove, buildOutline, moveByStep, readingOrder } from "./outline-model";

const modules = [
  { id: 10, title: "Basics", order: 0 },
  { id: 20, title: "Advanced", order: 1 },
  { id: 30, title: "Empty", order: 2 },
];
const lessons = [
  { id: 1, title: "a", module: 10, order: 0 },
  { id: 2, title: "b", module: 10, order: 1 },
  { id: 3, title: "c", module: 20, order: 0 },
];

describe("buildOutline", () => {
  it("groups by module in module order, keeping empty modules", () => {
    expect(buildOutline(lessons, modules).map((g) => [g.moduleId, g.lessonIds])).toEqual([
      [10, [1, 2]], [20, [3]], [30, []],
    ]);
  });
  it("returns one flat group when there are no modules", () => {
    const flat = lessons.map((l, i) => ({ ...l, module: null, order: 2 - i }));
    expect(buildOutline(flat, [])).toEqual([{ moduleId: null, title: null, summary: null, lessonIds: [3, 2, 1] }]);
  });
});

describe("applyLessonMove", () => {
  const groups = buildOutline(lessons, modules);
  it("reorders inside one module", () => {
    const r = applyLessonMove(groups, 2, { moduleId: 10, index: 0 })!;
    expect(r.move).toEqual({ moduleId: 10, orderedIds: [2, 1] });
    expect(r.groups[0]!.lessonIds).toEqual([2, 1]);
  });
  it("moves across modules and reports the target container's full order", () => {
    const r = applyLessonMove(groups, 1, { moduleId: 20, index: 1 })!;
    expect(r.move).toEqual({ moduleId: 20, orderedIds: [3, 1] });
    expect(r.groups[0]!.lessonIds).toEqual([2]);
  });
  it("moves into an empty module", () => {
    expect(applyLessonMove(groups, 3, { moduleId: 30, index: 0 })!.move).toEqual({ moduleId: 30, orderedIds: [3] });
  });
  it("clamps an index past the end", () => {
    expect(applyLessonMove(groups, 1, { moduleId: 20, index: 99 })!.move.orderedIds).toEqual([3, 1]);
  });
  it("returns null for a no-op and for an unknown lesson or module", () => {
    expect(applyLessonMove(groups, 1, { moduleId: 10, index: 0 })).toBeNull();
    expect(applyLessonMove(groups, 999, { moduleId: 10, index: 0 })).toBeNull();
    expect(applyLessonMove(groups, 1, { moduleId: 999, index: 0 })).toBeNull();
  });
  it("does not mutate its input", () => {
    const snapshot = JSON.stringify(groups);
    applyLessonMove(groups, 1, { moduleId: 20, index: 0 });
    expect(JSON.stringify(groups)).toBe(snapshot);
  });
});

describe("moveByStep", () => {
  const groups = buildOutline(lessons, modules);
  it("moves down within a module", () => {
    expect(moveByStep(groups, 1, 1)!.move).toEqual({ moduleId: 10, orderedIds: [2, 1] });
  });
  it("moving down from the last slot enters the next module at the top", () => {
    expect(moveByStep(groups, 2, 1)!.move).toEqual({ moduleId: 20, orderedIds: [2, 3] });
  });
  it("moving up from the first slot enters the previous module at the bottom", () => {
    expect(moveByStep(groups, 3, -1)!.move).toEqual({ moduleId: 10, orderedIds: [1, 2, 3] });
  });
  it("skips nothing: moving down from the last lesson of the last non-empty module enters the empty module", () => {
    expect(moveByStep(groups, 3, 1)!.move).toEqual({ moduleId: 30, orderedIds: [3] });
  });
  it("returns null at the very top and very bottom", () => {
    expect(moveByStep(groups, 1, -1)).toBeNull();
    const flat = buildOutline([{ id: 1, title: "a", module: null, order: 0 }], []);
    expect(moveByStep(flat, 1, 1)).toBeNull();
  });
});

describe("readingOrder", () => {
  it("flattens groups in display order", () => {
    expect(readingOrder(buildOutline(lessons, modules))).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/components/classroom/builder/outline-model.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { groupLessonsByModule } from "@/lib/classroom";

export type OutlineLesson = { id: number; title: string; module: number | null; order: number };
export type OutlineModule = { id: number; title: string; order: number; summary?: string | null };
export type OutlineGroup = {
  moduleId: number | null;
  title: string | null;
  summary: string | null;
  lessonIds: number[];
};
/** Exactly the reorderLessons input, minus courseId. */
export type LessonMove = { moduleId: number | null; orderedIds: number[] };
type MoveResult = { groups: OutlineGroup[]; move: LessonMove };

/** The builder's outline: the same grouping learners see (course-view uses groupLessonsByModule). */
export function buildOutline(lessons: OutlineLesson[], modules: OutlineModule[]): OutlineGroup[] {
  const summaries = new Map(modules.map((mod) => [mod.id, mod.summary ?? null]));
  return groupLessonsByModule(lessons, modules).map((g) => ({
    moduleId: g.module?.id ?? null,
    title: g.module?.title ?? null,
    summary: g.module ? (summaries.get(g.module.id) ?? null) : null,
    lessonIds: g.lessons.map((l) => l.id),
  }));
}

export function findLesson(groups: OutlineGroup[], lessonId: number) {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const index = groups[groupIndex]!.lessonIds.indexOf(lessonId);
    if (index !== -1) return { groupIndex, index };
  }
  return null;
}

export function applyLessonMove(
  groups: OutlineGroup[],
  lessonId: number,
  target: { moduleId: number | null; index: number },
): MoveResult | null {
  const from = findLesson(groups, lessonId);
  const toGroupIndex = groups.findIndex((g) => g.moduleId === target.moduleId);
  if (!from || toGroupIndex === -1) return null;

  const next = groups.map((g) => ({ ...g, lessonIds: [...g.lessonIds] }));
  next[from.groupIndex]!.lessonIds.splice(from.index, 1);
  const dest = next[toGroupIndex]!.lessonIds;
  const index = Math.max(0, Math.min(target.index, dest.length));
  dest.splice(index, 0, lessonId);

  if (from.groupIndex === toGroupIndex && from.index === index) return null;
  return { groups: next, move: { moduleId: target.moduleId, orderedIds: dest } };
}

/** One step up or down in reading order, crossing into the neighbouring module at its edge. */
export function moveByStep(groups: OutlineGroup[], lessonId: number, delta: -1 | 1): MoveResult | null {
  const from = findLesson(groups, lessonId);
  if (!from) return null;
  const group = groups[from.groupIndex]!;
  const within = from.index + delta;
  if (within >= 0 && within < group.lessonIds.length) {
    return applyLessonMove(groups, lessonId, { moduleId: group.moduleId, index: within });
  }
  const neighbour = groups[from.groupIndex + delta];
  if (!neighbour) return null;
  return applyLessonMove(groups, lessonId, {
    moduleId: neighbour.moduleId,
    index: delta === 1 ? 0 : neighbour.lessonIds.length,
  });
}

export function readingOrder(groups: OutlineGroup[]): number[] {
  return groups.flatMap((g) => g.lessonIds);
}
```

Check `groupLessonsByModule`'s generic bound (`OrderableLesson`, `ModuleRef` in `src/lib/classroom.ts`); if `ModuleRef` requires fields `OutlineModule` lacks, widen `OutlineModule` to match rather than casting.

- [ ] **Step 4: Run and watch it pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/builder/outline-model.ts src/components/classroom/builder/outline-model.test.ts
git commit -m "Classroom builder: outline model for grouping and moving lessons"
```

---

### Task 4: Publish checklist (pure)

**Files:**
- Create: `src/lib/classroom/publish-checklist.ts`
- Test: `src/lib/classroom/publish-checklist.test.ts`

Note: `src/lib/classroom.ts` (file) and `src/lib/classroom/` (directory, added by the embeds branch) coexist; `@/lib/classroom` resolves to the file. Import this module by its full path `@/lib/classroom/publish-checklist`. If the directory does not exist yet on this branch, creating it is fine.

**Interfaces:**
- Produces:
```ts
export type ChecklistLesson = { id: number; title: string; module: number | null; body?: unknown; resources?: { label: string; url: string }[] | null; examQuestions?: unknown };
export type ChecklistInput = { title: string; coverImageUrl: string | null; lessons: ChecklistLesson[]; modules: { id: number; title: string }[] };
export type CheckId = "title" | "hasLessons" | "noEmptyLessons" | "quizAnswers" | "noEmptyModules" | "cover";
export type CheckResult = { id: CheckId; level: "block" | "warn"; ok: boolean; lessonIds?: number[]; moduleIds?: number[] };
export function publishChecks(input: ChecklistInput): CheckResult[];
export function canPublish(results: CheckResult[]): boolean; // no failing "block"
export function lessonHasContent(lesson: ChecklistLesson): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { canPublish, lessonHasContent, publishChecks } from "./publish-checklist";

const text = (s: string) => ({
  root: { type: "root", children: [{ type: "paragraph", children: s ? [{ type: "text", text: s }] : [] }] },
});
const embed = { root: { type: "root", children: [{ type: "classroom-embed", url: "https://x" }] } };
const q = (options: string[], correctIndex: number) => ({ id: "q", prompt: "p", type: "single", options, correctIndex });

describe("lessonHasContent", () => {
  it("is false for a missing body, an empty paragraph, or whitespace", () => {
    expect(lessonHasContent({ id: 1, title: "t", module: null })).toBe(false);
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: text("") })).toBe(false);
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: text("   ") })).toBe(false);
  });
  it("is true for text, any non-paragraph block (embeds, images), resources, or quiz questions", () => {
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: text("Hi") })).toBe(true);
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: embed })).toBe(true);
    expect(lessonHasContent({ id: 1, title: "t", module: null, resources: [{ label: "a", url: "https://a" }] })).toBe(true);
    expect(lessonHasContent({ id: 1, title: "t", module: null, examQuestions: [q(["a", "b"], 0)] })).toBe(true);
  });
  it("tolerates a malformed body", () => {
    expect(lessonHasContent({ id: 1, title: "t", module: null, body: "nonsense" })).toBe(false);
  });
});

describe("publishChecks", () => {
  const good = {
    title: "Course", coverImageUrl: "https://c",
    lessons: [{ id: 1, title: "L", module: 5, body: text("x"), examQuestions: [q(["a", "b"], 1)] }],
    modules: [{ id: 5, title: "M" }],
  };
  const byId = (input: Parameters<typeof publishChecks>[0]) =>
    Object.fromEntries(publishChecks(input).map((r) => [r.id, r]));

  it("passes a complete course", () => {
    expect(canPublish(publishChecks(good))).toBe(true);
  });
  it("blocks with no lessons", () => {
    const r = byId({ ...good, lessons: [], modules: [] });
    expect(r.hasLessons).toMatchObject({ ok: false, level: "block" });
  });
  it("blocks on empty lessons and names them", () => {
    const r = byId({ ...good, lessons: [...good.lessons, { id: 2, title: "E", module: 5 }] });
    expect(r.noEmptyLessons).toMatchObject({ ok: false, level: "block", lessonIds: [2] });
  });
  it("blocks when a quiz answer index is out of range or an option is blank", () => {
    expect(byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [q(["a", "b"], 2)] }]}).quizAnswers)
      .toMatchObject({ ok: false, lessonIds: [1] });
    expect(byId({ ...good, lessons: [{ ...good.lessons[0]!, examQuestions: [q(["a", " "], 0)] }]}).quizAnswers)
      .toMatchObject({ ok: false });
  });
  it("blocks on empty modules and names them", () => {
    const r = byId({ ...good, modules: [...good.modules, { id: 6, title: "Empty" }] });
    expect(r.noEmptyModules).toMatchObject({ ok: false, moduleIds: [6] });
  });
  it("only warns about a missing cover", () => {
    const results = publishChecks({ ...good, coverImageUrl: null });
    expect(results.find((r) => r.id === "cover")).toMatchObject({ ok: false, level: "warn" });
    expect(canPublish(results)).toBe(true);
  });
  it("blocks a blank title", () => {
    expect(byId({ ...good, title: "  " }).title).toMatchObject({ ok: false, level: "block" });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/classroom/publish-checklist.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * What must be true before a course goes live. Pure, so the publish dialog
 * and any future server-side check share one definition.
 */
export type ChecklistLesson = {
  id: number;
  title: string;
  module: number | null;
  body?: unknown;
  resources?: { label: string; url: string }[] | null;
  examQuestions?: unknown;
};
export type ChecklistInput = {
  title: string;
  coverImageUrl: string | null;
  lessons: ChecklistLesson[];
  modules: { id: number; title: string }[];
};
export type CheckId = "title" | "hasLessons" | "noEmptyLessons" | "quizAnswers" | "noEmptyModules" | "cover";
export type CheckResult = {
  id: CheckId;
  level: "block" | "warn";
  ok: boolean;
  lessonIds?: number[];
  moduleIds?: number[];
};

type LexicalNode = { type?: unknown; text?: unknown; children?: unknown };

/** True when a Lexical tree holds visible text or any non-paragraph block (embed, image, list…). */
function nodeHasContent(node: LexicalNode): boolean {
  if (typeof node.text === "string" && node.text.trim() !== "") return true;
  const structural = node.type === "root" || node.type === "paragraph" || node.type === "text" || node.type === "linebreak";
  if (typeof node.type === "string" && !structural) return true;
  return Array.isArray(node.children) && node.children.some((c) => nodeHasContent(c as LexicalNode));
}

function questionsOf(lesson: ChecklistLesson): { options: string[]; correctIndex: number }[] {
  return Array.isArray(lesson.examQuestions)
    ? (lesson.examQuestions as { options: string[]; correctIndex: number }[])
    : [];
}

export function lessonHasContent(lesson: ChecklistLesson): boolean {
  if ((lesson.resources?.length ?? 0) > 0) return true;
  if (questionsOf(lesson).length > 0) return true;
  const body = lesson.body as { root?: LexicalNode } | null | undefined;
  return !!body && typeof body === "object" && !!body.root && nodeHasContent(body.root);
}

function quizValid(lesson: ChecklistLesson): boolean {
  return questionsOf(lesson).every(
    (q) =>
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      q.options.every((o) => typeof o === "string" && o.trim() !== "") &&
      Number.isInteger(q.correctIndex) &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length,
  );
}

export function publishChecks(input: ChecklistInput): CheckResult[] {
  const empty = input.lessons.filter((l) => !lessonHasContent(l)).map((l) => l.id);
  const badQuiz = input.lessons.filter((l) => !quizValid(l)).map((l) => l.id);
  const used = new Set(input.lessons.map((l) => l.module));
  const emptyModules = input.modules.filter((mod) => !used.has(mod.id)).map((mod) => mod.id);
  return [
    { id: "title", level: "block", ok: input.title.trim().length >= 3 },
    { id: "hasLessons", level: "block", ok: input.lessons.length > 0 },
    { id: "noEmptyLessons", level: "block", ok: empty.length === 0, lessonIds: empty },
    { id: "quizAnswers", level: "block", ok: badQuiz.length === 0, lessonIds: badQuiz },
    { id: "noEmptyModules", level: "block", ok: emptyModules.length === 0, moduleIds: emptyModules },
    { id: "cover", level: "warn", ok: !!input.coverImageUrl },
  ];
}

export function canPublish(results: CheckResult[]): boolean {
  return results.every((r) => r.ok || r.level === "warn");
}
```

The `"title"` threshold of 3 matches the server's `z.string().min(3)`. Check the exam prompt too: if `ExamQuestion.prompt` is blank the runner shows an empty question — add `typeof q.prompt === "string" && q.prompt.trim() !== ""` to `quizValid` and a test line for it.

- [ ] **Step 4: Run and watch it pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classroom/publish-checklist.ts src/lib/classroom/publish-checklist.test.ts
git commit -m "Classroom: publish checklist for courses"
```

---

### Task 5: Autosave hook and friendly builder errors

**Files:**
- Create: `src/components/classroom/builder/use-autosave.ts`, `src/components/classroom/builder/use-autosave.test.tsx`
- Create: `src/components/classroom/builder/builder-errors.ts`, `src/components/classroom/builder/builder-errors.test.ts`

**Interfaces:**
- Produces:
```ts
export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
export function useAutosave<T>(opts: {
  value: T;                              // current draft
  save: (value: T) => Promise<void>;     // throws on failure; throw an error whose .message is "COURSE_CHANGED" or "LESSON_CHANGED" for conflicts
  delayMs?: number;                      // default 1000
  enabled?: boolean;                     // false = never saves (read-only/archived)
  isEqual?: (a: T, b: T) => boolean;     // default: JSON equality
}): { status: AutosaveStatus; savedAt: Date | null; flush: () => Promise<void>; retry: () => Promise<void> };
export function useUnsavedChangesGuard(active: boolean): void; // beforeunload prompt while active
export function builderErrorKey(message: string | undefined): BuilderErrorKey;
```
- Behaviour: the first `value` is the baseline (not saved). Each change after that sets `dirty` and (re)starts the timer. On fire: `saving` → `saved` (+`savedAt`) or `error`/`conflict`. Saves never overlap; a change during a save queues one follow-up save of the latest value. `flush()` saves immediately if dirty and resolves when done. On unmount, a pending dirty value is flushed (fire-and-forget). `useUnsavedChangesGuard(status === "dirty" || status === "saving" || status === "error" || status === "conflict")` is wired by callers.

- [ ] **Step 1: Write the failing tests**

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave, useUnsavedChangesGuard } from "./use-autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(save: (v: string) => Promise<void>, initial = "a", enabled = true) {
  return renderHook(({ value }) => useAutosave({ value, save, delayMs: 1000, enabled }), {
    initialProps: { value: initial },
  });
}

describe("useAutosave", () => {
  it("does not save the initial value", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(save);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("debounces and saves the latest value once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "ab" });
    await act(() => vi.advanceTimersByTimeAsync(500));
    rerender({ value: "abc" });
    expect(result.current.status).toBe("dirty");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("abc");
    expect(result.current.status).toBe("saved");
    expect(result.current.savedAt).toBeInstanceOf(Date);
  });

  it("keeps the value and reports error on failure; retry saves it", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("NETWORK")).mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("error");
    await act(() => result.current.retry());
    expect(save).toHaveBeenLastCalledWith("b");
    expect(result.current.status).toBe("saved");
  });

  it("reports conflict for COURSE_CHANGED / LESSON_CHANGED and does not retry automatically", async () => {
    const save = vi.fn().mockRejectedValue(new Error("LESSON_CHANGED"));
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.status).toBe("conflict");
    rerender({ value: "bc" });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never overlaps saves; a change during a save triggers one follow-up with the latest value", async () => {
    let resolveFirst!: () => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }))
      .mockResolvedValue(undefined);
    const { rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ value: "bc" });
    rerender({ value: "bcd" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst(); });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("bcd");
  });

  it("flush saves a pending value immediately", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = setup(save);
    rerender({ value: "b" });
    await act(() => result.current.flush());
    expect(save).toHaveBeenCalledWith("b");
  });

  it("flushes a pending value on unmount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = setup(save);
    rerender({ value: "b" });
    unmount();
    expect(save).toHaveBeenCalledWith("b");
  });

  it("never saves when disabled", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = setup(save, "a", false);
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
  });
});

describe("useUnsavedChangesGuard", () => {
  it("prevents unload only while active", () => {
    const { rerender } = renderHook(({ active }) => useUnsavedChangesGuard(active), { initialProps: { active: true } });
    const e1 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    rerender({ active: false });
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});
```

`builder-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { builderErrorKey } from "./builder-errors";

describe("builderErrorKey", () => {
  it.each([
    ["COURSE_CHANGED", "errorChangedElsewhere"],
    ["LESSON_CHANGED", "errorChangedElsewhere"],
    ["COURSE_ARCHIVED", "errorArchived"],
    ["MODULE_NOT_EMPTY", "errorModuleNotEmpty"],
    ["LESSON_SET_MISMATCH", "errorOutlineOutOfDate"],
    ["MODULE_COURSE_MISMATCH", "errorOutlineOutOfDate"],
    ["MODULE_SET_MISMATCH", "errorOutlineOutOfDate"],
    ["INVALID_EMBED", "errorInvalidEmbed"],
    ["FORBIDDEN", "errorNotAllowed"],
    ["something raw from the server", "errorGeneric"],
    [undefined, "errorGeneric"],
  ])("maps %s to %s", (code, key) => {
    expect(builderErrorKey(code)).toBe(key);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/components/classroom/builder/use-autosave.test.tsx src/components/classroom/builder/builder-errors.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `builder-errors.ts`**

```ts
/** Server error codes → keys in the `classroomBuilder` messages namespace. Raw server text never reaches the UI. */
const KEYS = {
  COURSE_CHANGED: "errorChangedElsewhere",
  LESSON_CHANGED: "errorChangedElsewhere",
  COURSE_ARCHIVED: "errorArchived",
  MODULE_NOT_EMPTY: "errorModuleNotEmpty",
  LESSON_SET_MISMATCH: "errorOutlineOutOfDate",
  MODULE_COURSE_MISMATCH: "errorOutlineOutOfDate",
  MODULE_SET_MISMATCH: "errorOutlineOutOfDate",
  INVALID_EMBED: "errorInvalidEmbed",
  FORBIDDEN: "errorNotAllowed",
} as const;

export type BuilderErrorKey = (typeof KEYS)[keyof typeof KEYS] | "errorGeneric";

export function builderErrorKey(message: string | undefined): BuilderErrorKey {
  return (message && message in KEYS ? KEYS[message as keyof typeof KEYS] : "errorGeneric");
}
```

(tRPC `FORBIDDEN` without a message arrives with `message === "FORBIDDEN"`; verify by logging one in the Task 7 manual check and adjust if not.)

- [ ] **Step 4: Implement `use-autosave.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

const CONFLICT_CODES = new Set(["COURSE_CHANGED", "LESSON_CHANGED"]);
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Debounced autosave for one draft value. The builder's single save model:
 * no Save buttons, one visible status. Saves never overlap; the newest value
 * always wins; a pending value is flushed on unmount so switching lessons
 * never loses typing.
 */
export function useAutosave<T>({
  value,
  save,
  delayMs = 1000,
  enabled = true,
  isEqual = jsonEqual,
}: {
  value: T;
  save: (value: T) => Promise<void>;
  delayMs?: number;
  enabled?: boolean;
  isEqual?: (a: T, b: T) => boolean;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const latest = useRef(value);
  const persisted = useRef(value);
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const conflicted = useRef(false);

  latest.current = value;
  saveRef.current = save;

  const isDirty = useCallback(() => !isEqual(latest.current, persisted.current), [isEqual]);

  const run = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      await inFlight.current;
      if (isDirty() && !conflicted.current) return run();
      return;
    }
    if (!isDirty() || conflicted.current) return;
    const snapshot = latest.current;
    setStatus("saving");
    const attempt = (async () => {
      try {
        await saveRef.current(snapshot);
        persisted.current = snapshot;
        setSavedAt(new Date());
        setStatus(isDirty() ? "dirty" : "saved");
      } catch (err) {
        const code = err instanceof Error ? err.message : undefined;
        if (code && CONFLICT_CODES.has(code)) {
          conflicted.current = true;
          setStatus("conflict");
        } else {
          setStatus("error");
        }
      }
    })();
    inFlight.current = attempt;
    await attempt;
    inFlight.current = null;
    if (isDirty() && !conflicted.current && status !== "error") schedule();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delayMs);
  }, [delayMs, run]);

  useEffect(() => {
    if (!enabled || conflicted.current) return;
    if (!isDirty()) return;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    schedule();
  }, [value, enabled, isDirty, schedule]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (enabled) await run();
  }, [enabled, run]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (enabled && !conflicted.current && !isEqual(latest.current, persisted.current)) {
        void saveRef.current(latest.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { status, savedAt, flush, retry: flush };
}

/** Browser "leave site?" prompt while there is work that is not safely saved. */
export function useUnsavedChangesGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
```

The follow-up-after-save logic above reads `status` from a stale closure; the implementer must make the tests pass with a correct design — keep a `statusRef` mirror, or restructure `run` as a loop (`while (isDirty() && !conflicted.current) { …save… }` with errors breaking the loop). The tests, not this sketch, are the contract. Do not weaken a test to fit the sketch.

- [ ] **Step 5: Run and watch them pass.** Expected: PASS (all). Then `npx eslint src/components/classroom/builder` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/classroom/builder/use-autosave.ts src/components/classroom/builder/use-autosave.test.tsx src/components/classroom/builder/builder-errors.ts src/components/classroom/builder/builder-errors.test.ts
git commit -m "Classroom builder: autosave hook with one visible save status and friendly error keys"
```

---

### Task 6: Workspace layout seam, gated edit route, builder shell, course details, new-course step

**Files:**
- Create: `src/lib/communities/layout-variant.ts`, `src/lib/communities/layout-variant.test.ts`
- Modify: `src/app/[locale]/communities/[slug]/_community-layout-client.tsx`
- Modify: `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx`
- Modify: `src/app/[locale]/communities/[slug]/classroom/new/page.tsx`
- Create: `src/components/classroom/new-course-form.tsx`
- Create: `src/components/classroom/builder/course-builder.tsx`, `builder-top-bar.tsx`, `course-details-pane.tsx`
- Modify: `messages/en.json`, `messages/nl.json` (new `classroomBuilder` namespace)

**Interfaces:**
- Consumes: `useAutosave`, `useUnsavedChangesGuard`, `builderErrorKey` (Task 5); `classrooms.update` returning `updatedAt` (Task 1); `buildOutline` (Task 3).
- Produces:
```ts
// layout-variant.ts
export type CommunityLayoutVariant = "standard" | "workspace";
export function resolveCommunityLayoutVariant(segments: string[]): CommunityLayoutVariant;
// course-builder.tsx
export function CourseBuilder(props: { slug: string; courseSlug: string }): JSX.Element;
export type BuilderSelection = { kind: "details" } | { kind: "lesson"; lessonId: number };
// builder-top-bar.tsx
export function BuilderTopBar(props: {
  slug: string; courseSlug: string; title: string; status: "draft" | "published" | "archived"; isPublic: boolean;
  saveStatus: AutosaveStatus; savedAt: Date | null; onRetry: () => void;
  previewing: boolean; onTogglePreview: () => void; onPublish: () => void; onUnpublish: () => void;
  onOpenOutline: () => void; // mobile only
}): JSX.Element;
// course-details-pane.tsx
export function CourseDetailsPane(props: {
  course: { id: number; title: string; summary: string | null; coverImageUrl: string | null; isPublic: boolean; updatedAt: string };
  readOnly: boolean;
  onStatusChange: (s: { status: AutosaveStatus; savedAt: Date | null; retry: () => void }) => void;
}): JSX.Element;
// new-course-form.tsx
export function NewCourseForm(props: { slug: string }): JSX.Element;
```

- [ ] **Step 1: Failing test for the layout variant**

```ts
import { describe, expect, it } from "vitest";
import { resolveCommunityLayoutVariant } from "./layout-variant";

describe("resolveCommunityLayoutVariant", () => {
  it("uses the workspace layout for the course builder", () => {
    expect(resolveCommunityLayoutVariant(["classroom", "my-course", "edit"])).toBe("workspace");
  });
  it("keeps the standard layout everywhere else", () => {
    for (const segs of [[], ["classroom"], ["classroom", "new"], ["classroom", "my-course"], ["events", "x", "edit"], ["classroom", "edit"]]) {
      expect(resolveCommunityLayoutVariant(segs)).toBe("standard");
    }
  });
  it("ignores route groups", () => {
    expect(resolveCommunityLayoutVariant(["(authoring)", "classroom", "c", "edit"])).toBe("workspace");
  });
});
```

Run: `npx vitest run src/lib/communities/layout-variant.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement the variant resolver**

```ts
/**
 * Which frame the community layout draws around a page. `workspace` pages are
 * full-screen authoring tools: no community header, no tab bar, no width cap.
 * Add a new workspace route here — the layout reads only this function.
 */
export type CommunityLayoutVariant = "standard" | "workspace";

const WORKSPACE_ROUTES: ReadonlyArray<ReadonlyArray<string | null>> = [
  // classroom/<courseSlug>/edit — null matches any single segment
  ["classroom", null, "edit"],
];

export function resolveCommunityLayoutVariant(segments: string[]): CommunityLayoutVariant {
  const path = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  const match = WORKSPACE_ROUTES.some(
    (pattern) => pattern.length === path.length && pattern.every((p, i) => p === null || p === path[i]),
  );
  return match ? "workspace" : "standard";
}
```

Run the test — Expected: PASS.

- [ ] **Step 3: Use it in the community layout**

In `_community-layout-client.tsx` import `useSelectedLayoutSegments` from `next/navigation` and the resolver; replace the final return:

```tsx
  const variant = resolveCommunityLayoutVariant(useSelectedLayoutSegments());
```

(Call the hook at the top of the component with the other hooks, not after the early returns — hooks order.)

```tsx
  return (
    <PageDocumentAuthProvider user={initialUser}>
      {variant === "workspace" ? (
        children
      ) : (
        <div className="flex flex-col">
          <CommunityHeader community={community} membershipStatus={membershipStatus} memberRole={memberRole} />
          <CommunityNav slug={slug} memberRole={memberRole} />
          <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</div>
        </div>
      )}
    </PageDocumentAuthProvider>
  );
```

- [ ] **Step 4: Gate the edit route on the server**

Find the server session helper used by `dashboard/layout.tsx` and `blog/write` (DESIGN.md Gate-Before-Fail cites them): `grep -rn "redirect(" src/app/\[locale\]/dashboard/layout.tsx src/app/\[locale\]/blog/write`. Mirror it exactly. Replace `edit/page.tsx`:

```tsx
import { redirect } from "@/i18n/navigation"; // or next/navigation — use whatever dashboard/layout.tsx uses
import { getPayloadClient } from "@/server/payload";
import { CourseBuilder } from "@/components/classroom/builder/course-builder";
// + the session helper dashboard/layout.tsx uses

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; courseSlug: string }>;
}) {
  const { locale, slug, courseSlug } = await params;
  const session = await /* session helper */;
  const here = `/communities/${slug}/classroom/${courseSlug}/edit`;
  if (!session?.user) redirect(/* sign-in path with ?redirect=here, as dashboard does */);

  // Author-only editing: anyone else goes to the course page instead of a
  // form that would fail on the first save (Gate-Before-Fail).
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "courses",
    where: { slug: { equals: courseSlug } },
    limit: 1,
    depth: 0,
  });
  const course = docs[0];
  if (!course || course.authorId !== session.user.id) {
    redirect(/* `/communities/${slug}/classroom/${courseSlug}` in `locale` */);
  }
  return <CourseBuilder slug={slug} courseSlug={courseSlug} />;
}
```

Replace the comment placeholders with the real helper and redirect calls you found — the file must contain no comments standing in for code.

- [ ] **Step 5: Add the `classroomBuilder` messages (en + nl)**

Add to `messages/en.json` a top-level `"classroomBuilder"` object with (at least) these keys; add the Dutch equivalents to `messages/nl.json` with the same keys (write natural Dutch; keep "Draft"→"Concept", "Publish"→"Publiceren"):

```json
"classroomBuilder": {
  "backToClassroom": "Classroom",
  "courseDetails": "Course details",
  "statusDraft": "Draft",
  "statusPublished": "Published",
  "statusArchived": "Archived",
  "visibilityPublic": "Public",
  "visibilityMembers": "Members only",
  "saving": "Saving…",
  "saved": "Saved",
  "savedAt": "Saved {time}",
  "saveFailed": "Couldn't save",
  "retry": "Retry",
  "reload": "Reload",
  "edit": "Edit",
  "preview": "Preview",
  "publish": "Publish",
  "moveToDraft": "Move back to draft",
  "outline": "Outline",
  "archivedBanner": "A moderator archived this course. You can read it here, but it can't be edited or published.",
  "titleLabel": "Course title",
  "summaryLabel": "Short summary",
  "summaryHint": "One or two sentences. Shown on the course card.",
  "coverLabel": "Cover image",
  "coverHint": "Learners see it cropped to this wide shape.",
  "addCover": "Add a cover",
  "replaceCover": "Replace",
  "removeCover": "Remove cover",
  "uploading": "Uploading…",
  "uploadFailed": "The image didn't upload. Try again.",
  "visibilityLabel": "Who can see it",
  "visibilityHint": "Change this from the course page.",
  "newCourseTitle": "Start a new course",
  "newCourseLead": "Give it a working title. You can change everything later — it stays a draft until you publish.",
  "createCourse": "Create draft",
  "titleTooShort": "Use at least 3 characters.",
  "errorChangedElsewhere": "This course changed somewhere else, maybe in another tab. Reload to get the latest version.",
  "errorArchived": "This course is archived, so it can't be changed.",
  "errorModuleNotEmpty": "Move this module's lessons out first.",
  "errorOutlineOutOfDate": "The outline was out of date. We reloaded it — please try again.",
  "errorInvalidEmbed": "One of the embedded links can't be shown. Check it and try again.",
  "errorNotAllowed": "Only the course author can do this.",
  "errorGeneric": "Something went wrong. Try again."
}
```

Later tasks append their own keys to the same namespace (en + nl in the same commit).

- [ ] **Step 6: Build `NewCourseForm` and swap the new route**

`new-course-form.tsx`: a centred, narrow (this one *is* a short form — `max-w-lg`) step with `<SectionLabel>` kicker, `newCourseTitle` heading, `newCourseLead`, one labelled title `Input` (`useId`), inline `titleTooShort` hint after a blur with < 3 chars, and a primary `createCourse` button. On submit: `api.classrooms.create.useMutation` with `{ communitySlug: slug, title }` (status omitted → draft) → `router.replace(`/communities/${slug}/classroom/${newSlug}/edit`)`. Errors via `toast.error(t(builderErrorKey(err.message)))`. Wrap the create in the same `requireAuth` soft gate other create actions use (grep `requireAuth(` for the import). `new/page.tsx` renders `<NewCourseForm slug={slug} />`.

- [ ] **Step 7: Build `CourseBuilder`, `BuilderTopBar`, `CourseDetailsPane`**

`CourseBuilder` (container):
- `api.classrooms.get.useQuery({ slug: courseSlug })`. Loading → a `<Skeleton>` of the three-pane layout; error → `<ErrorState onRetry>`; missing → `<EmptyState title=… />`.
- Selection from the URL: `?lesson=<id>` → lesson, otherwise details. Use `useSearchParams` + `router.replace` (shallow, `scroll: false`) to change it. An unknown lesson id falls back to details.
- `readOnly = course.status === "archived"` → render `archivedBanner` (an `Alert`) under the top bar; pass `readOnly` down.
- Layout (desktop): `grid lg:grid-cols-[18rem_minmax(0,1fr)_20rem]`, height `calc(100dvh - 3rem - 1px)` (navbar `h-12` + border). Each pane scrolls on its own (`overflow-y-auto`); panes separated by `border-r`/`border-l` (Flat-By-Default). The top bar is `sticky top-12 z-40` with `border-b bg-background`. In Task 6 the left pane holds a simple list (the details item + lesson titles from `buildOutline`, each a link that sets the selection) — Task 7 replaces it with the full outline. The right pane is empty (`hidden`) unless a lesson is selected — Task 11 fills it.
- Middle pane: `CourseDetailsPane` when details is selected. When a lesson is selected in Phase A, render the lesson title and an `EmptyState` saying lesson editing arrives with the lesson pane — this state never ships (Phase B replaces it before the PR); it only keeps the branch runnable.
- Preview toggle: when on, render `<CourseView slug={slug} courseSlug={courseSlug} previewing />` in place of the three panes. Read `course-view.tsx` to see how preview is entered today (`previewing` state at line ~75); add a prop to start in preview mode rather than duplicating the view. That is a one-line change in `course-view.tsx` — acceptable overlap, keep it minimal.
- Owns the aggregated save state: `CourseDetailsPane` (and later `LessonPane`) report `{status, savedAt, retry}` up via `onStatusChange`; the top bar shows the worst current state (`conflict` > `error` > `saving` > `dirty` > `saved` > `idle`). Wire `useUnsavedChangesGuard` to that state.
- Conflict: show `errorChangedElsewhere` inline in the top bar with a `reload` button that calls `utils.classrooms.get.invalidate()` then remounts the active pane (bump a `key`).
- Mobile (< lg): single column; the top bar shows an `outline` button that opens the left pane inside a `Sheet` (`src/components/ui/sheet.tsx`); the right pane stacks below the middle one.

`BuilderTopBar`: left — `← backToClassroom` (`Link` to `/communities/${slug}/classroom`), course title (truncate), status `Badge` (Draft = outline, Published = secondary, Archived = muted) + visibility text. Right — save status text (Mono for the time only: `savedAt` via `RelativeTime` from `src/components/ui/relative-time.tsx`), `SegmentedControl` Edit/Preview, and the publish control: draft → orange primary `publish` button; published → `DropdownMenu` trigger showing `statusPublished` with item `moveToDraft`; archived → nothing. In Task 6, `onPublish` directly calls `update({ status: "published" })`; Task 8 puts the checklist dialog in front of it.

`CourseDetailsPane`: fields title (min 3; show `titleTooShort` and do not save while invalid), summary (`Textarea`, 500 max, `summaryHint`), cover (upload flow moved verbatim from `course-editor.tsx` `handleCoverUpload` — same `/api/upload` call — preview at `aspect-[16/5]` to match `course-view.tsx:196`, with `replaceCover`/`removeCover` buttons), visibility read-only (`visibilityLabel` + `visibilityHint`). All labels via `useId`. One `useAutosave` over `{ title, summary, coverImageUrl }` with `save = async (v) => { const r = await update.mutateAsync({ courseId, ...v, expectedUpdatedAt: updatedAtRef.current }); updatedAtRef.current = r.updatedAt; }`, `enabled: !readOnly && title.trim().length >= 3`. Map mutation errors so the thrown `Error.message` is the server code (tRPC's `TRPCClientError.message` already is). After a successful save, update the `get` cache for `title` via `utils.classrooms.get.setData` so the top bar title follows without a refetch.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit -p .` — Expected: clean.
Run: `npx vitest run src/lib/communities src/components/classroom` — Expected: PASS.
Run: `npx eslint src/components/classroom src/lib/communities "src/app/[locale]/communities/[slug]"` — Expected: clean.
Check that `course-editor.tsx` is now imported by nothing except possibly tests: `grep -rn "course-editor" src`. Leave the file in place (Task 12 deletes it with `lesson-editor.tsx`).

Manual check (only if a local dev server can run against a non-production DB — see Global Constraints; otherwise say it was skipped): open `/en/communities/<slug>/classroom/<course>/edit` as the author (full-width, no community tabs), as another member (redirected to the course page), and signed out (sign-in). Any other community page still shows the header and tabs.

- [ ] **Step 9: Commit**

```bash
git add src/lib/communities/layout-variant.ts src/lib/communities/layout-variant.test.ts "src/app/[locale]/communities/[slug]/_community-layout-client.tsx" "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx" "src/app/[locale]/communities/[slug]/classroom/new/page.tsx" src/components/classroom/new-course-form.tsx src/components/classroom/builder/course-builder.tsx src/components/classroom/builder/builder-top-bar.tsx src/components/classroom/builder/course-details-pane.tsx src/components/classroom/course-view.tsx messages/en.json messages/nl.json
git commit -m "Classroom: full-width course builder shell with autosaved course details; editing is author-only and new courses start as drafts"
```

---

### Task 7: Course outline with drag and drop

**Files:**
- Modify: `package.json` + lockfile (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — use the package manager the lockfile belongs to: `ls bun.lock* package-lock.json pnpm-lock.yaml`)
- Create: `src/components/classroom/builder/course-outline.tsx`, `outline-lesson-row.tsx`, `outline-module-header.tsx`, `add-lesson-row.tsx`
- Create: `src/components/classroom/builder/course-outline.test.tsx`
- Modify: `src/components/classroom/builder/course-builder.tsx` (replace the Task 6 list)
- Modify: `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Consumes: `buildOutline`, `applyLessonMove`, `moveByStep`, `OutlineGroup`, `LessonMove` (Task 3); `classrooms.reorderLessons`, `addLesson({ moduleId })` (Task 2); existing `addModule`, `renameModule`, `deleteModule`, `dissolveModules`, `deleteLesson`; `useConfirm` from `@/components/confirm-dialog`; `builderErrorKey`.
- Produces:
```ts
export function CourseOutline(props: {
  courseId: number;
  lessons: { id: number; title: string; module: number | null; order: number; body?: unknown; resources?: unknown; examQuestions?: unknown }[];
  modules: { id: number; title: string; order: number; summary?: string | null }[];
  selection: BuilderSelection;
  onSelect: (s: BuilderSelection) => void;
  readOnly: boolean;
}): JSX.Element;
```

Behaviour:
- Top item "Course details" (selected state = orange left marker + `bg-muted`; this is the one other sanctioned orange use).
- Module header: title, editable in place (click → input; Enter/blur saves via `renameModule`; Escape cancels), `⋯` menu with "Add a summary"/"Edit summary" (small textarea, saves `renameModule({ summary })`), "Move module up"/"Move module down" (`reorderModules`), "Delete module" (disabled with tooltip `errorModuleNotEmpty` when it has lessons; confirm when empty).
- Lesson row: drag handle (`GripVertical`, `aria-label`), lesson number in Mono (reading order across the whole course — `readingOrder(groups).indexOf(id) + 1`, never the per-module `order`), title, indicators (quiz icon when it has questions; a muted "Empty" tag when `!lessonHasContent`), `⋯` menu: Move up, Move down (`moveByStep`), "Move to module ▸" submenu (moduled courses only; `applyLessonMove` to the end of that module), Delete (confirm dialog → `deleteLesson`; if the deleted lesson is selected, select the next lesson in reading order, else details).
- `AddLessonRow` at the end of each group (and of the flat list): an input with placeholder "Add a lesson…"; Enter → `addLesson({ courseId, title, moduleId })` → select the new lesson? **No** — stay in the outline, clear the input, keep focus so the author can type the next title; the new row appears. Escape clears.
- "+ Add module" button at the bottom: moduled course → `addModule({ title: `${t("moduleLabel")} ${n}` })` with the new header immediately in rename mode. Flat course with lessons → button reads "Group lessons into modules" and uses the existing wrap behaviour of `addModule`. Also a "Remove modules" item in a footer `⋯` menu using the existing `dissolveModules` + confirm.
- Drag and drop: `DndContext` with `PointerSensor` (activation distance 6px) and `KeyboardSensor` (`sortableKeyboardCoordinates`), one `SortableContext` per group (`id` = `group:<moduleId|flat>`), `closestCorners` collision, `DragOverlay` showing the row. Empty modules render a droppable placeholder so they accept drops. On drag end compute `applyLessonMove`; if non-null: set local `groups` state optimistically, call `reorderLessons({ courseId, ...move })`; on error revert to the previous groups, `toast.error(t(builderErrorKey(err.message)))`, and `invalidate` the `get` query. Announcements: pass `accessibility.announcements` built from lesson titles and translated strings (dnd-kit `Announcements`).
- Local `groups` state resyncs from props whenever the server data changes and no drag/mutation is in progress.
- `readOnly`: no handles, no menus, no add rows.
- Below `lg`: the outline renders inside the Sheet (Task 6). Hide drag handles below `lg` (`hidden lg:flex`); the `⋯` menu is the reorder path.

- [ ] **Step 1: Install dnd-kit**

Run (for bun): `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` — Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing component test**

Mock tRPC like `event-form-dialog.test.tsx` does, but with spies. Wrap in `NextIntlClientProvider` with `messages/en.json` (grep an existing component test that renders translated text for the pattern: `grep -rln "NextIntlClientProvider" src/**/*.test.tsx`).

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const reorder = vi.fn();
const addLesson = vi.fn();
const deleteLesson = vi.fn();
const confirmMock = vi.fn();
const mutation = (fn: ReturnType<typeof vi.fn>) => () => ({ mutate: fn, mutateAsync: fn, isPending: false });
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ classrooms: { get: { invalidate: vi.fn(), setData: vi.fn() } } }),
    classrooms: {
      reorderLessons: { useMutation: mutation(reorder) },
      addLesson: { useMutation: mutation(addLesson) },
      deleteLesson: { useMutation: mutation(deleteLesson) },
      addModule: { useMutation: mutation(vi.fn()) },
      renameModule: { useMutation: mutation(vi.fn()) },
      reorderModules: { useMutation: mutation(vi.fn()) },
      deleteModule: { useMutation: mutation(vi.fn()) },
      dissolveModules: { useMutation: mutation(vi.fn()) },
    },
  },
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => confirmMock }));

import { CourseOutline } from "./course-outline";
// + render helper wrapping NextIntlClientProvider with en messages

const modules = [{ id: 10, title: "Basics", order: 0 }, { id: 20, title: "Advanced", order: 1 }];
const lessons = [
  { id: 1, title: "Welcome", module: 10, order: 0, body: { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "hi" }] }] } } },
  { id: 2, title: "Setup", module: 10, order: 1 },
  { id: 3, title: "Deploy", module: 20, order: 0 },
];

describe("CourseOutline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("numbers lessons in reading order across modules", () => {
    renderOutline({ lessons, modules });
    expect(screen.getByRole("button", { name: /3.*Deploy/ })).toBeInTheDocument();
  });

  it("marks lessons with no content as empty", () => {
    renderOutline({ lessons, modules });
    const row = screen.getByTestId("outline-lesson-2");
    expect(within(row).getByText("Empty")).toBeInTheDocument();
    expect(within(screen.getByTestId("outline-lesson-1")).queryByText("Empty")).toBeNull();
  });

  it("'Move down' on the last lesson of a module sends it to the top of the next module", async () => {
    renderOutline({ lessons, modules });
    await openRowMenu(2);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(reorder).toHaveBeenCalledWith(
      { courseId: 99, moduleId: 20, orderedIds: [2, 3] },
      expect.anything(),
    );
  });

  it("asks before deleting a lesson and does nothing when cancelled", async () => {
    confirmMock.mockResolvedValueOnce(false);
    renderOutline({ lessons, modules });
    await openRowMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete lesson" }));
    await vi.waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(deleteLesson).not.toHaveBeenCalled();
  });

  it("adds a lesson to that module on Enter and keeps the input focused and empty", () => {
    renderOutline({ lessons, modules });
    const input = screen.getAllByPlaceholderText("Add a lesson…")[1]!;
    input.focus();
    fireEvent.change(input, { target: { value: "Monitoring" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(addLesson).toHaveBeenCalledWith({ courseId: 99, title: "Monitoring", moduleId: 20 }, expect.anything());
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("shows no handles, menus or add rows when read-only", () => {
    renderOutline({ lessons, modules, readOnly: true });
    expect(screen.queryByPlaceholderText("Add a lesson…")).toBeNull();
    expect(screen.queryByRole("button", { name: /lesson actions/i })).toBeNull();
  });
});
```

Define `renderOutline({ lessons, modules, readOnly = false })` (renders `CourseOutline` with `courseId: 99`, `selection: { kind: "details" }`, `onSelect: vi.fn()`) and `openRowMenu(id)` (clicks the row's `⋯` trigger, labelled "Lesson actions", inside `getByTestId(`outline-lesson-${id}`)`; Radix menus open on `pointerDown` — use `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })` then `fireEvent.click` as other menu tests in the repo do; grep `DropdownMenu` in `*.test.tsx` for the working pattern). Adjust the mutation-call assertions to whatever second argument (per-call `onError`/`onSuccess` options) you pass.

Run: `npx vitest run src/components/classroom/builder/course-outline.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement the outline components per the behaviour list above**

Add messages (en + nl) to `classroomBuilder`: `addLessonPlaceholder` ("Add a lesson…"), `lessonActions` ("Lesson actions"), `moduleActions` ("Module actions"), `moveUp`, `moveDown`, `moveToModule` ("Move to module"), `deleteLesson` ("Delete lesson"), `deleteLessonConfirm` ("Delete “{title}”? Its content and every learner's progress on it will be removed. This can't be undone."), `deleteModule`, `deleteModuleConfirm`, `moveModuleUp`, `moveModuleDown`, `addModuleSummary`, `editModuleSummary`, `addModule` ("Add module"), `groupIntoModules` ("Group lessons into modules"), `removeModules` ("Remove modules"), `removeModulesConfirm`, `moduleLabel` ("Module"), `emptyLesson` ("Empty"), `hasQuiz` ("Has a quiz"), `dragHandle` ("Drag to reorder {title}"), `emptyCourseHint` ("Start with your first lesson. Type a title and press Enter."), `emptyModuleDrop` ("Drop a lesson here"), and dnd-kit announcement strings (`dragStart` "Picked up {title}.", `dragOver` "{title} is over {target}.", `dragEnd` "{title} dropped in {target}.", `dragCancel` "Moving {title} was cancelled.").

Keep each file to one responsibility: `course-outline.tsx` = DnD context, local groups state, mutations; `outline-module-header.tsx` = module title/summary/menu; `outline-lesson-row.tsx` = sortable row + its menu; `add-lesson-row.tsx` = the input.

- [ ] **Step 4: Wire it into `CourseBuilder`** (replace the Task 6 list; pass selection handlers).

- [ ] **Step 5: Verify**

Run: `npx vitest run src/components/classroom` — Expected: PASS. `npx tsc --noEmit -p .` — clean. `npx eslint src/components/classroom` — clean.

- [ ] **Step 6: Commit**

```bash
git add package.json <lockfile> src/components/classroom/builder/course-outline.tsx src/components/classroom/builder/outline-lesson-row.tsx src/components/classroom/builder/outline-module-header.tsx src/components/classroom/builder/add-lesson-row.tsx src/components/classroom/builder/course-outline.test.tsx src/components/classroom/builder/course-builder.tsx messages/en.json messages/nl.json
git commit -m "Classroom builder: course outline with drag and drop, quick lesson entry, and safe delete"
```

---

### Task 8: Publish dialog, move back to draft, archived read-only

**Files:**
- Create: `src/components/classroom/builder/publish-dialog.tsx`, `publish-dialog.test.tsx`
- Modify: `src/components/classroom/builder/course-builder.tsx`, `builder-top-bar.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Consumes: `publishChecks`, `canPublish`, `CheckResult` (Task 4); `fireConfetti` from `@/components/classroom/celebrate`; `classrooms.update` (Task 1).
- Produces:
```ts
export function PublishDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void;
  input: ChecklistInput; lessonTitles: Map<number, string>; moduleTitles: Map<number, string>;
  onGoToLesson: (lessonId: number) => void;
  onConfirm: () => Promise<void>;   // performs the publish
  courseHref: string;               // "View course" link after success
}): JSX.Element;
```

Behaviour: lists every check with a pass/fail icon and plain copy; failing blocking checks list the lessons/modules by title as buttons that close the dialog and select that lesson (`onGoToLesson`). The Publish button is disabled while any block fails. The cover warning shows but never blocks. On confirm: await `onConfirm` (the builder flushes pending autosaves first, then `update({ status: "published" })`), then show a success state ("Your course is live") with `fireConfetti()` (it already respects reduced motion — verify in `celebrate.ts`; if not, gate it on `matchMedia("(prefers-reduced-motion: reduce)")`) and a "View course" link. Errors → `toast.error(t(builderErrorKey(...)))`, dialog stays open.

"Move back to draft" (top bar menu): confirm dialog ("Learners who already joined keep their progress, but new people can't find it until you publish again.") → `update({ status: "draft" })`.

Archived: top bar shows the Archived badge, no publish control; `readOnly` everywhere (Task 6 already passes it).

- [ ] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/classroom/celebrate", () => ({ fireConfetti: vi.fn() }));
import { fireConfetti } from "@/components/classroom/celebrate";
import { PublishDialog } from "./publish-dialog";
// + NextIntlClientProvider helper with en messages

const text = (s: string) => ({ root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: s }] }] } });
const base = {
  title: "Course", coverImageUrl: null,
  lessons: [{ id: 1, title: "Intro", module: null, body: text("hi") }, { id: 2, title: "Blank", module: null }],
  modules: [],
};

describe("PublishDialog", () => {
  it("blocks publishing while a lesson is empty and links to it", () => {
    const onGoToLesson = vi.fn();
    renderDialog({ input: base, onGoToLesson });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Blank" }));
    expect(onGoToLesson).toHaveBeenCalledWith(2);
  });

  it("allows publishing with only the cover warning, then celebrates", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderDialog({ input: { ...base, lessons: [base.lessons[0]!] }, onConfirm });
    expect(screen.getByText(/cover/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Your course is live");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(fireConfetti).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "View course" })).toHaveAttribute("href", expect.stringContaining("/classroom/"));
  });

  it("stays open and does not celebrate when publishing fails", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("COURSE_ARCHIVED"));
    renderDialog({ input: { ...base, lessons: [base.lessons[0]!] }, onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(screen.queryByText("Your course is live")).toBeNull();
  });
});
```

(`renderDialog` supplies defaults: `open: true`, `onOpenChange: vi.fn()`, title maps built from `input`, `courseHref: "/en/communities/x/classroom/c"`. Mock `sonner`'s `toast` if it errors in jsdom.)

Run: `npx vitest run src/components/classroom/builder/publish-dialog.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement, add messages** (`publishTitle` "Ready to publish?", `publishLead`, one label per `CheckId` — e.g. `check_title` "The course has a title", `check_hasLessons` "It has at least one lesson", `check_noEmptyLessons` "Every lesson has something in it", `check_quizAnswers` "Every quiz question has a correct answer", `check_noEmptyModules` "No module is empty", `check_cover` "It has a cover image (optional, but courses with one get opened more)" — **do not** keep that parenthetical claim unless you can point to data; use "(optional)" instead — `publishSuccess` "Your course is live", `viewCourse` "View course", `moveToDraftConfirm`, `publishing` "Publishing…"; en + nl).

- [ ] **Step 3: Wire into `CourseBuilder`/`BuilderTopBar`** — Publish opens the dialog; the builder's `onConfirm` awaits every registered pane's `flush()` (collect them from `onStatusChange` reports), then `update.mutateAsync({ courseId, status: "published", expectedUpdatedAt })`, then invalidates `get`.

- [ ] **Step 4: Archived UI test** — add to `publish-dialog.test.tsx` or a small `builder-top-bar.test.tsx`: rendering `BuilderTopBar` with `status: "archived"` shows "Archived" and no "Publish" button.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/components/classroom src/lib/classroom` — PASS. `npx tsc --noEmit -p .` — clean.

```bash
git add src/components/classroom/builder/publish-dialog.tsx src/components/classroom/builder/publish-dialog.test.tsx src/components/classroom/builder/course-builder.tsx src/components/classroom/builder/builder-top-bar.tsx messages/en.json messages/nl.json
git commit -m "Classroom builder: publishing goes through a checklist and celebrates; courses can move back to draft"
```

---

### Task 9: Quiz editor labels and ids

**Files:**
- Modify: `src/components/classroom/exam-editor.tsx`
- Create: `src/components/classroom/exam-editor.test.tsx`

`exam-editor.tsx` is not touched by the embeds branch.

**Interfaces:**
- Produces: unchanged `ExamEditor({ value, onChange, disabled })` props, plus every control labelled and ids from `useId()`.

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExamEditor } from "./exam-editor";
// + NextIntlClientProvider helper

const value = {
  mandatory: false, passThreshold: 70, maxAttempts: 0,
  questions: [
    { id: "a", prompt: "Q1", type: "single" as const, options: ["x", "y"], correctIndex: 0 },
    { id: "b", prompt: "Q2", type: "single" as const, options: ["z", "w"], correctIndex: 1 },
  ],
};

describe("ExamEditor", () => {
  it("gives two editors on one page distinct checkbox ids", () => {
    render(wrap(<><ExamEditor value={value} onChange={() => {}} /><ExamEditor value={value} onChange={() => {}} /></>));
    const boxes = screen.getAllByRole("checkbox");
    expect(new Set(boxes.map((b) => b.id)).size).toBe(boxes.length);
  });
  it("labels every input and names each correct-answer choice by question and option", () => {
    render(wrap(<ExamEditor value={value} onChange={() => {}} />));
    for (const input of screen.getAllByRole("textbox")) expect(input).toHaveAccessibleName();
    for (const input of screen.getAllByRole("spinbutton")) expect(input).toHaveAccessibleName();
    const radios = screen.getAllByRole("radio");
    expect(new Set(radios.map((r) => r.getAttribute("aria-label"))).size).toBe(radios.length);
  });
});
```

Run: `npx vitest run src/components/classroom/exam-editor.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement** — `const uid = useId()`; `id={`${uid}-mandatory`}`; link each `Label` to its input with `htmlFor`/`id`; question prompt inputs get `aria-label={t("examQuestionPrompt") + " " + (i + 1)}`; option inputs `aria-label` "Question {n}, option {m}"; correct-answer radios `aria-label` "Question {n}: option {m} is correct" (new `classroom` keys are *not* allowed — put them in `classroomBuilder`, en + nl). Make the correct-answer radios a real `radiogroup` per question.

- [ ] **Step 3: Verify and commit**

```bash
git add src/components/classroom/exam-editor.tsx src/components/classroom/exam-editor.test.tsx messages/en.json messages/nl.json
git commit -m "Classroom quiz editor: every field labelled, unique ids when several editors share a page"
```

---

## Phase B — after `feat/classroom-lesson-embeds` is on main

**Gate:** `git fetch origin && git log origin/main --oneline | grep -i -E "embed|lesson materials"`. If the embeds work is not on `origin/main`, STOP and report. Otherwise: commit or confirm a clean tree, `git rebase origin/main`, resolve conflicts (expect `classrooms.ts` `addLesson`, `messages/*.json`, `course-view.tsx`), run `npx tsc --noEmit -p .` and `npx vitest run`, commit the resolution as part of the rebase. Then read what embeds added: `src/components/classroom/materials/embed-node.tsx` (`classroomEditorExtensions`), `src/lib/classroom/lesson-body.ts` (`stripEmptyEmbeds`), and the `INVALID_EMBED` handling in `lesson-editor.tsx` — the lesson pane must reuse them, not re-implement them.

### Task 10: Lesson save conflicts on the server

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (`updateLesson`)
- Test: `src/server/api/routers/classroom-builder.integration.test.ts`

**Interfaces:**
- Produces: `updateLesson` input gains `expectedUpdatedAt?: string`; returns `{ ok: true; updatedAt: string }`; stale → `CONFLICT "LESSON_CHANGED"`. Also: any lesson mutation on an archived course → `FORBIDDEN "COURSE_ARCHIVED"` (`updateLesson`, `addLesson`, `deleteLesson`, `reorderLessons`) — the UI is read-only, and the server must agree.

- [ ] **Step 1: Failing tests** (new nested `describe("lesson saves")`)

```ts
  describe("lesson saves", () => {
    it("returns updatedAt and refuses a stale lesson save", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id } = await api.addLesson({ courseId, title: "L" });
      const before = await m.payload.findByID({ collection: "lessons", id, depth: 0 });
      const saved = await api.updateLesson({ lessonId: id, title: "L2", expectedUpdatedAt: before.updatedAt });
      expect(saved.updatedAt).not.toBe(before.updatedAt);
      await expect(api.updateLesson({ lessonId: id, title: "L3", expectedUpdatedAt: before.updatedAt }))
        .rejects.toMatchObject({ code: "CONFLICT", message: "LESSON_CHANGED" });
    });

    it("refuses lesson changes on an archived course", async () => {
      const { id: courseId } = await createViaApi();
      const api = callerAs(fx.authorId).classrooms;
      const { id } = await api.addLesson({ courseId, title: "L" });
      await m.payload.update({ collection: "courses", id: courseId, data: { status: "archived" } });
      await expect(api.updateLesson({ lessonId: id, title: "x" })).rejects.toMatchObject({ message: "COURSE_ARCHIVED" });
      await expect(api.addLesson({ courseId, title: "y" })).rejects.toMatchObject({ message: "COURSE_ARCHIVED" });
      await expect(api.deleteLesson({ lessonId: id })).rejects.toMatchObject({ message: "COURSE_ARCHIVED" });
      await expect(api.reorderLessons({ courseId, moduleId: null, orderedIds: [id] })).rejects.toMatchObject({ message: "COURSE_ARCHIVED" });
    });
  });
```

Run with the DB env (Task 1 command) and `-t "lesson saves"` — Expected: FAIL.

- [ ] **Step 2: Implement** — add a helper next to `relationId`:

```ts
/** Authors may not change an archived course's content; a moderator archived it. */
function assertCourseEditable(course: { status?: string | null }): void {
  if (course.status === "archived") {
    throw new TRPCError({ code: "FORBIDDEN", message: "COURSE_ARCHIVED" });
  }
}
```

Call it right after the author check in `updateLesson`, `addLesson`, `deleteLesson`, `reorderLessons`. In `updateLesson` add `expectedUpdatedAt: z.string().optional()`, compare against `lesson.updatedAt` exactly as `update` does for the course (message `LESSON_CHANGED`), capture `const updated = await payload.update(...)` and return `{ ok: true as const, updatedAt: updated.updatedAt }`.

- [ ] **Step 3: Run the whole integration file** — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/classrooms.ts src/server/api/routers/classroom-builder.integration.test.ts
git commit -m "Classroom: stale lesson saves are refused and archived courses can't be changed"
```

### Task 11: Lesson pane and lesson settings pane

**Files:**
- Create: `src/components/classroom/builder/lesson-pane.tsx`, `lesson-settings-pane.tsx`, `resources-editor.tsx`
- Create: `src/components/classroom/builder/lesson-pane.test.tsx`
- Modify: `src/components/classroom/builder/course-builder.tsx`, `src/components/classroom/exam-editor.tsx` (only if "Add a quiz" needs a prop), `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Consumes: `useAutosave` (Task 5), `updateLesson` with `expectedUpdatedAt` (Task 10), `RichTextEditor` with `extensions={classroomEditorExtensions}` and `stripEmptyEmbeds` (embeds branch), `ExamEditor`/`ExamDraft` (Task 9), `useConfirm`, `deleteLesson`.
- Produces:
```ts
export type LessonDraft = { title: string; body: unknown; resources: { label: string; url: string }[]; exam: ExamDraft };
export function LessonPane(props: { lesson: LessonLike; readOnly: boolean; onStatusChange: (s: PaneSaveState) => void; draft: LessonDraft; setDraft: (d: LessonDraft) => void }): JSX.Element;
export function LessonSettingsPane(props: { lessonId: number; draft: LessonDraft; setDraft: (d: LessonDraft) => void; readOnly: boolean; onDeleted: () => void }): JSX.Element;
```
`PaneSaveState = { status: AutosaveStatus; savedAt: Date | null; retry: () => Promise<void>; flush: () => Promise<void> }` — defined once in `course-builder.tsx` and reused by `CourseDetailsPane` (update Task 6's prop type to it).

Design: `CourseBuilder` renders a `LessonEditorScope` keyed by `lessonId` (`key={lessonId}`) that owns the `LessonDraft` state and one `useAutosave` for the whole lesson, and renders `LessonPane` in the middle column and `LessonSettingsPane` in the right column. Keying by id means switching lessons unmounts the scope → the hook's unmount flush saves the old lesson with *its own* id (Review Focus 1). Before changing selection, `CourseBuilder` also awaits the active scope's `flush()` so the save completes before the next lesson's data is read.

- `LessonPane`: large title input (the page's h1-sized field, labelled), rich text at `max-w-[70ch]`, the embeds toolbar comes with `classroomEditorExtensions`. Save payload: `{ lessonId, title: title.trim(), body: stripEmptyEmbeds(body), resources: resources.filter(r => r.label.trim() && r.url.trim()), examMandatory, examPassThreshold, examMaxAttempts, examQuestions, expectedUpdatedAt }`. Do not save while the title is blank; show an inline hint.
- `LessonSettingsPane`: `<SectionLabel>` groups: `/ RESOURCES` (the resources row editor moved from `lesson-editor.tsx`, labelled with `useId`), `/ QUIZ` (when no questions and not mandatory: a single "Add a quiz" button that adds the first blank question; otherwise `ExamEditor`), completion rules live inside the quiz group (mandatory, pass mark, attempts — shown only when a quiz exists), and a destructive "Delete lesson" button at the bottom (same confirm copy as the outline; `onDeleted` selects the next lesson).
- `readOnly`: fields `disabled`, rich text read-only (check `RichTextEditor` for an `editable`/`readOnly` prop; if it has none, render the body with the learner renderer instead of adding one).

- [ ] **Step 1: Failing tests** (`lesson-pane.test.tsx`; mock tRPC with a `updateLesson` spy returning `{ ok: true, updatedAt: "2026-01-01T00:00:01.000Z" }`; mock `RichTextEditor` to a `<textarea>` that calls `onChange` with `{ root: … }` so the test does not need Lexical; fake timers)

```tsx
it("saves the lesson you were editing when you switch to another lesson", async () => {
  const { rerenderWithLesson } = renderScope({ lessonId: 1, title: "One" });
  fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "One edited" } });
  await rerenderWithLesson({ lessonId: 2, title: "Two" }); // simulates selection change (key changes)
  expect(updateLesson).toHaveBeenCalledWith(expect.objectContaining({ lessonId: 1, title: "One edited" }), expect.anything());
  expect(updateLesson).not.toHaveBeenCalledWith(expect.objectContaining({ lessonId: 2 }), expect.anything());
});

it("sends expectedUpdatedAt and then chains the returned one", async () => {
  renderScope({ lessonId: 1, title: "One", updatedAt: "2026-01-01T00:00:00.000Z" });
  fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "A" } });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "AB" } });
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(updateLesson.mock.calls[0]![0].expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
  expect(updateLesson.mock.calls[1]![0].expectedUpdatedAt).toBe("2026-01-01T00:00:01.000Z");
});

it("does not save a blank title", async () => {
  renderScope({ lessonId: 1, title: "One" });
  fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "  " } });
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(updateLesson).not.toHaveBeenCalled();
});

it("hides the quiz behind 'Add a quiz' until it is used", () => {
  renderScope({ lessonId: 1, title: "One" });
  expect(screen.queryByText(/pass mark/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add a quiz" }));
  expect(screen.getByLabelText(/Question 1/)).toBeInTheDocument();
});

it("is read-only for an archived course", () => {
  renderScope({ lessonId: 1, title: "One", readOnly: true });
  expect(screen.getByLabelText("Lesson title")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Delete lesson" })).toBeNull();
});
```

`renderScope` renders the exported `LessonEditorScope` (from `course-builder.tsx`, or its own file `lesson-editor-scope.tsx` if cleaner) inside the intl provider with a lesson fixture; `rerenderWithLesson` rerenders with a different `key`/lesson inside `act`.

Run: `npx vitest run src/components/classroom/builder/lesson-pane.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement** (messages: `lessonTitleLabel` "Lesson title", `lessonTitleRequired`, `resourcesSection` "RESOURCES", `quizSection` "QUIZ", `addQuiz` "Add a quiz", `addResource`, `resourceLabel`, `resourceUrl`, `removeResource`, `lessonSettings` "Lesson settings", `collapseSettings`, `expandSettings`; en + nl). Remove the Task 6 placeholder lesson state from `CourseBuilder`. Make the right pane collapsible on desktop (a toggle in its header; remember per-viewer in `localStorage` wrapped in try/catch).

- [ ] **Step 3: Verify** — `npx vitest run src/components/classroom` PASS; `npx tsc --noEmit -p .` clean; eslint clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/classroom/builder/lesson-pane.tsx src/components/classroom/builder/lesson-settings-pane.tsx src/components/classroom/builder/resources-editor.tsx src/components/classroom/builder/lesson-pane.test.tsx src/components/classroom/builder/course-builder.tsx src/components/classroom/builder/course-details-pane.tsx messages/en.json messages/nl.json
git commit -m "Classroom builder: edit one lesson at a time with autosave; resources and quiz in a side panel"
```

### Task 12: Remove the old editor and verify end to end

**Files:**
- Delete: `src/components/classroom/course-editor.tsx`, `src/components/classroom/lesson-editor.tsx` (and their tests, if any)
- Modify: `messages/en.json`, `messages/nl.json` — remove `classroom.*` keys that are now unused

- [ ] **Step 1: Prove nothing imports them**

Run: `grep -rn "course-editor\|lesson-editor\|LessonEditor\|CourseEditor" src` — Expected: only the files themselves (and embeds-era tests that target `lesson-editor.tsx` — e.g. `materials/embed-insert.test.tsx`; if such a test exercises the old editor, port its assertion to `lesson-pane.test.tsx` so the behaviour — Embed toolbar inserts a block that is saved, empty embeds are stripped — stays covered, then delete it).

- [ ] **Step 2: Delete and prune messages**

`git rm src/components/classroom/course-editor.tsx src/components/classroom/lesson-editor.tsx`. For each `classroom.*` key the old editors used (`organiseIntoModules`, `dissolveModules`, `dissolveModulesConfirm`, `moveModuleUp`, `assignModule`, `editCourse`, `status`, `courseSaved`, `lessonSaved`, …) run `grep -rn "\"<key>\"\|t(\"<key>\")\|'<key>'" src` and remove it from both locale files only when nothing else uses it.

- [ ] **Step 3: Full verification**

Run, in this order, and report each result verbatim:
- `npx tsc --noEmit -p .` — clean
- `npx eslint src` — clean
- `npx vitest run` — full suite PASS
- `RUN_DB_TESTS=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test npx vitest run src/server/api/routers` — PASS (or report that the local test DB was unreachable)
- `node /Users/greg/.claude/skills/impeccable/scripts/detect.mjs --json src/components/classroom` — no findings (or explain each)
- `npm run build` (or the repo's build script) — succeeds

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json <ported test files>
git commit -m "Classroom: remove the old stacked course and lesson editors"
```

`git status --short` must be empty before any push.

---

## Self-review notes

- Brief coverage: layout/workspace (T6), outline + DnD + quick add + menus (T7), details pane + cover crop (T6), lesson pane + settings + Add a quiz (T11), autosave + status + unload guard + conflicts (T1, T5, T10, T11), delete confirm (T7, T11), publish checklist + celebration + back to draft (T4, T8), archived read-only (T1, T6, T8, T10), author gate (T6), draft default (T1, T6), mobile sheet + menu reorder (T6, T7), a11y labels/ids (T7, T9, T11), en + nl (every UI task), embeds toolbar reuse (T11).
- Known intra-branch interim state: between T6 and T11 a selected lesson shows a placeholder in the middle pane. It is never pushed as a PR state; Phase B removes it before the PR opens.
- Out of scope, confirmed with the product owner: paste-many-lessons, AI outline, duplicate lesson, templates, co-editing.
