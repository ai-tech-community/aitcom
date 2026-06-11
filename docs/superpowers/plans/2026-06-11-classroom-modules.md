# Classroom Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, behaviour-free **module** grouping level between a classroom course and its lessons, so large courses can be organised into named sections without changing the completion model.

**Architecture:** A new first-class `modules` Payload collection (`course`, `title`, `order`, `summary`) plus a nullable `module` FK on `lessons`. A course is *derived* moduled (≥1 module) or flat (0 modules), never mixed: creating the first module auto-wraps all existing lessons into it; assignment only moves a lesson *between* modules; module deletion is empty-only; an explicit atomic `dissolve` is the only path back to flat. Reading order becomes the tuple `(module.order, lesson.order)`; course progress/pass stay set-based on `course_id` and are untouched. Authoring lives on the course edit page; the learner view renders lessons grouped by module with a read-time "n/m done" rollup.

**Tech Stack:** Next.js (App Router) + tRPC, Payload CMS collections (Postgres), Drizzle (read-only here — completion tables already exist), hand-written Payload migrations applied via `pnpm db:apply`, Vitest for pure logic.

**Design references:** [ADR-0034](../../adr/0034-module-is-an-optional-behaviour-free-grouping.md), [ADR-0027](../../adr/0027-classroom-is-member-authored-ordered-curriculum.md), [ADR-0028](../../adr/0028-lesson-exam-gates-completion-not-reputation.md), and the **Module** entry in [CONTEXT.md](../../../CONTEXT.md).

---

## File Structure

- **Create** `src/migrations/20260611a_classroom_modules.ts` — `modules` table + `lessons.module` nullable column + indexes. Idempotent DDL.
- **Modify** `src/migrations/index.ts` — register the new migration.
- **Create** `src/collections/Modules.ts` — Payload collection config for `modules`.
- **Modify** `src/payload.config.ts` — import + register `Modules`.
- **Modify** `src/collections/Lessons.ts` — add the `module` number field.
- **Regenerate** `payload-types.ts` via `pnpm payload generate:types` (per the "Payload types regen on field change" rule).
- **Modify** `src/lib/classroom.ts` — pure helpers `orderLessonsForReading`, `groupLessonsByModule`, `classroomStructureValid`.
- **Modify** `src/lib/classroom.test.ts` — tests for the three helpers.
- **Modify** `src/server/api/routers/classrooms.ts` — procedures `addModule`, `renameModule`, `reorderModules`, `assignLessonToModule`, `deleteModule`, `dissolveModules`; and extend `get` to return `modules`.
- **Modify** `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/page.tsx` — render lessons grouped by module with rollup.
- **Modify** `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx` — module authoring UI.

> **Worktree note:** Do **not** run `git checkout`/`git switch` — subagents share the working tree (per project rule). Work on the current branch.

---

## Task 1: Pure helpers for reading order, grouping, and the structure invariant

These are the testable core. They are display/ordering only — they never touch completion counts.

**Files:**
- Modify: `src/lib/classroom.ts` (append after `youtubeEmbedUrl`, end of file ~line 89)
- Test: `src/lib/classroom.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/classroom.test.ts`. First add the imports to the existing import block at the top of the file (the `from "@/lib/classroom"` import added in Step 1 of the implementation — add the three names there):

```typescript
import {
  orderLessonsForReading,
  groupLessonsByModule,
  classroomStructureValid,
} from "@/lib/classroom";
```

Then append these `describe` blocks at the end of the file:

```typescript
describe("orderLessonsForReading", () => {
  it("orders a flat course by lesson order alone", () => {
    const lessons = [
      { id: 2, module: null, order: 1 },
      { id: 1, module: null, order: 0 },
    ];
    expect(orderLessonsForReading(lessons, []).map((l) => l.id)).toEqual([
      1, 2,
    ]);
  });

  it("orders a moduled course by (module.order, lesson.order)", () => {
    const lessons = [
      { id: 1, module: 20, order: 0 }, // module B, first
      { id: 2, module: 10, order: 1 }, // module A, second
      { id: 3, module: 10, order: 0 }, // module A, first
    ];
    const modules = [
      { id: 10, title: "A", order: 0 },
      { id: 20, title: "B", order: 1 },
    ];
    expect(orderLessonsForReading(lessons, modules).map((l) => l.id)).toEqual([
      3, 2, 1,
    ]);
  });
});

describe("groupLessonsByModule", () => {
  it("returns a single null-module group for a flat course", () => {
    const lessons = [
      { id: 1, module: null, order: 0 },
      { id: 2, module: null, order: 1 },
    ];
    const groups = groupLessonsByModule(lessons, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.module).toBeNull();
    expect(groups[0]!.lessons.map((l) => l.id)).toEqual([1, 2]);
  });

  it("returns one group per module in module order, lessons ordered within", () => {
    const lessons = [
      { id: 1, module: 20, order: 0 },
      { id: 2, module: 10, order: 1 },
      { id: 3, module: 10, order: 0 },
    ];
    const modules = [
      { id: 10, title: "A", order: 0 },
      { id: 20, title: "B", order: 1 },
    ];
    const groups = groupLessonsByModule(lessons, modules);
    expect(groups.map((g) => g.module?.id)).toEqual([10, 20]);
    expect(groups[0]!.lessons.map((l) => l.id)).toEqual([3, 2]);
    expect(groups[1]!.lessons.map((l) => l.id)).toEqual([1]);
  });

  it("includes an empty module (a module with no lessons yet)", () => {
    const groups = groupLessonsByModule([], [{ id: 10, title: "A", order: 0 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.lessons).toEqual([]);
  });
});

describe("classroomStructureValid", () => {
  it("is valid when all lessons are flat (module null)", () => {
    expect(
      classroomStructureValid([{ module: null }, { module: null }]),
    ).toBe(true);
  });

  it("is valid when every lesson has a module", () => {
    expect(classroomStructureValid([{ module: 10 }, { module: 20 }])).toBe(
      true,
    );
  });

  it("is invalid when some lessons are moduled and some are not", () => {
    expect(classroomStructureValid([{ module: 10 }, { module: null }])).toBe(
      false,
    );
  });

  it("is valid for an empty course", () => {
    expect(classroomStructureValid([])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/classroom.test.ts`
Expected: FAIL — `orderLessonsForReading is not a function` (and the other two undefined).

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/classroom.ts`:

```typescript
/** A module's identity + ordering for grouping/reading-order purposes. */
export type ModuleRef = {
  id: number;
  title: string;
  order: number;
  summary?: string | null;
};

/** Minimal lesson shape these helpers need: which module (or none) and intra-order. */
type OrderableLesson = { module: number | null; order: number };

/**
 * Reading order = the tuple (module.order, lesson.order). A flat course (all
 * lessons module=null) sorts by lesson.order alone. Display/ordering only —
 * never affects completion counts.
 */
export function orderLessonsForReading<T extends OrderableLesson>(
  lessons: T[],
  modules: ModuleRef[],
): T[] {
  const moduleOrder = new Map(modules.map((m) => [m.id, m.order]));
  return [...lessons].sort((a, b) => {
    const am = a.module === null ? -1 : (moduleOrder.get(a.module) ?? 0);
    const bm = b.module === null ? -1 : (moduleOrder.get(b.module) ?? 0);
    if (am !== bm) return am - bm;
    return a.order - b.order;
  });
}

/**
 * Group lessons for display. A flat course returns a single group with
 * `module: null`. A moduled course returns one group per module, in module
 * order, each holding its lessons in lesson order (empty modules included).
 */
export function groupLessonsByModule<T extends OrderableLesson>(
  lessons: T[],
  modules: ModuleRef[],
): Array<{ module: ModuleRef | null; lessons: T[] }> {
  if (modules.length === 0) {
    return [{ module: null, lessons: orderLessonsForReading(lessons, []) }];
  }
  const sortedModules = [...modules].sort((a, b) => a.order - b.order);
  return sortedModules.map((m) => ({
    module: m,
    lessons: lessons
      .filter((l) => l.module === m.id)
      .sort((a, b) => a.order - b.order),
  }));
}

/**
 * The flat-or-fully-moduled invariant: a course is valid only if it has no
 * moduled lessons (flat) or every lesson is moduled. A mix is forbidden.
 */
export function classroomStructureValid(
  lessons: { module: number | null }[],
): boolean {
  if (lessons.length === 0) return true;
  const moduled = lessons.filter((l) => l.module !== null).length;
  return moduled === 0 || moduled === lessons.length;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/classroom.test.ts`
Expected: PASS — all existing tests plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classroom.ts src/lib/classroom.test.ts
git commit -m "feat(classroom): module reading-order + grouping + structure-invariant helpers"
```

---

## Task 2: Migration — `modules` table + `lessons.module` column

**Files:**
- Create: `src/migrations/20260611a_classroom_modules.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

Create `src/migrations/20260611a_classroom_modules.ts`:

```typescript
// Classroom modules (ADR-0034): an optional, behaviour-free grouping level
// between a course and its lessons. Adds the Payload "modules" collection table
// and a nullable "module" FK column on "lessons" (existing lessons stay null =
// flat, so this is a non-breaking add). Idempotent (IF [NOT] EXISTS) so payload
// migrate reconciles it as a safe no-op against an already-migrated DB.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "modules" (
      "id" serial PRIMARY KEY,
      "course" numeric NOT NULL,
      "title" varchar NOT NULL,
      "order" numeric DEFAULT 0,
      "summary" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "modules_course_idx" ON "modules"("course")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "modules_order_idx" ON "modules"("order")`,
    ),
  );

  // Nullable FK on lessons → modules.id. Null = flat (ungrouped).
  await db.execute(
    sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "module" numeric`),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lessons_module_idx" ON "lessons"("module")`,
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "module"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "modules"`));
}
```

- [ ] **Step 2: Register the migration**

In `src/migrations/index.ts`, add the import alongside the other `import * as` lines (after the `migration_20260610a_participant_workspace` import):

```typescript
import * as migration_20260611a_classroom_modules from "./20260611a_classroom_modules";
```

Then append a new entry to the **end** of the `migrations` array (keep array order = chronological):

```typescript
  {
    up: migration_20260611a_classroom_modules.up,
    down: migration_20260611a_classroom_modules.down,
    name: "20260611a_classroom_modules",
  },
```

- [ ] **Step 3: Apply the migration (dry-run first, then apply)**

Run: `pnpm db:apply --dry-run`
Expected: lists `20260611a_classroom_modules` as a pending migration.

Run: `pnpm db:apply`
Expected: `applying 20260611a_classroom_modules ...` then completes without error.

- [ ] **Step 4: Verify the schema landed**

Run:
```bash
tsx --env-file=.env -e "import('@neondatabase/serverless').then(async ({Pool,neonConfig})=>{const ws=(await import('ws')).default;neonConfig.webSocketConstructor=ws;const p=new Pool({connectionString:process.env.DATABASE_URL});const r=await p.query(\"select column_name from information_schema.columns where table_name='modules' order by 1\");console.log('modules cols:',r.rows.map(x=>x.column_name).join(','));const l=await p.query(\"select 1 from information_schema.columns where table_name='lessons' and column_name='module'\");console.log('lessons.module exists:',l.rowCount===1);await p.end();})"
```
Expected: `modules cols: course,created_at,id,order,summary,title,updated_at` and `lessons.module exists: true`.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260611a_classroom_modules.ts src/migrations/index.ts
git commit -m "feat(classroom): migration for modules table + lessons.module FK"
```

---

## Task 3: Payload collection `Modules` + register it + add the lesson field

**Files:**
- Create: `src/collections/Modules.ts`
- Modify: `src/payload.config.ts:37-38,102-103`
- Modify: `src/collections/Lessons.ts:38-48`

- [ ] **Step 1: Create the collection config**

Create `src/collections/Modules.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const Modules: CollectionConfig = {
  slug: "modules",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "course", "order"],
    description: "Optional grouping of lessons within a course (ADR-0034).",
  },
  fields: [
    {
      name: "course",
      type: "number",
      required: true,
      index: true,
      admin: { description: "courses.id" },
    },
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "order", type: "number", defaultValue: 0, index: true },
    { name: "summary", type: "text", maxLength: 500 },
  ],
  timestamps: true,
};
```

- [ ] **Step 2: Register the collection**

In `src/payload.config.ts`, add the import next to the other collection imports (after the `Lessons` import on line ~38):

```typescript
import { Modules } from "./collections/Modules";
```

Add `Modules` to the `collections` array, immediately after `Lessons,` (line ~103):

```typescript
    Courses,
    Lessons,
    Modules,
```

- [ ] **Step 3: Add the `module` field to Lessons**

In `src/collections/Lessons.ts`, add the field immediately after the `course` field block (after line ~45, before the `title` field):

```typescript
    {
      name: "module",
      type: "number",
      index: true,
      admin: {
        description: "modules.id (null = flat/ungrouped). See ADR-0034.",
      },
    },
```

- [ ] **Step 4: Regenerate Payload types**

Run: `pnpm payload generate:types`
Expected: regenerates `payload-types.ts`; `git diff payload-types.ts` shows a new `Module` interface and a `module?: number | null` field on the `Lesson` interface.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no consumers reference `module` yet, so the new optional field breaks nothing).

- [ ] **Step 6: Commit**

```bash
git add src/collections/Modules.ts src/collections/Lessons.ts src/payload.config.ts payload-types.ts
git commit -m "feat(classroom): Modules collection + lesson.module field + regen types"
```

---

## Task 4: Router — module CRUD with invariant-preserving mutations

All procedures mirror the existing ownership pattern: load the course, require `course.authorId === ctx.session.user.id`. The structural invariant (flat-or-fully-moduled) is preserved *by construction* — see comments per procedure.

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (add procedures after `deleteLesson`, ~line 602; extend `get`, ~line 202-208 and ~line 302-311)

- [ ] **Step 1: Add the module procedures**

In `src/server/api/routers/classrooms.ts`, insert the following procedures immediately after the `deleteLesson` procedure (after its closing `}),` on line ~602, before `enroll`):

```typescript
  /**
   * Create a module on own course. Creating the FIRST module auto-wraps every
   * existing flat lesson into it, so the course goes flat → fully-moduled in one
   * atomic step (never a mixed state). Later modules start empty.
   */
  addModule: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(1).max(200),
        summary: z.string().max(500).optional(),
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

      const { totalDocs: moduleCount } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 0,
        depth: 0,
      });

      const module = await payload.create({
        collection: "modules",
        data: {
          course: input.courseId,
          title: input.title,
          order: moduleCount,
          summary: input.summary ?? undefined,
        },
      });

      // First module on a flat course: wrap all existing lessons into it,
      // preserving their order. This keeps the course fully-moduled, not mixed.
      if (moduleCount === 0) {
        const { docs: lessons } = await payload.find({
          collection: "lessons",
          where: { course: { equals: input.courseId } },
          limit: 1000,
          depth: 0,
        });
        for (const l of lessons) {
          await payload.update({
            collection: "lessons",
            id: l.id,
            data: { module: module.id },
          });
        }
      }

      return { id: module.id };
    }),

  /** Rename / re-summarise a module on own course. */
  renameModule: protectedProcedure
    .input(
      z.object({
        moduleId: z.number(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const module = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      const course = await payload.findByID({
        collection: "courses",
        id: module.course,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary ?? undefined;

      await payload.update({
        collection: "modules",
        id: input.moduleId,
        data,
      });
      return { ok: true };
    }),

  /** Reorder a course's modules. orderedIds must be exactly that course's modules. */
  reorderModules: protectedProcedure
    .input(z.object({ courseId: z.number(), orderedIds: z.array(z.number()) }))
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
      const validIds = new Set(modules.map((m) => m.id));
      if (
        input.orderedIds.length !== modules.length ||
        !input.orderedIds.every((id) => validIds.has(id))
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MODULE_SET_MISMATCH" });
      }

      for (let i = 0; i < input.orderedIds.length; i++) {
        await payload.update({
          collection: "modules",
          id: input.orderedIds[i]!,
          data: { order: i },
        });
      }
      return { ok: true };
    }),

  /**
   * Move a lesson into a module of the same course. moduleId is never null here
   * — the only way back to flat is dissolveModules — so a moduled course stays
   * fully moduled. The lesson is appended to the end of the target module.
   */
  assignLessonToModule: protectedProcedure
    .input(z.object({ lessonId: z.number(), moduleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const lesson = await payload.findByID({
        collection: "lessons",
        id: input.lessonId,
        depth: 0,
      });
      const course = await payload.findByID({
        collection: "courses",
        id: lesson.course,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const module = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      if (module.course !== lesson.course) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MODULE_COURSE_MISMATCH" });
      }

      const { totalDocs: targetCount } = await payload.find({
        collection: "lessons",
        where: {
          and: [
            { course: { equals: lesson.course } },
            { module: { equals: input.moduleId } },
          ],
        },
        limit: 0,
        depth: 0,
      });

      await payload.update({
        collection: "lessons",
        id: input.lessonId,
        data: { module: input.moduleId, order: targetCount },
      });
      return { ok: true };
    }),

  /** Delete a module — only when empty (move its lessons out first). */
  deleteModule: protectedProcedure
    .input(z.object({ moduleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();

      const module = await payload.findByID({
        collection: "modules",
        id: input.moduleId,
        depth: 0,
      });
      const course = await payload.findByID({
        collection: "courses",
        id: module.course,
        depth: 0,
      });
      if (course.authorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { totalDocs: lessonCount } = await payload.find({
        collection: "lessons",
        where: { module: { equals: input.moduleId } },
        limit: 0,
        depth: 0,
      });
      if (lessonCount > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "MODULE_NOT_EMPTY" });
      }

      await payload.delete({ collection: "modules", id: input.moduleId });
      return { ok: true };
    }),

  /**
   * Revert a course to flat: atomically null every lesson's module and delete
   * all the course's modules. The only sanctioned moduled → flat path.
   */
  dissolveModules: protectedProcedure
    .input(z.object({ courseId: z.number() }))
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

      const { docs: lessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      for (const l of lessons) {
        if (l.module !== null && l.module !== undefined) {
          await payload.update({
            collection: "lessons",
            id: l.id,
            data: { module: null },
          });
        }
      }

      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: input.courseId } },
        limit: 1000,
        depth: 0,
      });
      for (const m of modules) {
        await payload.delete({ collection: "modules", id: m.id });
      }
      return { ok: true };
    }),
```

- [ ] **Step 2: Extend `get` to return modules and order lessons for reading**

In the `get` procedure, the lessons query currently sorts by `"order"` (line ~202-208). Replace that block:

```typescript
      const { docs: lessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: course.id } },
        sort: "order",
        limit: 200,
        depth: 0,
      });
```

with a version that also loads modules and orders lessons for reading:

```typescript
      const { docs: rawLessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: course.id } },
        limit: 200,
        depth: 0,
      });
      const { docs: modules } = await payload.find({
        collection: "modules",
        where: { course: { equals: course.id } },
        sort: "order",
        limit: 1000,
        depth: 0,
      });
      const moduleRefs = modules.map((m) => ({
        id: m.id,
        title: m.title,
        order: m.order ?? 0,
        summary: m.summary ?? null,
      }));
      const lessons = orderLessonsForReading(
        rawLessons.map((l) => ({ ...l, module: l.module ?? null, order: l.order ?? 0 })),
        moduleRefs,
      );
```

Then add `modules: moduleRefs,` to the returned object (after `lessons: safeLessons,` on line ~304):

```typescript
      return {
        course,
        lessons: safeLessons,
        modules: moduleRefs,
        enrolled,
        completedLessonIds,
        lessonExams,
        attempts,
        certificateIssuedAt,
        passedCourse,
      };
```

- [ ] **Step 3: Import the helper**

In the import block from `@/lib/classroom` (top of `classrooms.ts`, ~line 22-31), add `orderLessonsForReading`:

```typescript
import {
  canCreateCourse,
  courseProgressPercent,
  coursePassed,
  stripAnswerKey,
  gradeExam,
  examPassed,
  orderLessonsForReading,
  type CommunityRole,
  type ExamQuestion,
} from "@/lib/classroom";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If the Payload `lessons` type now requires `module`, the `.map` spread already supplies `module: l.module ?? null`.)

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: PASS (no unused-var or type errors in the edited router).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/classrooms.ts
git commit -m "feat(classroom): module CRUD procedures + modules in course get"
```

---

## Task 5: Learner view — render lessons grouped by module with a rollup

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/page.tsx`

> First **read** the file to see how it currently consumes `api.classrooms.get` and renders the lesson list. The change below assumes it maps over `data.lessons`. Adapt the surrounding JSX/styles to match the file's existing conventions (it is a server or client component using the same `api` pattern as `classroom-listing.tsx`).

- [ ] **Step 1: Read the current course page**

Run: `sed -n '1,200p' "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/page.tsx"`
Expected: shows the component that renders the course + its `lessons`.

- [ ] **Step 2: Group lessons by module for rendering**

Where the component currently has `const lessons = data.lessons` (or maps `data.lessons` directly), compute groups using the helper and the `modules` now returned by `get`. Add the import:

```typescript
import { groupLessonsByModule } from "@/lib/classroom";
```

And build groups (place near where `data` is destructured):

```typescript
const groups = groupLessonsByModule(
  data.lessons.map((l) => ({ ...l, module: l.module ?? null, order: l.order ?? 0 })),
  data.modules,
);
const completed = new Set(data.completedLessonIds);
```

- [ ] **Step 3: Render the groups**

Replace the flat lesson list with grouped rendering. A flat course yields exactly one group whose `module` is `null` (render its lessons with no header — visually identical to today). A moduled course renders a header + rollup per module:

```tsx
<div className="space-y-6">
  {groups.map((group) => {
    const groupCompleted = group.lessons.filter((l) =>
      completed.has(l.id),
    ).length;
    return (
      <section key={group.module?.id ?? "flat"} className="space-y-2">
        {group.module ? (
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="font-semibold">{group.module.title}</h2>
              {group.module.summary ? (
                <p className="text-muted-foreground text-sm">
                  {group.module.summary}
                </p>
              ) : null}
            </div>
            <span className="text-muted-foreground font-mono text-xs">
              {groupCompleted}/{group.lessons.length}
            </span>
          </div>
        ) : null}

        <ul className="space-y-1">
          {group.lessons.map((lesson) => (
            // Reuse the EXISTING per-lesson row markup from this file here,
            // keyed by lesson.id, including its complete/exam affordances.
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      </section>
    );
  })}
</div>
```

> Replace `<LessonRow .../>` with this file's existing per-lesson JSX (the same element previously rendered inside the `data.lessons.map(...)`). Do not invent a new row component unless one already exists — lift the existing row markup unchanged.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev` and open a course in the browser.
- A course with no modules renders exactly as before (no headers).
- After Task 6, a moduled course shows section headers with an `n/m` rollup, lessons grouped and in order.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/page.tsx"
git commit -m "feat(classroom): render lessons grouped by module with completion rollup"
```

---

## Task 6: Authoring view — manage modules on the course edit page

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx`

> First **read** the edit page to see how it calls existing mutations (`api.classrooms.addLesson`, `updateLesson`, `deleteLesson`) and how it invalidates/refetches after a mutation. Mirror that exact pattern for the new module mutations.

- [ ] **Step 1: Read the current edit page**

Run: `sed -n '1,250p' "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx"`
Expected: shows the lesson-editing UI and the `api` mutation/invalidation pattern.

- [ ] **Step 2: Wire the module mutations**

Following the file's existing pattern for `addLesson` (including how it gets the tRPC utils and calls `.invalidate()` on success), add hooks for the new procedures:

```typescript
const utils = api.useUtils(); // if the file doesn't already have it
const invalidate = () => utils.classrooms.get.invalidate({ slug: courseSlug });

const addModule = api.classrooms.addModule.useMutation({ onSuccess: invalidate });
const renameModule = api.classrooms.renameModule.useMutation({ onSuccess: invalidate });
const reorderModules = api.classrooms.reorderModules.useMutation({ onSuccess: invalidate });
const assignLesson = api.classrooms.assignLessonToModule.useMutation({ onSuccess: invalidate });
const deleteModule = api.classrooms.deleteModule.useMutation({ onSuccess: invalidate });
const dissolveModules = api.classrooms.dissolveModules.useMutation({ onSuccess: invalidate });
```

- [ ] **Step 3: Add the module-management UI**

Add a "Modules" section above the lesson editor. Behaviour:
- **When the course is flat** (`data.modules.length === 0`): show an "Organise into modules" button → `addModule.mutate({ courseId, title: "Module 1" })`. (Creating the first module auto-wraps existing lessons server-side.)
- **When moduled**: list modules in order, each with: an editable title (→ `renameModule`), a per-module lesson list with a module `<select>` on each lesson (→ `assignLesson.mutate({ lessonId, moduleId })`), an "Add module" button (→ `addModule`), a "Delete module" button shown **only when that module has no lessons** (→ `deleteModule`; surface the `MODULE_NOT_EMPTY` error as "Move its lessons out first"), reorder controls (→ `reorderModules` with the new id order), and a "Dissolve modules (back to flat)" button (→ `dissolveModules`, with a confirm).

```tsx
{data.modules.length === 0 ? (
  <button
    onClick={() => addModule.mutate({ courseId: data.course.id, title: "Module 1" })}
    disabled={addModule.isPending}
  >
    Organise into modules
  </button>
) : (
  <div className="space-y-4">
    {data.modules.map((m, i) => {
      const moduleLessons = data.lessons.filter((l) => (l.module ?? null) === m.id);
      return (
        <div key={m.id} className="rounded border p-3">
          <input
            defaultValue={m.title}
            onBlur={(e) =>
              e.target.value !== m.title &&
              renameModule.mutate({ moduleId: m.id, title: e.target.value })
            }
          />
          <span className="text-muted-foreground ml-2 text-xs">
            {moduleLessons.length} lesson(s)
          </span>
          {i > 0 ? (
            <button
              onClick={() => {
                const ids = data.modules.map((x) => x.id);
                [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                reorderModules.mutate({ courseId: data.course.id, orderedIds: ids });
              }}
            >
              ↑
            </button>
          ) : null}
          {moduleLessons.length === 0 ? (
            <button onClick={() => deleteModule.mutate({ moduleId: m.id })}>
              Delete module
            </button>
          ) : null}
        </div>
      );
    })}
    <button
      onClick={() =>
        addModule.mutate({
          courseId: data.course.id,
          title: `Module ${data.modules.length + 1}`,
        })
      }
    >
      Add module
    </button>
    <button
      onClick={() => {
        if (confirm("Dissolve modules and return to a flat course?"))
          dissolveModules.mutate({ courseId: data.course.id });
      }}
    >
      Dissolve modules (back to flat)
    </button>
  </div>
)}
```

On each lesson row in the existing lesson editor, when the course is moduled, add a module selector:

```tsx
{data.modules.length > 0 ? (
  <select
    value={lesson.module ?? ""}
    onChange={(e) =>
      assignLesson.mutate({ lessonId: lesson.id, moduleId: Number(e.target.value) })
    }
  >
    {data.modules.map((m) => (
      <option key={m.id} value={m.id}>
        {m.title}
      </option>
    ))}
  </select>
) : null}
```

> Match the file's existing styling/components (buttons, inputs from `@/components/ui`). The snippets above are behavioural skeletons — render them with the same component library the file already uses.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Manual end-to-end verification**

Run: `pnpm dev`. As a course author:
1. Open a flat course's edit page → click "Organise into modules" → confirm all existing lessons now sit under "Module 1" (course is fully moduled, not mixed).
2. "Add module" → reassign a lesson into it via the selector → confirm it moves and the rollups update.
3. Try "Delete module" on a non-empty module → button is hidden; empty a module → delete works.
4. "Dissolve modules" → confirm the course returns to flat (no headers) and all lessons survive with their completions intact.
5. Confirm the learner view (Task 5) reflects each state.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx"
git commit -m "feat(classroom): module authoring UI on the course edit page"
```

---

## Task 7: Full verification sweep

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS, including the new `classroom.test.ts` blocks.

- [ ] **Step 2: Typecheck + lint the whole project**

Run: `pnpm check`
Expected: PASS (`next lint && tsc --noEmit`).

- [ ] **Step 3: Confirm progress/pass are genuinely untouched**

Manually verify (or via the dev DB): enrolling and completing lessons in a *moduled* course produces the same `progressPercent`, `passedCourse`, and certificate behaviour as a flat course with the same lessons — because the completion model is keyed on `course_id`, not on modules. No regression in `list` (still `-enrollmentCount` sorted) or `get` progress numbers.

- [ ] **Step 4: Final commit (if any stragglers)**

```bash
git add -A && git commit -m "test(classroom): full verification sweep for modules"
```

---

## Self-Review Notes

- **Spec coverage:** opt-in per course (Task 3/4 — addModule first-module wrap), first-class collection (Task 2/3), behaviour-free / no gating (no completion or gating code added anywhere), derived is-moduled (`data.modules.length` checks; no stored flag), within-module ordering `(module.order, lesson.order)` (Task 1 `orderLessonsForReading`, used in `get`), set-based progress untouched (Task 7 Step 3 verifies), empty-only delete + dissolve (Task 4). All ADR-0034 decisions map to a task.
- **Deferred (not in scope, per the grill):** module-level exams, sequential gating, faceted course filtering — none appear here by design.
- **Type consistency:** `orderLessonsForReading`/`groupLessonsByModule`/`classroomStructureValid` signatures in Task 1 match their call sites in Tasks 4–6; `ModuleRef` (`{id,title,order,summary}`) is the shape returned by `get` (`moduleRefs`) and consumed by the UI helpers.
