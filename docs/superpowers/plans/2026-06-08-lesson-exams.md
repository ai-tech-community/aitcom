# Lesson Exams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a course author attach an auto-graded objective exam to a lesson; when the exam is *mandatory*, passing it is the only way to complete that lesson, and passing every mandatory exam in a course issues a course-completion certificate.

**Architecture:** The exam *definition* lives as fields on the Payload `lessons` collection (scalar flags + a single `examQuestions` JSON field, mirroring the existing `body` jsonb). Per-learner *attempts* live in a new Drizzle `app.lesson_exam_attempt` table (one row per attempt, full history); pass state is derived from "an attempt with `passed = true` exists", never a stored flag. Grading runs **server-side only** in a new `submitExamAttempt` tRPC procedure — the public `get` endpoint strips the answer key before sending questions to the browser. A course certificate is persisted in `app.course_certificate`, stamped the moment a learner's final lesson completes. See [ADR-0028](../../adr/0028-lesson-exam-gates-completion-not-reputation.md) and the **Lesson exam** / **Course certificate** glossary entries in [CONTEXT.md](../../../CONTEXT.md).

**Tech Stack:** Payload CMS 3, Drizzle ORM (Postgres `app` schema, Neon), tRPC v11, Next.js 15 / React 19, next-intl, Vitest.

**Invariants this plan must preserve:**
- A mandatory un-passed exam blocks **only its own lesson**, never later lessons.
- Course-pass is **completion-derived** (all lessons complete), never an aggregate score.
- Passing earns the learner **no XP** (no `awardXp` call on the learner anywhere in this plan).
- The **correct answers never reach the client** — grading is server-side.
- Author edits are **forward-only**: existing passes/completions are never re-graded or revoked.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/classroom.ts` | Pure exam types + grading/pass/cert logic (no I/O) | Modify |
| `src/lib/classroom.test.ts` | Unit tests for the pure logic | Modify |
| `src/collections/Lessons.ts` | Add exam fields to the Payload lesson schema | Modify |
| `src/server/db/schema.ts` | Add `lessonExamAttempts` + `courseCertificates` Drizzle tables | Modify |
| `src/migrations/20260608e_lesson_exams.ts` | DDL: lesson exam columns + two new tables | Create |
| `src/migrations/index.ts` | Register the new migration | Modify |
| `src/server/api/routers/classrooms.ts` | `get` shape extension, `submitExamAttempt`, guard `markLessonComplete`, cert helper | Modify |
| `src/components/classroom/exam-editor.tsx` | Author UI: build/edit an exam | Create |
| `src/components/classroom/lesson-editor.tsx` | Mount the exam editor in the lesson form | Modify |
| `src/components/classroom/exam-runner.tsx` | Learner UI: take an exam, see result + attempt history | Create |
| `src/components/classroom/course-view.tsx` | Gate the complete button behind a mandatory exam; show certificate | Modify |
| `messages/en.json`, `messages/nl.json` | i18n keys under the `classroom` namespace | Modify |

**Data shapes (used across tasks — defined once in Task 1):**

```typescript
// An exam question. `correctIndex` is SERVER-ONLY and must be stripped before
// sending to the client (see PublicExamQuestion).
export type ExamQuestion = {
  id: string;               // stable id (crypto.randomUUID at author time)
  prompt: string;
  type: "single" | "boolean";
  options: string[];        // single: 2..6 options; boolean: ["True","False"]
  correctIndex: number;     // index into options
};

// The exam as authored, stored in lessons.examQuestions (jsonb).
export type ExamDefinition = ExamQuestion[];

// What the client receives — no answer key.
export type PublicExamQuestion = Omit<ExamQuestion, "correctIndex">;

// One submitted answer: which option index the learner chose for a question.
export type ExamAnswer = { questionId: string; selectedIndex: number };
```

---

### Task 1: Pure exam logic (types + grading + pass + course-pass)

All exam math is pure and I/O-free so it can be unit-tested without a database. This task adds the types above plus four functions to `src/lib/classroom.ts`.

**Files:**
- Modify: `src/lib/classroom.ts`
- Test: `src/lib/classroom.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/classroom.test.ts`:

```typescript
import {
  gradeExam,
  examPassed,
  stripAnswerKey,
  coursePassed,
  type ExamQuestion,
} from "./classroom";

const Q: ExamQuestion[] = [
  { id: "a", prompt: "1+1?", type: "single", options: ["1", "2", "3"], correctIndex: 1 },
  { id: "b", prompt: "Sky is blue?", type: "boolean", options: ["True", "False"], correctIndex: 0 },
];

describe("gradeExam", () => {
  it("scores all-correct as 100", () => {
    const r = gradeExam(Q, [
      { questionId: "a", selectedIndex: 1 },
      { questionId: "b", selectedIndex: 0 },
    ]);
    expect(r.score).toBe(100);
    expect(r.correctCount).toBe(2);
    expect(r.wrongQuestionIds).toEqual([]);
  });
  it("scores half-correct as 50 and reports the wrong question", () => {
    const r = gradeExam(Q, [
      { questionId: "a", selectedIndex: 0 },
      { questionId: "b", selectedIndex: 0 },
    ]);
    expect(r.score).toBe(50);
    expect(r.wrongQuestionIds).toEqual(["a"]);
  });
  it("treats a missing or out-of-range answer as wrong", () => {
    const r = gradeExam(Q, [{ questionId: "a", selectedIndex: 99 }]);
    expect(r.score).toBe(0);
    expect(r.wrongQuestionIds).toEqual(["a", "b"]);
  });
  it("ignores answers to unknown questions", () => {
    const r = gradeExam(Q, [
      { questionId: "a", selectedIndex: 1 },
      { questionId: "ghost", selectedIndex: 0 },
      { questionId: "b", selectedIndex: 0 },
    ]);
    expect(r.score).toBe(100);
  });
  it("scores an empty exam as 0", () => {
    expect(gradeExam([], []).score).toBe(0);
  });
});

describe("examPassed", () => {
  it("passes at or above threshold", () => {
    expect(examPassed(80, 80)).toBe(true);
    expect(examPassed(81, 80)).toBe(true);
  });
  it("fails below threshold", () => {
    expect(examPassed(79, 80)).toBe(false);
  });
});

describe("stripAnswerKey", () => {
  it("removes correctIndex from every question", () => {
    const pub = stripAnswerKey(Q);
    expect(pub).toEqual([
      { id: "a", prompt: "1+1?", type: "single", options: ["1", "2", "3"] },
      { id: "b", prompt: "Sky is blue?", type: "boolean", options: ["True", "False"] },
    ]);
    // @ts-expect-error correctIndex must not exist on the public shape
    expect(pub[0].correctIndex).toBeUndefined();
  });
});

describe("coursePassed", () => {
  it("is true only when every lesson is complete", () => {
    expect(coursePassed(3, 3)).toBe(true);
    expect(coursePassed(2, 3)).toBe(false);
  });
  it("is false for a course with no lessons", () => {
    expect(coursePassed(0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/classroom.test.ts`
Expected: FAIL — `gradeExam`, `examPassed`, `stripAnswerKey`, `coursePassed` are not exported.

- [ ] **Step 3: Implement the logic**

Append to `src/lib/classroom.ts`:

```typescript
export type ExamQuestion = {
  id: string;
  prompt: string;
  type: "single" | "boolean";
  options: string[];
  correctIndex: number;
};
export type ExamDefinition = ExamQuestion[];
export type PublicExamQuestion = Omit<ExamQuestion, "correctIndex">;
export type ExamAnswer = { questionId: string; selectedIndex: number };

/** Grade objective answers against the key. Missing/out-of-range answers are wrong. */
export function gradeExam(
  questions: ExamQuestion[],
  answers: ExamAnswer[],
): { score: number; correctCount: number; wrongQuestionIds: string[] } {
  if (questions.length === 0) {
    return { score: 0, correctCount: 0, wrongQuestionIds: [] };
  }
  const picked = new Map(answers.map((a) => [a.questionId, a.selectedIndex]));
  const wrongQuestionIds: string[] = [];
  let correctCount = 0;
  for (const q of questions) {
    if (picked.get(q.id) === q.correctIndex) correctCount++;
    else wrongQuestionIds.push(q.id);
  }
  return {
    score: Math.round((correctCount / questions.length) * 100),
    correctCount,
    wrongQuestionIds,
  };
}

/** Did a score clear the pass threshold (inclusive)? */
export function examPassed(score: number, threshold: number): boolean {
  return score >= threshold;
}

/** Drop the answer key so questions are safe to send to the browser. */
export function stripAnswerKey(questions: ExamQuestion[]): PublicExamQuestion[] {
  return questions.map(({ correctIndex: _correctIndex, ...rest }) => rest);
}

/** Course-pass is completion-derived: every lesson complete, and at least one lesson. */
export function coursePassed(completed: number, total: number): boolean {
  return total > 0 && completed >= total;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/classroom.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/classroom.ts src/lib/classroom.test.ts
git commit -m "feat(classroom): pure exam grading + course-pass logic"
```

---

### Task 2: Add exam fields to the Payload Lessons collection

The exam definition rides on the lesson. Scalar flags plus a single JSON field for the questions (mirrors the `body` jsonb pattern; avoids Payload nested-array child tables).

**Files:**
- Modify: `src/collections/Lessons.ts:55-62` (after the `body` field, before `resources`)

- [ ] **Step 1: Add the fields**

In `src/collections/Lessons.ts`, insert these field objects into the `fields` array, immediately after the `body` field block and before the `resources` field:

```typescript
    { name: "examMandatory", type: "checkbox", defaultValue: false },
    {
      name: "examPassThreshold",
      type: "number",
      defaultValue: 70,
      min: 0,
      max: 100,
      admin: { description: "Percent (0–100) required to pass." },
    },
    {
      name: "examMaxAttempts",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: { description: "0 = unlimited attempts." },
    },
    {
      name: "examQuestions",
      type: "json",
      admin: {
        description:
          "Array of { id, prompt, type, options[], correctIndex }. Authored via the custom lesson editor.",
      },
    },
```

- [ ] **Step 2: Regenerate Payload types**

Run: `npx payload generate:types`
Expected: `src/payload-types.ts` updates — the `Lesson` type now includes `examMandatory?`, `examPassThreshold?`, `examMaxAttempts?`, `examQuestions?`.

- [ ] **Step 3: Verify the project typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (no errors introduced by the new fields).

- [ ] **Step 4: Commit**

```bash
git add src/collections/Lessons.ts src/payload-types.ts
git commit -m "feat(classroom): add exam fields to Lessons collection"
```

---

### Task 3: Drizzle schema — attempt + certificate tables

**Files:**
- Modify: `src/server/db/schema.ts` (immediately after the `lessonCompletions` table, ~line 2703)

- [ ] **Step 1: Add the two tables**

Insert after the `lessonCompletions` table definition in `src/server/db/schema.ts`:

```typescript
export const lessonExamAttempts = appSchema.table(
  "lesson_exam_attempt",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lessonId: d.integer().notNull(), // References Payload lessons table
    courseId: d.integer().notNull(), // References Payload courses table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    score: d.integer().notNull(), // 0..100
    thresholdAtAttempt: d.integer().notNull(), // threshold in force when taken
    passed: d.boolean().notNull(),
    answers: d.jsonb().notNull(), // ExamAnswer[] snapshot
    attemptedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("lesson_exam_attempt_lesson_user_idx").on(t.lessonId, t.userId),
    index("lesson_exam_attempt_course_idx").on(t.courseId),
  ],
);

export const courseCertificates = appSchema.table(
  "course_certificate",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: d.integer().notNull(), // References Payload courses table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    issuedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("course_certificate_user_idx").on(t.userId),
    uniqueIndex("course_certificate_unique").on(t.courseId, t.userId),
  ],
);
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(classroom): drizzle tables for exam attempts + certificates"
```

---

### Task 4: Migration — exam columns + attempt/certificate tables

**Files:**
- Create: `src/migrations/20260608e_lesson_exams.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

Create `src/migrations/20260608e_lesson_exams.ts`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Exam definition columns on the Payload lessons table.
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_mandatory" boolean DEFAULT false`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_pass_threshold" numeric DEFAULT 70`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_max_attempts" numeric DEFAULT 0`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_questions" jsonb`));

  // Per-learner attempt history (app schema).
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."lesson_exam_attempt" (
      "id" varchar(255) PRIMARY KEY,
      "lesson_id" integer NOT NULL,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "score" integer NOT NULL,
      "threshold_at_attempt" integer NOT NULL,
      "passed" boolean NOT NULL,
      "answers" jsonb NOT NULL,
      "attempted_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lesson_exam_attempt_lesson_user_idx" ON "app"."lesson_exam_attempt"("lesson_id","user_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lesson_exam_attempt_course_idx" ON "app"."lesson_exam_attempt"("course_id")`));

  // Course-completion certificates (app schema).
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."course_certificate" (
      "id" varchar(255) PRIMARY KEY,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "issued_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "course_certificate_user_idx" ON "app"."course_certificate"("user_id")`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "course_certificate_unique" ON "app"."course_certificate"("course_id","user_id")`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."course_certificate"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."lesson_exam_attempt"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_questions"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_max_attempts"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_pass_threshold"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_mandatory"`));
}
```

- [ ] **Step 2: Register the migration**

In `src/migrations/index.ts`, add the import alongside the others and append the entry to the `migrations` array (keep chronological order — after the `20260608b_classrooms` entry):

```typescript
import * as migration_20260608e_lesson_exams from "./20260608e_lesson_exams";
```

```typescript
  {
    up: migration_20260608e_lesson_exams.up,
    down: migration_20260608e_lesson_exams.down,
    name: "20260608e_lesson_exams",
  },
```

- [ ] **Step 3: Apply the migration**

Run: `npm run db:apply`
Expected: output reports `20260608e_lesson_exams` applied with no error.

- [ ] **Step 4: Verify the schema landed**

Run: `npm run db:apply`
Expected: reports "no pending migrations" (idempotent — confirms it committed).

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260608e_lesson_exams.ts src/migrations/index.ts
git commit -m "feat(classroom): migration for exam fields + attempt/certificate tables"
```

---

### Task 5: Extend the `get` procedure with exam metadata + caller attempts

The public `get` must expose enough to render and gate exams **without leaking the answer key**, plus the caller's attempt history and certificate state.

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (the `get` procedure, ~lines 143-201; import block ~lines 1-24)

- [ ] **Step 1: Extend the imports**

In the schema import block of `src/server/api/routers/classrooms.ts`, add the two new tables and the pure helpers:

```typescript
import {
  communities,
  communityMemberships,
  courseEnrollments,
  lessonCompletions,
  lessonExamAttempts,
  courseCertificates,
} from "@/server/db/schema";
import {
  canCreateCourse,
  courseProgressPercent,
  coursePassed,
  stripAnswerKey,
  type CommunityRole,
  type ExamQuestion,
} from "@/lib/classroom";
```

- [ ] **Step 2: Build the per-lesson public exam shape and caller exam state inside `get`**

In the `get` query, **replace** the `return { course, lessons, enrolled, completedLessonIds };` line with the block below. This maps each lesson's stored `examQuestions` to an answer-key-stripped summary, and (for a signed-in caller) loads their attempts + certificate:

```typescript
    // Public per-lesson exam summary — NEVER includes correctIndex.
    const lessonExams = lessons.map((l) => {
      const questions = (l.examQuestions ?? []) as ExamQuestion[];
      const hasExam = questions.length > 0;
      return {
        lessonId: l.id,
        hasExam,
        mandatory: hasExam && l.examMandatory === true,
        passThreshold: l.examPassThreshold ?? 70,
        maxAttempts: l.examMaxAttempts ?? 0,
        questionCount: questions.length,
        questions: hasExam ? stripAnswerKey(questions) : [],
      };
    });

    let attempts: {
      lessonId: number;
      score: number;
      passed: boolean;
      attemptedAt: Date;
    }[] = [];
    let certificateIssuedAt: Date | null = null;
    if (userId) {
      const rows = await ctx.db
        .select({
          lessonId: lessonExamAttempts.lessonId,
          score: lessonExamAttempts.score,
          passed: lessonExamAttempts.passed,
          attemptedAt: lessonExamAttempts.attemptedAt,
        })
        .from(lessonExamAttempts)
        .where(
          and(
            eq(lessonExamAttempts.courseId, course.id),
            eq(lessonExamAttempts.userId, userId),
          ),
        );
      attempts = rows;

      const cert = await ctx.db
        .select({ issuedAt: courseCertificates.issuedAt })
        .from(courseCertificates)
        .where(
          and(
            eq(courseCertificates.courseId, course.id),
            eq(courseCertificates.userId, userId),
          ),
        )
        .limit(1);
      certificateIssuedAt = cert[0]?.issuedAt ?? null;
    }

    const passedCourse = coursePassed(completedLessonIds.length, lessons.length);

    return {
      course,
      lessons,
      enrolled,
      completedLessonIds,
      lessonExams,
      attempts,
      certificateIssuedAt,
      passedCourse,
    };
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/classrooms.ts
git commit -m "feat(classroom): expose exam metadata + caller attempts from get"
```

---

### Task 6: `submitExamAttempt` procedure — server-side grading

This is the only place grading happens. It enforces enrollment, the max-attempts cap, grades against the stored key, records the attempt, and on a pass inserts the lesson completion (idempotently) and issues a certificate if the course is now complete.

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (add a `coursePassed`/cert helper + the procedure)

- [ ] **Step 1: Add a shared certificate-issuing helper**

Near the top of `src/server/api/routers/classrooms.ts` (after the imports, before `createTRPCRouter`), add a module-level helper. It is reused by Task 7 too:

```typescript
/** Issue a course certificate if (and only if) every lesson is now complete. Idempotent. */
async function issueCertificateIfComplete(
  database: typeof db,
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  courseId: number,
  userId: string,
): Promise<void> {
  const { totalDocs: totalLessons } = await payload.count({
    collection: "lessons",
    where: { course: { equals: courseId } },
  });
  if (totalLessons === 0) return;

  const completedRows = await database
    .select({ lessonId: lessonCompletions.lessonId })
    .from(lessonCompletions)
    .where(
      and(
        eq(lessonCompletions.courseId, courseId),
        eq(lessonCompletions.userId, userId),
      ),
    );
  if (completedRows.length < totalLessons) return;

  await database
    .insert(courseCertificates)
    .values({ courseId, userId })
    .onConflictDoNothing();
}
```

- [ ] **Step 2: Add the `submitExamAttempt` procedure**

Add this procedure to the router object in `src/server/api/routers/classrooms.ts` (alongside `markLessonComplete`):

```typescript
/** Grade an exam attempt server-side; on pass, complete the lesson + maybe certify. */
submitExamAttempt: protectedProcedure
  .input(
    z.object({
      lessonId: z.number(),
      answers: z.array(
        z.object({ questionId: z.string(), selectedIndex: z.number().int() }),
      ),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const payload = await getPayloadClient();
    const lesson = await payload.findByID({
      collection: "lessons",
      id: input.lessonId,
      depth: 0,
    });
    const courseId = lesson.course;

    const questions = (lesson.examQuestions ?? []) as ExamQuestion[];
    if (questions.length === 0)
      throw new TRPCError({ code: "BAD_REQUEST", message: "NO_EXAM" });

    // Enrolled-only, mirroring markLessonComplete.
    const enr = await ctx.db
      .select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, courseId),
          eq(courseEnrollments.userId, userId),
        ),
      )
      .limit(1);
    if (enr.length === 0)
      throw new TRPCError({ code: "FORBIDDEN", message: "NOT_ENROLLED" });

    // Existing attempts: enforce the cap, and detect a sticky prior pass.
    const prior = await ctx.db
      .select({ passed: lessonExamAttempts.passed })
      .from(lessonExamAttempts)
      .where(
        and(
          eq(lessonExamAttempts.lessonId, input.lessonId),
          eq(lessonExamAttempts.userId, userId),
        ),
      );
    const alreadyPassed = prior.some((p) => p.passed);
    const maxAttempts = lesson.examMaxAttempts ?? 0;
    if (!alreadyPassed && maxAttempts > 0 && prior.length >= maxAttempts)
      throw new TRPCError({ code: "FORBIDDEN", message: "NO_ATTEMPTS_LEFT" });

    const threshold = lesson.examPassThreshold ?? 70;
    const { score, wrongQuestionIds } = gradeExam(questions, input.answers);
    const passed = examPassed(score, threshold);

    await ctx.db.insert(lessonExamAttempts).values({
      lessonId: input.lessonId,
      courseId,
      userId,
      score,
      thresholdAtAttempt: threshold,
      passed,
      answers: input.answers,
    });

    // A pass completes the lesson (idempotent); never un-complete on a later fail.
    if (passed) {
      await ctx.db
        .insert(lessonCompletions)
        .values({ lessonId: input.lessonId, courseId, userId })
        .onConflictDoNothing();
      await issueCertificateIfComplete(ctx.db, payload, courseId, userId);
    }

    return { score, passed, wrongQuestionIds };
  }),
```

- [ ] **Step 3: Add `gradeExam` + `examPassed` to the import block**

Extend the `@/lib/classroom` import in `src/server/api/routers/classrooms.ts` to also pull the grading functions:

```typescript
import {
  canCreateCourse,
  courseProgressPercent,
  coursePassed,
  stripAnswerKey,
  gradeExam,
  examPassed,
  type CommunityRole,
  type ExamQuestion,
} from "@/lib/classroom";
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS. (Note: `.onConflictDoNothing()` requires the unique index from Task 3/4 — already in place.)

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/classrooms.ts
git commit -m "feat(classroom): submitExamAttempt with server-side grading + certify"
```

---

### Task 7: Guard `markLessonComplete` against bypassing a mandatory exam

The self-report path must refuse to complete a lesson that carries a *mandatory* exam (that lesson can only be completed by passing). It must still issue a certificate when a non-gated completion finishes the course.

**Files:**
- Modify: `src/server/api/routers/classrooms.ts` (the `markLessonComplete` procedure, ~lines 537-587)

- [ ] **Step 1: Reject manual completion of a mandatory-exam lesson + certify on completion**

In `markLessonComplete`, after `const courseId = lesson.course;` and before the enrollment check, add the mandatory guard:

```typescript
    const examQuestions = (lesson.examQuestions ?? []) as ExamQuestion[];
    const mandatoryExam =
      examQuestions.length > 0 && lesson.examMandatory === true;
    if (input.completed && mandatoryExam)
      throw new TRPCError({ code: "FORBIDDEN", message: "EXAM_REQUIRED" });
```

Then, in the branch that inserts a completion (`if (input.completed && existing.length === 0)`), add a certificate check after the insert. The branch becomes:

```typescript
    if (input.completed && existing.length === 0) {
      await ctx.db
        .insert(lessonCompletions)
        .values({ lessonId: input.lessonId, courseId, userId });
      await issueCertificateIfComplete(ctx.db, payload, courseId, userId);
    } else if (!input.completed && existing.length > 0) {
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/classrooms.ts
git commit -m "feat(classroom): block self-report completion of mandatory-exam lessons"
```

---

### Task 8: Author UI — exam editor

A self-contained component the author uses to build an exam: toggle mandatory, set threshold/max-attempts, and add/edit/remove questions. It receives the *full* questions (with answer key — authors own the content) and emits the updated array up to the lesson form's state.

**Files:**
- Create: `src/components/classroom/exam-editor.tsx`
- Modify: `src/components/classroom/lesson-editor.tsx` (thread exam state into `LessonFields` and both mutations)

- [ ] **Step 1: Create the exam editor component**

Create `src/components/classroom/exam-editor.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExamQuestion } from "@/lib/classroom";

export type ExamDraft = {
  mandatory: boolean;
  passThreshold: number;
  maxAttempts: number;
  questions: ExamQuestion[];
};

export function ExamEditor({
  value,
  onChange,
  disabled,
}: {
  value: ExamDraft;
  onChange: (next: ExamDraft) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("classroom");

  const setQuestion = (i: number, q: ExamQuestion) => {
    const questions = value.questions.slice();
    questions[i] = q;
    onChange({ ...value, questions });
  };
  const addQuestion = () =>
    onChange({
      ...value,
      questions: [
        ...value.questions,
        {
          id: crypto.randomUUID(),
          prompt: "",
          type: "single",
          options: ["", ""],
          correctIndex: 0,
        },
      ],
    });
  const removeQuestion = (i: number) =>
    onChange({ ...value, questions: value.questions.filter((_, j) => j !== i) });

  return (
    <div className="border-border space-y-4 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="exam-mandatory"
          checked={value.mandatory}
          onCheckedChange={(c) => onChange({ ...value, mandatory: c === true })}
          disabled={disabled}
        />
        <Label htmlFor="exam-mandatory">{t("examMandatory")}</Label>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("examPassThreshold")}</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={value.passThreshold}
            onChange={(e) =>
              onChange({ ...value, passThreshold: Number(e.target.value) })
            }
            disabled={disabled}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("examMaxAttempts")}</Label>
          <Input
            type="number"
            min={0}
            value={value.maxAttempts}
            onChange={(e) =>
              onChange({ ...value, maxAttempts: Number(e.target.value) })
            }
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-3">
        {value.questions.map((q, i) => (
          <div key={q.id} className="border-border space-y-2 rounded-md border p-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-xs">
                {i + 1}
              </span>
              <Input
                value={q.prompt}
                placeholder={t("examQuestionPrompt")}
                onChange={(e) => setQuestion(i, { ...q, prompt: e.target.value })}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => removeQuestion(i)}
                disabled={disabled}
                aria-label={t("examRemoveQuestion")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2 pl-6">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  checked={q.correctIndex === oi}
                  onChange={() => setQuestion(i, { ...q, correctIndex: oi })}
                  disabled={disabled}
                  aria-label={t("examMarkCorrect")}
                />
                <Input
                  value={opt}
                  placeholder={t("examOption")}
                  onChange={(e) => {
                    const options = q.options.slice();
                    options[oi] = e.target.value;
                    setQuestion(i, { ...q, options });
                  }}
                  disabled={disabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() =>
                    setQuestion(i, {
                      ...q,
                      options: q.options.filter((_, j) => j !== oi),
                      correctIndex:
                        q.correctIndex >= oi && q.correctIndex > 0
                          ? q.correctIndex - 1
                          : q.correctIndex,
                    })
                  }
                  disabled={disabled || q.options.length <= 2}
                  aria-label={t("examRemoveOption")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-6"
              onClick={() => setQuestion(i, { ...q, options: [...q.options, ""] })}
              disabled={disabled || q.options.length >= 6}
            >
              <Plus className="mr-1.5 size-3.5" /> {t("examAddOption")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addQuestion}
          disabled={disabled}
        >
          <Plus className="mr-1.5 size-4" /> {t("examAddQuestion")}
        </Button>
      </div>
    </div>
  );
}
```

> If `@/components/ui/checkbox` does not exist, run `npx shadcn@latest add checkbox` first; the repo uses shadcn/ui primitives.

- [ ] **Step 2: Thread exam state through the lesson editor**

In `src/components/classroom/lesson-editor.tsx`:

1. Import the editor and its draft type at the top:

```typescript
import { ExamEditor, type ExamDraft } from "./exam-editor";
import type { ExamQuestion } from "@/lib/classroom";
```

2. Extend the `LessonFields` props and render the editor below `ResourcesEditor`. Add `exam` + `setExam` to the prop type and signature, and add before the closing `</div>` of `LessonFields`:

```typescript
      <ExamEditor value={exam} onChange={setExam} disabled={disabled} />
```

3. In **both** `LessonRow` (edit) and the add-lesson form, hold exam state and pass it into the mutation. In `LessonRow`, initialise from the lesson:

```typescript
  const [exam, setExam] = useState<ExamDraft>({
    mandatory: lesson.examMandatory ?? false,
    passThreshold: lesson.examPassThreshold ?? 70,
    maxAttempts: lesson.examMaxAttempts ?? 0,
    questions: (lesson.examQuestions ?? []) as ExamQuestion[],
  });
```

In the add-lesson form, initialise empty:

```typescript
  const [exam, setExam] = useState<ExamDraft>({
    mandatory: false,
    passThreshold: 70,
    maxAttempts: 0,
    questions: [],
  });
```

4. Pass the exam fields in each mutation's payload (both `add.mutate` and `update.mutate`):

```typescript
        examMandatory: exam.mandatory,
        examPassThreshold: exam.passThreshold,
        examMaxAttempts: exam.maxAttempts,
        examQuestions: exam.questions,
```

- [ ] **Step 3: Accept the new fields in `createLesson` / `updateLesson` inputs**

In `src/server/api/routers/classrooms.ts`, extend the zod input of the existing `createLesson` and `updateLesson` mutations with the optional exam fields and persist them via the Payload `create`/`update` `data` object:

```typescript
      examMandatory: z.boolean().optional(),
      examPassThreshold: z.number().min(0).max(100).optional(),
      examMaxAttempts: z.number().min(0).optional(),
      examQuestions: z
        .array(
          z.object({
            id: z.string(),
            prompt: z.string(),
            type: z.enum(["single", "boolean"]),
            options: z.array(z.string()),
            correctIndex: z.number().int(),
          }),
        )
        .optional(),
```

Map these straight into the `data` passed to `payload.create({ collection: "lessons", data })` / `payload.update(...)` (only include keys that are defined, matching the existing field-handling style in those procedures).

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/exam-editor.tsx src/components/classroom/lesson-editor.tsx src/server/api/routers/classrooms.ts
git commit -m "feat(classroom): author UI for building lesson exams"
```

---

### Task 9: Learner UI — exam runner + gated completion

The learner takes the exam in an `ExamRunner`. It shuffles question/option display order locally (anti-screenshot) while submitting **original** option indices, shows score + which questions were wrong (never the answers), and surfaces attempt history. The lesson's "Mark complete" button is replaced by the exam when the lesson is gated.

**Files:**
- Create: `src/components/classroom/exam-runner.tsx`
- Modify: `src/components/classroom/course-view.tsx` (title/complete block, ~lines 381-411)

- [ ] **Step 1: Create the exam runner**

Create `src/components/classroom/exam-runner.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import type { PublicExamQuestion } from "@/lib/classroom";

type LessonExam = {
  lessonId: number;
  mandatory: boolean;
  passThreshold: number;
  maxAttempts: number;
  questions: PublicExamQuestion[];
};
type Attempt = { lessonId: number; score: number; passed: boolean };

/** Stable per-mount shuffle so option order doesn't jump as the user clicks. */
function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function ExamRunner({
  exam,
  attempts,
  completed,
}: {
  exam: LessonExam;
  attempts: Attempt[];
  completed: boolean;
}) {
  const t = useTranslations("classroom");
  const utils = api.useUtils();
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [result, setResult] = useState<
    { score: number; passed: boolean; wrongQuestionIds: string[] } | null
  >(null);

  // Display order: shuffle questions, and shuffle each question's options while
  // remembering the original index so grading stays correct.
  const display = useMemo(
    () =>
      shuffled(exam.questions).map((q) => ({
        ...q,
        shown: shuffled(q.options.map((label, originalIndex) => ({ label, originalIndex }))),
      })),
    [exam.questions],
  );

  const mine = attempts.filter((a) => a.lessonId === exam.lessonId);
  const passed = completed || mine.some((a) => a.passed);
  const attemptsUsed = mine.length;
  const outOfAttempts =
    !passed && exam.maxAttempts > 0 && attemptsUsed >= exam.maxAttempts;

  const submit = api.classrooms.submitExamAttempt.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.passed) toast.success(t("examPassedToast", { score: r.score }));
      else toast.error(t("examFailedToast", { score: r.score }));
      void utils.classrooms.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? t("saveFailed")),
  });

  return (
    <div className="border-border bg-muted/30 space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{t("exam")}</h4>
        <span className="text-muted-foreground text-xs">
          {t("examThresholdLabel", { percent: exam.passThreshold })}
          {exam.maxAttempts > 0
            ? ` · ${t("examAttemptsLabel", { used: attemptsUsed, max: exam.maxAttempts })}`
            : null}
        </span>
      </div>

      {passed ? (
        <p className="text-sm font-medium text-green-600">
          {t("examAlreadyPassed", {
            score: Math.max(0, ...mine.filter((a) => a.passed).map((a) => a.score)),
          })}
        </p>
      ) : (
        <>
          {display.map((q, qi) => (
            <fieldset key={q.id} className="space-y-1.5">
              <legend className="text-sm font-medium">
                {qi + 1}. {q.prompt}
                {result?.wrongQuestionIds.includes(q.id) ? (
                  <span className="ml-2 text-xs text-red-600">{t("examWrong")}</span>
                ) : null}
              </legend>
              {q.shown.map((opt) => (
                <label key={opt.originalIndex} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={q.id}
                    checked={picks[q.id] === opt.originalIndex}
                    onChange={() =>
                      setPicks((p) => ({ ...p, [q.id]: opt.originalIndex }))
                    }
                    disabled={submit.isPending || outOfAttempts}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          ))}

          {outOfAttempts ? (
            <p className="text-sm text-red-600">{t("examNoAttemptsLeft")}</p>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={submit.isPending || Object.keys(picks).length === 0}
              onClick={() =>
                submit.mutate({
                  lessonId: exam.lessonId,
                  answers: Object.entries(picks).map(([questionId, selectedIndex]) => ({
                    questionId,
                    selectedIndex,
                  })),
                })
              }
            >
              {mine.length > 0 ? t("examRetry") : t("examSubmit")}
            </Button>
          )}
        </>
      )}

      {mine.length > 0 ? (
        <div className="text-muted-foreground space-y-0.5 text-xs">
          <p className="font-medium">{t("examHistory")}</p>
          {mine.map((a, i) => (
            <p key={i}>
              {t("examAttemptLine", {
                n: i + 1,
                score: a.score,
                result: a.passed ? t("examPass") : t("examFail"),
              })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire the runner into the learner view + gate the complete button**

In `src/components/classroom/course-view.tsx`, read the new `get` fields near the other destructures (around line 64-85):

```typescript
const lessonExams = data?.lessonExams ?? [];
const attempts = data?.attempts ?? [];
const certificateIssuedAt = data?.certificateIssuedAt ?? null;
```

Then, in the title/complete block (lines 381-411), compute the selected lesson's exam and branch: a mandatory exam replaces the manual button; a non-mandatory exam renders the runner *and* keeps the self-report button. Replace the existing complete-button expression with:

```typescript
  {enrolled && !previewing
    ? (() => {
        const isCompleted = completedLessonIds.includes(selectedLesson.id);
        const exam = lessonExams.find((e) => e.lessonId === selectedLesson.id);
        if (exam?.mandatory) {
          return null; // gated: completion only via the runner below
        }
        return (
          <Button
            type="button"
            variant={isCompleted ? "outline" : "default"}
            size="sm"
            className="shrink-0"
            disabled={markComplete.isPending}
            onClick={() =>
              markComplete.mutate({
                lessonId: selectedLesson.id,
                completed: !isCompleted,
              })
            }
          >
            {isCompleted ? t("markIncomplete") : t("markComplete")}
          </Button>
        );
      })()
    : null}
```

And below the lesson body/resources area (after the resources render, still inside the enrolled, non-preview content), mount the runner when the selected lesson has an exam:

```typescript
{enrolled && !previewing
  ? (() => {
      const exam = lessonExams.find(
        (e) => e.lessonId === selectedLesson.id && e.questions.length > 0,
      );
      if (!exam) return null;
      return (
        <ExamRunner
          exam={exam}
          attempts={attempts}
          completed={completedLessonIds.includes(selectedLesson.id)}
        />
      );
    })()
  : null}
```

Add the import at the top of the file:

```typescript
import { ExamRunner } from "./exam-runner";
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. As an author, add a lesson with a mandatory 2-question exam (threshold 50). As an enrolled learner, confirm: the manual complete button is gone, the exam renders, a failing submission shows score + "wrong" markers and does not complete the lesson, a passing submission completes the lesson and increments the progress bar.
Expected: behaviour as described.

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/exam-runner.tsx src/components/classroom/course-view.tsx
git commit -m "feat(classroom): learner exam runner + gated lesson completion"
```

---

### Task 10: Certificate display on course-pass

When `passedCourse` is true and a certificate has been issued, show a certificate banner in the learner view.

**Files:**
- Modify: `src/components/classroom/course-view.tsx` (sidebar progress area, ~lines 248-254)

- [ ] **Step 1: Render the certificate banner**

In `src/components/classroom/course-view.tsx`, below the progress bar block, add:

```typescript
{certificateIssuedAt ? (
  <div className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-center">
    <p className="text-sm font-semibold text-green-700">
      {t("certificateEarned")}
    </p>
    <p className="text-muted-foreground text-xs">
      {t("certificateIssued", {
        date: new Date(certificateIssuedAt).toLocaleDateString(),
      })}
    </p>
  </div>
) : null}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/classroom/course-view.tsx
git commit -m "feat(classroom): course-completion certificate banner"
```

---

### Task 11: i18n keys

**Files:**
- Modify: `messages/en.json` (the `classroom` namespace)
- Modify: `messages/nl.json` (the `classroom` namespace)

- [ ] **Step 1: Add English keys**

Add these keys inside the existing `"classroom"` object in `messages/en.json`:

```json
"examMandatory": "Required to complete the lesson",
"examPassThreshold": "Pass threshold (%)",
"examMaxAttempts": "Max attempts (0 = unlimited)",
"examQuestionPrompt": "Question",
"examOption": "Answer option",
"examAddOption": "Add option",
"examRemoveOption": "Remove option",
"examMarkCorrect": "Mark as correct answer",
"examAddQuestion": "Add question",
"examRemoveQuestion": "Remove question",
"exam": "Exam",
"examSubmit": "Submit exam",
"examRetry": "Try again",
"examThresholdLabel": "Pass: {percent}%",
"examAttemptsLabel": "Attempt {used}/{max}",
"examWrong": "Incorrect",
"examNoAttemptsLeft": "You have used all your attempts.",
"examAlreadyPassed": "Passed — best score {score}%",
"examPassedToast": "Passed with {score}%",
"examFailedToast": "Scored {score}% — not passed yet",
"examHistory": "Your attempts",
"examAttemptLine": "Attempt {n}: {score}% — {result}",
"examPass": "passed",
"examFail": "not passed",
"certificateEarned": "Course completed 🎓",
"certificateIssued": "Issued {date}"
```

- [ ] **Step 2: Add Dutch keys**

Add the same keys to the `"classroom"` object in `messages/nl.json` with Dutch translations (mirror the structure; translate the values). If a value is uncertain, keep the English string as a placeholder so no key is missing — a missing key throws at runtime under next-intl.

- [ ] **Step 3: Verify the app builds with both locales**

Run: `npx tsc --noEmit`
Expected: PASS. Then `npm run dev` and load a course in both `/en` and `/nl` — no missing-message console errors.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(classroom): i18n keys for lesson exams + certificate"
```

---

## Final verification

- [ ] Run the full unit suite: `npx vitest run` → all green.
- [ ] Typecheck the whole project: `npx tsc --noEmit` → clean.
- [ ] Confirm migrations are idempotent: `npm run db:apply` → "no pending migrations".
- [ ] End-to-end manual pass (dev server): author a course with one mandatory-exam lesson + one plain lesson; enrol as a second user; pass the exam; complete the plain lesson; confirm progress hits 100% and the certificate banner appears with today's date.

## Out of scope (deliberately deferred — do NOT build here)

- AI-assisted exam authoring (designated #1 fast-follow).
- Author-facing exam analytics (pass rates, per-question difficulty).
- Multi-select questions + partial credit, timed exams, per-question explanations, randomized question pools, sequential lesson unlock.
- Score leaderboards (rejected — manufactures a farmable reputation currency).
- Any learner XP for passing (forbidden by [ADR-0028](../../adr/0028-lesson-exam-gates-completion-not-reputation.md)).
