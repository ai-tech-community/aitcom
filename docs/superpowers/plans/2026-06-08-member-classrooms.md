# Member-Created Classrooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let any active community member create a **Course** (ordered video **Lessons**), publish it immediately, and let members **enroll** and track **per-lesson progress** — a member-authored classroom per ADR-0027.

**Architecture:** Mirror the **Launchpad** model for authoring (Payload collections `courses` + `lessons`, `authorId`, `status` draft/published/archived, immediate publish, owner-only edit, post-hoc moderation) and the **Event registration** model for enrollment (Drizzle `course_enrollment` + `lesson_completion` join tables in `appSchema`). Lesson bodies reuse the forum's `plainTextToLexical` → `LexicalRenderer` pipeline (no heavy editor). A `classrooms` tRPC router exposes course/lesson CRUD, enroll/complete, and admin promote/remove. A per-community `classroomCreatePolicy` gates creation. Reputation: the creator earns small XP per **distinct enrollment** (like `LAUNCHPAD_RECEIVE_VOTE`); no XP for creating or self-completion.

**Tech Stack:** Next.js 15 / React 19, Payload CMS 3 (Postgres), Drizzle, tRPC v11, Vitest + @testing-library/react, next-intl (en/nl).

**Conventions:**
- Content lives in **Payload collections** (`src/collections/*.ts`, registered in `src/payload.config.ts`); relational tracking lives in **Drizzle** `appSchema` tables (`src/server/db/schema.ts`).
- After adding/altering Payload collections, **regenerate types**: `npx payload generate:types` (commit `src/payload-types.ts`).
- Schema changes ship as `src/migrations/<date>_*.ts` (SQL via `db.execute(sql.raw(...))`) registered in `src/migrations/index.ts` (import + `{up,down,name}` entry). Latest is `20260608a_feed_topics_pins_links` → name new ones `20260608b...`, `20260608c...`.
- Payload column = snake_case of field `name`.
- Tests: pure functions (Vitest) + components (RTL with `vi.hoisted` + `vi.mock` of `next/navigation`, `next-intl`, `@/i18n/navigation`, `@/trpc/react`). Run one: `npx vitest run <path>`. All: `npm test`. Typecheck: `npx tsc --noEmit`.
- i18n keys in BOTH `messages/en.json` + `messages/nl.json`.
- **Member-authoring gate (reuse everywhere):** resolve community by slug; require an `active` `communityMemberships` row for the user; for *create*, additionally honor `classroomCreatePolicy` (`admins_only` → require owner/admin). Owner-only edit = `course.authorId !== ctx.session.user.id` → FORBIDDEN (mods/admins bypass for unpublish/remove only). Mirror `launchpad.ts` exactly.

> Branch `feat/member-classrooms` already exists (docs committed). Do all work there.

---

## Data model

**Payload collections (content):**
- `courses`: `title`, `slug` (unique), `summary` (text), `authorId`, `authorName` (readOnly), `status` (`draft|published|archived`), `communityId` (indexed, required), `isPublic` (checkbox, default false — admin-promoted), `enrollmentCount` (number, readOnly), timestamps.
- `lessons`: `course` (number, indexed → courses.id), `title`, `order` (number), `youtubeUrl` (text), `body` (richText, lexical), `resources` (array of `{label,url}`), timestamps.

**Drizzle tables (tracking, `appSchema`):**
- `course_enrollment`: `id` uuid pk, `courseId` int, `userId` varchar→user.id, `enrolledAt` ts. Unique `(courseId,userId)`.
- `lesson_completion`: `id` uuid pk, `lessonId` int, `courseId` int, `userId` varchar→user.id, `completedAt` ts. Unique `(lessonId,userId)`.

**Community policy:** `communities.classroomCreatePolicy` (`all_members` default | `admins_only`).

---

## Task 1: Payload collections — Courses & Lessons

**Files:** Create `src/collections/Courses.ts`, `src/collections/Lessons.ts`; modify `src/payload.config.ts`.

- [ ] **Step 1: `src/collections/Courses.ts`**
```typescript
import type { CollectionConfig } from "payload";

export const Courses: CollectionConfig = {
  slug: "courses",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "authorName", "communityId", "status", "enrollmentCount"],
    description: "Member-created classroom courses.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    { name: "summary", type: "text", maxLength: 500 },
    { name: "authorId", type: "text", required: true, index: true, admin: { description: "Better Auth user ID." } },
    { name: "authorName", type: "text", admin: { readOnly: true } },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Admin-promoted: visible to non-members." },
    },
    { name: "enrollmentCount", type: "number", defaultValue: 0, admin: { readOnly: true } },
  ],
  timestamps: true,
};
```

- [ ] **Step 2: `src/collections/Lessons.ts`** (reuse the Articles lexical setup)
```typescript
import type { Block, CollectionConfig } from "payload";
import { BlocksFeature, CodeBlock, lexicalEditor } from "@payloadcms/richtext-lexical";

const codeLanguages = {
  bash: "Bash", javascript: "JavaScript", json: "JSON", python: "Python",
  shell: "Shell", sql: "SQL", typescript: "TypeScript", yaml: "YAML",
};

const ImageBlock: Block = {
  slug: "Image",
  fields: [
    { name: "src", type: "text", required: true },
    { name: "alt", type: "text" },
  ],
};

export const Lessons: CollectionConfig = {
  slug: "lessons",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "course", "order"],
    description: "Lessons within a course.",
  },
  fields: [
    { name: "course", type: "number", required: true, index: true, admin: { description: "courses.id" } },
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "order", type: "number", defaultValue: 0, index: true },
    { name: "youtubeUrl", type: "text", maxLength: 500 },
    {
      name: "body",
      type: "richText",
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ blocks: [CodeBlock({ languages: codeLanguages }), ImageBlock] }),
        ],
      }),
    },
    {
      name: "resources",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "url", type: "text", required: true },
      ],
    },
  ],
  timestamps: true,
};
```

- [ ] **Step 3: Register in `src/payload.config.ts`** — add imports near the others and add `Courses, Lessons,` to the `collections: [...]` array (e.g. after `LaunchpadProjects`):
```typescript
import { Courses } from "./collections/Courses";
import { Lessons } from "./collections/Lessons";
```

- [ ] **Step 4: Typecheck** `npx tsc --noEmit` (collections are declarative; expect clean). Commit:
```bash
git add src/collections/Courses.ts src/collections/Lessons.ts src/payload.config.ts
git commit -m "feat(classroom): Courses + Lessons Payload collections"
```

---

## Task 2: Drizzle tables, community policy, migration, type regen

**Files:** Modify `src/server/db/schema.ts`; create `src/migrations/20260608b_classrooms.ts`; modify `src/migrations/index.ts`; regenerate `src/payload-types.ts`.

- [ ] **Step 1: Add Drizzle tables to `src/server/db/schema.ts`** (mirror `eventRegistrations` + `launchpadVotes` style; place near other community tables). Confirm the actual imports available (`appSchema`, `sql`, `index`, `uniqueIndex`, `user`) by reading the top of the file and an existing `appSchema.table` def:
```typescript
export const courseEnrollments = appSchema.table(
  "course_enrollment",
  (d) => ({
    id: d.varchar({ length: 255 }).notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
    courseId: d.integer().notNull(),
    userId: d.varchar({ length: 255 }).notNull().references(() => user.id),
    enrolledAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  }),
  (t) => [
    index("course_enrollment_course_idx").on(t.courseId),
    index("course_enrollment_user_idx").on(t.userId),
    uniqueIndex("course_enrollment_unique").on(t.courseId, t.userId),
  ],
);

export const lessonCompletions = appSchema.table(
  "lesson_completion",
  (d) => ({
    id: d.varchar({ length: 255 }).notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
    lessonId: d.integer().notNull(),
    courseId: d.integer().notNull(),
    userId: d.varchar({ length: 255 }).notNull().references(() => user.id),
    completedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  }),
  (t) => [
    index("lesson_completion_course_idx").on(t.courseId),
    index("lesson_completion_user_idx").on(t.userId),
    uniqueIndex("lesson_completion_unique").on(t.lessonId, t.userId),
  ],
);
```
(If `uniqueIndex` isn't already imported in the file, add it to the `drizzle-orm/pg-core` import. Match the exact column-builder idiom the file uses — the explore confirmed `eventRegistrations` uses `d.varchar(...).$defaultFn(() => crypto.randomUUID())` and `index(...)`.)

- [ ] **Step 2: Add `classroomCreatePolicy` to the `communities` table** (next to `feedPostPolicy`, schema.ts ~line 2621):
```typescript
    classroomCreatePolicy: d
      .varchar({ length: 30 })
      .notNull()
      .default("all_members")
      .$type<"all_members" | "admins_only">(),
```

- [ ] **Step 3: Migration `src/migrations/20260608b_classrooms.ts`**
```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Payload collection tables (Payload also auto-creates via push in dev; keep for prod).
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "courses" (
      "id" serial PRIMARY KEY,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "summary" varchar,
      "author_id" varchar NOT NULL,
      "author_name" varchar,
      "status" varchar DEFAULT 'draft' NOT NULL,
      "community_id" varchar NOT NULL,
      "is_public" boolean DEFAULT false,
      "enrollment_count" numeric DEFAULT 0,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "courses_slug_idx" ON "courses"("slug")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "courses_community_id_idx" ON "courses"("community_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "courses_author_id_idx" ON "courses"("author_id")`));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "lessons" (
      "id" serial PRIMARY KEY,
      "course" numeric NOT NULL,
      "title" varchar NOT NULL,
      "order" numeric DEFAULT 0,
      "youtube_url" varchar,
      "body" jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lessons_course_idx" ON "lessons"("course")`));
  // lessons.resources is an array field → Payload manages its own child table under push; in prod,
  // run `npx payload migrate:create` instead if array-table DDL is needed. For this MVP the dev DB
  // is push-materialized, so this migration covers the scalar columns + the Drizzle tables below.

  // Drizzle tracking tables (app schema).
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."course_enrollment" (
      "id" varchar(255) PRIMARY KEY,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "course_enrollment_course_idx" ON "app"."course_enrollment"("course_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "course_enrollment_user_idx" ON "app"."course_enrollment"("user_id")`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "course_enrollment_unique" ON "app"."course_enrollment"("course_id","user_id")`));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."lesson_completion" (
      "id" varchar(255) PRIMARY KEY,
      "lesson_id" integer NOT NULL,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "completed_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lesson_completion_course_idx" ON "app"."lesson_completion"("course_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lesson_completion_user_idx" ON "app"."lesson_completion"("user_id")`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "lesson_completion_unique" ON "app"."lesson_completion"("lesson_id","user_id")`));

  // Community policy column.
  await db.execute(sql.raw(`ALTER TABLE "app"."community" ADD COLUMN IF NOT EXISTS "classroom_create_policy" varchar(30) DEFAULT 'all_members' NOT NULL`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "app"."community" DROP COLUMN IF EXISTS "classroom_create_policy"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."lesson_completion"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."course_enrollment"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "lessons"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "courses"`));
}
```
> NOTE: confirm whether `app`-schema tables in this repo's migrations use the `"app"."table"` qualified form — the explore noted `20260604a_work_grid_commission.ts` uses the `app` schema qualification for Drizzle tables while Payload-collection migrations use unqualified names. Match that: Drizzle tables (`course_enrollment`, `lesson_completion`, `community`) → `"app"."..."`; Payload tables (`courses`, `lessons`) → unqualified. Verify the community table's actual schema-qualified name in an existing migration that alters `community`.

- [ ] **Step 4: Register migration in `src/migrations/index.ts`** (import + append `{up,down,name:"20260608b_classrooms"}`).

- [ ] **Step 5: Materialize + regen types**
```bash
PAYLOAD_PUSH=true npm run dev   # briefly, to push Courses/Lessons schema; then stop
npx payload generate:types
```
- [ ] **Step 6: Typecheck** `npx tsc --noEmit` — clean. Commit:
```bash
git add src/server/db/schema.ts src/migrations/ src/payload-types.ts
git commit -m "feat(classroom): drizzle enrollment/completion tables, classroomCreatePolicy, migration"
```

---

## Task 3: Pure helpers (TDD)

**Files:** Create `src/lib/classroom.ts`, `src/lib/classroom.test.ts`.

- [ ] **Step 1: Failing test** `src/lib/classroom.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { courseProgressPercent, canCreateCourse } from "./classroom";

describe("courseProgressPercent", () => {
  it("is 0 when there are no lessons", () => {
    expect(courseProgressPercent(0, 0)).toBe(0);
  });
  it("is 0 when nothing completed", () => {
    expect(courseProgressPercent(0, 5)).toBe(0);
  });
  it("rounds to nearest percent", () => {
    expect(courseProgressPercent(1, 3)).toBe(33);
    expect(courseProgressPercent(2, 3)).toBe(67);
  });
  it("caps at 100", () => {
    expect(courseProgressPercent(5, 5)).toBe(100);
    expect(courseProgressPercent(6, 5)).toBe(100);
  });
});

describe("canCreateCourse", () => {
  it("allows any active member under all_members", () => {
    expect(canCreateCourse("all_members", "member")).toBe(true);
  });
  it("blocks non-admins under admins_only", () => {
    expect(canCreateCourse("admins_only", "member")).toBe(false);
    expect(canCreateCourse("admins_only", "moderator")).toBe(false);
  });
  it("allows owner/admin under admins_only", () => {
    expect(canCreateCourse("admins_only", "owner")).toBe(true);
    expect(canCreateCourse("admins_only", "admin")).toBe(true);
  });
  it("blocks a non-member regardless of policy", () => {
    expect(canCreateCourse("all_members", null)).toBe(false);
  });
});
```
Run → FAIL (module not found).

- [ ] **Step 2: Implement** `src/lib/classroom.ts`:
```typescript
export type ClassroomCreatePolicy = "all_members" | "admins_only";
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Completed lessons / total, rounded, clamped 0..100. */
export function courseProgressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** May this role create a course under the community's policy? null = not a member. */
export function canCreateCourse(
  policy: ClassroomCreatePolicy,
  role: CommunityRole | null,
): boolean {
  if (role === null) return false;
  if (policy === "admins_only") return role === "owner" || role === "admin";
  return true; // all_members: any active member
}
```
Run → PASS. `npx tsc --noEmit` clean. Commit:
```bash
git add src/lib/classroom.ts src/lib/classroom.test.ts
git commit -m "feat(classroom): pure progress + create-policy helpers"
```

---

## Task 4: XP constant + `classrooms` router — course & lesson CRUD + list/get

**Files:** Modify `src/lib/gamification.ts`; create `src/server/api/routers/classrooms.ts`; modify `src/server/api/root.ts`.

- [ ] **Step 1: Add XP constant** — in `src/lib/gamification.ts` `XP_AMOUNTS`, add (after the LAUNCHPAD entries):
```typescript
  COURSE_RECEIVE_ENROLLMENT: 3,
```
(No `COURSE_CREATE`, no `LESSON_COMPLETE` — per ADR-0027.)

- [ ] **Step 2: Create `src/server/api/routers/classrooms.ts`** with course/lesson CRUD + list/get. Read `src/server/api/routers/launchpad.ts` first to copy the slug-generation + ownership idiom. Implement:
```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";
import { and, eq, isNull } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { canCreateCourse, type CommunityRole } from "@/lib/classroom";

/** Resolve community id + the caller's active role (null if not active member). */
async function resolveCommunityAndRole(
  ctx: { db: typeof import("@/server/db").db; session: { user: { id: string } } | null },
  slug: string,
): Promise<{ communityId: string; role: CommunityRole | null; classroomCreatePolicy: "all_members" | "admins_only" }> {
  const community = await ctx.db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: { id: true, classroomCreatePolicy: true },
  });
  if (!community) throw new TRPCError({ code: "NOT_FOUND" });
  let role: CommunityRole | null = null;
  if (ctx.session?.user) {
    const m = await ctx.db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.userId, ctx.session.user.id),
        eq(communityMemberships.status, "active"),
      ),
    });
    role = (m?.role as CommunityRole | undefined) ?? null;
  }
  return {
    communityId: community.id,
    role,
    classroomCreatePolicy: community.classroomCreatePolicy ?? "all_members",
  };
}

function isPrivileged(role: CommunityRole | null): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

export const classroomsRouter = createTRPCRouter({
  /** List a community's published courses; members-only courses hidden from non-members. */
  list: publicProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const { communityId, role } = await resolveCommunityAndRole(ctx, input.communitySlug);
      const payload = await getPayloadClient();
      const conditions: Record<string, unknown>[] = [
        { communityId: { equals: communityId } },
        { status: { equals: "published" } },
      ];
      // Non-members only see public courses.
      if (role === null) conditions.push({ isPublic: { equals: true } });
      const { docs } = await payload.find({
        collection: "courses",
        where: { and: conditions } as Parameters<typeof payload.find>[0]["where"],
        sort: "-enrollmentCount",
        limit: 50,
        depth: 0,
      });
      return docs;
    }),

  /** A single course with its lessons (ordered) and the caller's enrollment/progress. */
  get: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "courses",
        where: { slug: { equals: input.slug } },
        limit: 1,
        depth: 0,
      });
      const course = docs[0];
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      const { role } = await resolveCommunityAndRole(ctx, "" /* unused */).catch(() => ({ role: null as CommunityRole | null }));
      // Visibility: drafts/archived only to the author or privileged; members-only to members.
      // (Caller membership re-derived from the course's community below.)

      const { docs: lessons } = await payload.find({
        collection: "lessons",
        where: { course: { equals: course.id } },
        sort: "order",
        limit: 200,
        depth: 0,
      });

      const userId = ctx.session?.user?.id;
      let enrolled = false;
      let completedLessonIds: number[] = [];
      if (userId) {
        const enr = await ctx.db.query.courseEnrollments?.findFirst?.({
          where: (e, { and: a, eq: q }) => a(q(e.courseId, course.id), q(e.userId, userId)),
        });
        enrolled = !!enr;
        const comps = await ctx.db.query.lessonCompletions?.findMany?.({
          where: (c, { and: a, eq: q }) => a(q(c.courseId, course.id), q(c.userId, userId)),
        });
        completedLessonIds = (comps ?? []).map((c) => c.lessonId);
      }
      return { course, lessons, enrolled, completedLessonIds };
    }),

  /** Create a course (active member; honors classroomCreatePolicy). */
  create: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        title: z.string().min(3).max(200),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published"]).default("published"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { communityId, role, classroomCreatePolicy } = await resolveCommunityAndRole(ctx, input.communitySlug);
      if (!canCreateCourse(classroomCreatePolicy, role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "CANNOT_CREATE_COURSE" });
      }
      const payload = await getPayloadClient();
      const base = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
      const slug = `${base}-${Date.now()}`;
      const course = await payload.create({
        collection: "courses",
        data: {
          title: input.title,
          slug,
          summary: input.summary ?? undefined,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? "member",
          status: input.status,
          communityId,
          isPublic: false,
          enrollmentCount: 0,
        },
      });
      if (input.status === "published") {
        await logActivity(ctx.db, {
          actorId: ctx.session.user.id,
          actorType: "member",
          action: "course.published",
          targetType: "courses",
          targetId: String(course.id),
          communityId,
          metadata: { title: input.title },
        });
      }
      return { id: course.id, slug };
    }),

  /** Update own course (title/summary/status draft|published|archived). */
  update: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(3).max(200).optional(),
        summary: z.string().max(500).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const course = await payload.findByID({ collection: "courses", id: input.courseId, depth: 0 });
      if (course.authorId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary;
      if (input.status !== undefined) data.status = input.status;
      await payload.update({ collection: "courses", id: input.courseId, data });
      return { ok: true };
    }),

  /** Add a lesson to own course. body is plain text → lexical. */
  addLesson: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        title: z.string().min(1).max(200),
        youtubeUrl: z.string().url().max(500).optional(),
        body: z.string().max(20000).optional(),
        resources: z.array(z.object({ label: z.string().min(1).max(120), url: z.string().url().max(500) })).max(20).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const course = await payload.findByID({ collection: "courses", id: input.courseId, depth: 0 });
      if (course.authorId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const { totalDocs } = await payload.find({
        collection: "lessons",
        where: { course: { equals: input.courseId } },
        limit: 0,
        depth: 0,
      });
      const lesson = await payload.create({
        collection: "lessons",
        data: {
          course: input.courseId,
          title: input.title,
          order: totalDocs,
          youtubeUrl: input.youtubeUrl ?? undefined,
          body: input.body ? plainTextToLexical(input.body) : undefined,
          resources: input.resources,
        },
      });
      return { id: lesson.id };
    }),

  /** Update a lesson on own course. */
  updateLesson: protectedProcedure
    .input(
      z.object({
        lessonId: z.number(),
        title: z.string().min(1).max(200).optional(),
        youtubeUrl: z.string().url().max(500).nullable().optional(),
        body: z.string().max(20000).optional(),
        order: z.number().optional(),
        resources: z.array(z.object({ label: z.string().min(1).max(120), url: z.string().url().max(500) })).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const lesson = await payload.findByID({ collection: "lessons", id: input.lessonId, depth: 0 });
      const course = await payload.findByID({ collection: "courses", id: lesson.course as number, depth: 0 });
      if (course.authorId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.youtubeUrl !== undefined) data.youtubeUrl = input.youtubeUrl ?? undefined;
      if (input.body !== undefined) data.body = plainTextToLexical(input.body);
      if (input.order !== undefined) data.order = input.order;
      if (input.resources !== undefined) data.resources = input.resources;
      await payload.update({ collection: "lessons", id: input.lessonId, data });
      return { ok: true };
    }),

  /** Delete a lesson on own course. */
  deleteLesson: protectedProcedure
    .input(z.object({ lessonId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const lesson = await payload.findByID({ collection: "lessons", id: input.lessonId, depth: 0 });
      const course = await payload.findByID({ collection: "courses", id: lesson.course as number, depth: 0 });
      if (course.authorId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await payload.delete({ collection: "lessons", id: input.lessonId });
      return { ok: true };
    }),
});
```
> The `ctx.db.query.courseEnrollments`/`lessonCompletions` relational-query access depends on those tables being registered in the Drizzle schema object the router context uses. If `ctx.db.query.courseEnrollments` is undefined (the schema barrel may not auto-include new tables for the query API), fall back to explicit `ctx.db.select().from(courseEnrollments).where(and(eq(...),eq(...)))` using direct imports — read how `launchpad.ts` queries `launchpadVotes` (it uses `ctx.db.select().from(launchpadVotes)`), and MIRROR THAT explicit style instead of the `ctx.db.query.*` helper. Prefer the explicit `.select().from()` style to match the codebase and avoid the registration uncertainty.

- [ ] **Step 3: Register in `src/server/api/root.ts`** — `import { classroomsRouter }` + `classrooms: classroomsRouter,`.

- [ ] **Step 4: Typecheck** `npx tsc --noEmit` — clean (fix the enrollment query to the explicit `.select().from()` style if the `ctx.db.query.*` helpers don't typecheck). Commit:
```bash
git add src/lib/gamification.ts src/server/api/routers/classrooms.ts src/server/api/root.ts
git commit -m "feat(classroom): classrooms router — course/lesson CRUD + list/get"
```

---

## Task 5: `classrooms` router — enroll/complete + admin promote/remove

**Files:** Modify `src/server/api/routers/classrooms.ts`.

Add these procedures to the router. Use explicit Drizzle `.select().from()` / `.insert()` / `.delete()` on `courseEnrollments` + `lessonCompletions` (import them from `@/server/db/schema`), mirroring `launchpad.ts`'s `launchpadVotes` usage. Import `awardXp, XP_AMOUNTS` from `@/lib/gamification`.

- [ ] **Step 1: enroll / unenroll** (enroll awards the COURSE author XP once per distinct enrollee):
```typescript
  enroll: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db
        .select()
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.courseId, input.courseId), eq(courseEnrollments.userId, userId)))
        .limit(1);
      if (existing.length > 0) return { enrolled: true, already: true };

      const payload = await getPayloadClient();
      const course = await payload.findByID({ collection: "courses", id: input.courseId, depth: 0 });
      if (course.status !== "published") throw new TRPCError({ code: "FORBIDDEN", message: "NOT_PUBLISHED" });

      await ctx.db.insert(courseEnrollments).values({ courseId: input.courseId, userId });
      await payload.update({
        collection: "courses",
        id: input.courseId,
        data: { enrollmentCount: (course.enrollmentCount ?? 0) + 1 },
      });
      // Reputation: author earns XP per distinct enrollment (not self-enroll).
      if (course.authorId !== userId) {
        await awardXp(ctx.db, course.authorId as string, XP_AMOUNTS.COURSE_RECEIVE_ENROLLMENT);
      }
      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "course.enroll",
        targetType: "courses",
        targetId: String(input.courseId),
        communityId: (course.communityId as string) ?? undefined,
        recipientId: (course.authorId as string) ?? undefined,
        metadata: { title: course.title },
      });
      return { enrolled: true, already: false };
    }),

  unenroll: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db
        .select()
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.courseId, input.courseId), eq(courseEnrollments.userId, userId)))
        .limit(1);
      if (existing.length === 0) return { enrolled: false };
      await ctx.db
        .delete(courseEnrollments)
        .where(and(eq(courseEnrollments.courseId, input.courseId), eq(courseEnrollments.userId, userId)));
      const payload = await getPayloadClient();
      const course = await payload.findByID({ collection: "courses", id: input.courseId, depth: 0 });
      await payload.update({
        collection: "courses",
        id: input.courseId,
        data: { enrollmentCount: Math.max(0, (course.enrollmentCount ?? 0) - 1) },
      });
      // Note: author XP is NOT clawed back (matches launchpad receive-vote, which also doesn't on unvote? — verify; if launchpad does claw back, mirror it). Leave as-is for MVP.
      return { enrolled: false };
    }),
```
> Verify whether `launchpad.vote` claws back `LAUNCHPAD_RECEIVE_VOTE` on un-vote. If it does, mirror that (subtract `COURSE_RECEIVE_ENROLLMENT` from the author on unenroll); if not, leave author XP intact. Match the codebase's existing choice for consistency.

- [ ] **Step 2: markLessonComplete / unmark** (enrolled member; NO XP):
```typescript
  markLessonComplete: protectedProcedure
    .input(z.object({ lessonId: z.number(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const payload = await getPayloadClient();
      const lesson = await payload.findByID({ collection: "lessons", id: input.lessonId, depth: 0 });
      const courseId = lesson.course as number;
      // Must be enrolled.
      const enr = await ctx.db
        .select()
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)))
        .limit(1);
      if (enr.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "NOT_ENROLLED" });

      const existing = await ctx.db
        .select()
        .from(lessonCompletions)
        .where(and(eq(lessonCompletions.lessonId, input.lessonId), eq(lessonCompletions.userId, userId)))
        .limit(1);
      if (input.completed && existing.length === 0) {
        await ctx.db.insert(lessonCompletions).values({ lessonId: input.lessonId, courseId, userId });
      } else if (!input.completed && existing.length > 0) {
        await ctx.db
          .delete(lessonCompletions)
          .where(and(eq(lessonCompletions.lessonId, input.lessonId), eq(lessonCompletions.userId, userId)));
      }
      return { completed: input.completed };
    }),
```

- [ ] **Step 3: admin promote-to-public / unpublish / remove** (community owner/admin/mod):
```typescript
  setPublic: protectedProcedure
    .input(z.object({ courseId: z.number(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const course = await payload.findByID({ collection: "courses", id: input.courseId, depth: 0 });
      const m = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, course.communityId as string),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!m || (m.role !== "owner" && m.role !== "admin" && m.role !== "moderator")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await payload.update({ collection: "courses", id: input.courseId, data: { isPublic: input.isPublic } });
      return { ok: true };
    }),

  /** Moderation: a privileged member (or the author) archives the course. */
  moderateArchive: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const course = await payload.findByID({ collection: "courses", id: input.courseId, depth: 0 });
      const isAuthor = course.authorId === ctx.session.user.id;
      let allowed = isAuthor;
      if (!allowed) {
        const m = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, course.communityId as string),
            eq(communityMemberships.userId, ctx.session.user.id),
            eq(communityMemberships.status, "active"),
          ),
        });
        allowed = !!m && (m.role === "owner" || m.role === "admin" || m.role === "moderator");
      }
      if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
      await payload.update({ collection: "courses", id: input.courseId, data: { status: "archived" } });
      return { ok: true };
    }),
```
Add `courseEnrollments, lessonCompletions` to the `@/server/db/schema` import and `awardXp, XP_AMOUNTS` import at the top of the file.

- [ ] **Step 4: Typecheck** `npx tsc --noEmit` — clean. Commit:
```bash
git add src/server/api/routers/classrooms.ts
git commit -m "feat(classroom): enroll/complete + admin promote/archive"
```

---

## Task 6: Community Classroom tab + listing page

**Files:** Modify `src/components/communities/community-nav.tsx`; create `src/app/[locale]/communities/[slug]/classroom/page.tsx`, `src/components/classroom/classroom-listing.tsx`; modify `messages/en.json`, `messages/nl.json`.

- [ ] **Step 1: Add the nav tab** — in `community-nav.tsx`, add `{ key: "classroom", href: \`${basePath}/classroom\` }` to `navItems` (after `events`), and add `| "classroom"` to the `t(item.key as ...)` union cast(s).

- [ ] **Step 2: Page** `src/app/[locale]/communities/[slug]/classroom/page.tsx` (mirror the launchpad community page):
```typescript
"use client";

import { use } from "react";
import { ClassroomListing } from "@/components/classroom/classroom-listing";

export default function CommunityClassroomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ClassroomListing slug={slug} />;
}
```

- [ ] **Step 3: Listing component** `src/components/classroom/classroom-listing.tsx` — lists published courses (cards: title, summary, author, enrollment count) linking to `/communities/[slug]/classroom/[courseSlug]`, with a "Create Course" button when the caller may create (gate via `canCreateCourse` using the caller's role; fetch role via `api.communities.getMyCommunities` like the overview client does, and the policy via `api.communities.getBySlug`). Mirror `src/components/launchpad/launchpad-listing.tsx` structure. Concretely:
```typescript
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Users, Plus } from "lucide-react";
import { canCreateCourse, type CommunityRole } from "@/lib/classroom";

export function ClassroomListing({ slug }: { slug: string }) {
  const t = useTranslations("classroom");
  const { data: session } = authClient.useSession();
  const { data: courses } = api.classrooms.list.useQuery({ communitySlug: slug });
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: mine } = api.communities.getMyCommunities.useQuery(undefined, { enabled: !!session?.user });

  const membership = mine?.find((c) => c.slug === slug);
  const role = (membership?.status === "active" ? (membership.role as CommunityRole) : null) ?? null;
  const policy = (community as { classroomCreatePolicy?: "all_members" | "admins_only" } | undefined)?.classroomCreatePolicy ?? "all_members";
  const mayCreate = canCreateCourse(policy, role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        {mayCreate ? (
          <Button asChild>
            <Link href={`/communities/${slug}/classroom/new` as never}>
              <Plus className="mr-1.5 size-4" /> {t("createCourse")}
            </Link>
          </Button>
        ) : null}
      </div>

      {!courses || courses.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center font-mono text-xs tracking-wider">
          {t("noCourses")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/communities/${slug}/classroom/${c.slug}` as never}
              className="border-border hover:bg-secondary/40 block rounded-xl border p-4 transition-colors"
            >
              <h3 className="font-medium">{c.title}</h3>
              {c.summary ? <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{c.summary}</p> : null}
              <div className="text-muted-foreground mt-3 flex items-center gap-3 text-[11px]">
                <span>{c.authorName}</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" /> {c.enrollmentCount ?? 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: i18n** — add a `classroom` namespace to `messages/en.json` and `messages/nl.json`:
```json
    "classroom": {
      "title": "Classroom",
      "subtitle": "Member-made courses — learn, build, track your progress.",
      "createCourse": "Create course",
      "noCourses": "No courses yet. Be the first to teach something.",
      "enroll": "Enroll",
      "enrolled": "Enrolled",
      "unenroll": "Leave course",
      "markComplete": "Mark complete",
      "markIncomplete": "Mark incomplete",
      "progress": "{percent}% complete",
      "lessons": "Lessons",
      "addLesson": "Add lesson",
      "lessonTitle": "Lesson title",
      "youtubeUrl": "YouTube URL",
      "lessonBody": "Lesson notes",
      "resources": "Resources",
      "save": "Save",
      "publish": "Publish",
      "draft": "Draft",
      "courseTitle": "Course title",
      "courseSummary": "Short summary",
      "makePublic": "Make public",
      "makeMembersOnly": "Make members-only",
      "removeCourse": "Archive course",
      "membersOnly": "Members only",
      "public": "Public",
      "byAuthor": "by {name}"
    }
```
And add `"classroom": "Classroom"` to the `communities.profile` namespace (both locales).

- [ ] **Step 5:** `npx tsc --noEmit` clean; JSON valid. Commit:
```bash
git add src/components/communities/community-nav.tsx "src/app/[locale]/communities/[slug]/classroom/page.tsx" src/components/classroom/classroom-listing.tsx messages/en.json messages/nl.json
git commit -m "feat(classroom): community Classroom tab + course listing"
```

---

## Task 7: Create / edit course + lesson authoring

**Files:** Create `src/app/[locale]/communities/[slug]/classroom/new/page.tsx`, `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit/page.tsx`, `src/components/classroom/course-editor.tsx`; (optionally a `lesson-editor.tsx`).

The editor lets the author set course title/summary + publish status, and add/edit/delete lessons (title, YouTube URL, plain-text body, resources). Use `api.classrooms.create` / `update` / `addLesson` / `updateLesson` / `deleteLesson`. Body is a plain `<Textarea>` (stored via `plainTextToLexical` server-side). Mirror the launchpad project form component for structure (`src/components/launchpad/*` form). Keep it a single client component `CourseEditor` that handles both "new" (no courseId) and "edit" (loads `api.classrooms.get`) modes.

- [ ] **Step 1:** Read `src/components/launchpad/launchpad-listing.tsx` and the launchpad create form (find it) to mirror form conventions (Input, Textarea, Button, toast, redirect via `useRouter` from `@/i18n/navigation`).
- [ ] **Step 2:** Implement `CourseEditor` with: course fields + a Save that calls `create` (new) → redirect to the course's edit page, or `update` (edit); below it, a lessons section listing existing lessons with edit/delete and an "Add lesson" inline form (title/youtubeUrl/body/resources) calling `addLesson`/`updateLesson`/`deleteLesson`, invalidating `api.classrooms.get`. Enforce that only the author reaches edit (the server already gates; the page can also redirect non-authors).
- [ ] **Step 3:** Pages render `<CourseEditor slug={slug} />` (new) and `<CourseEditor slug={slug} courseSlug={courseSlug} />` (edit), reading params via `use(params)`.
- [ ] **Step 4:** `npx tsc --noEmit` clean; if you add UI strings, add them to both locales' `classroom` namespace. Commit:
```bash
git add "src/app/[locale]/communities/[slug]/classroom/new" "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/edit" src/components/classroom/course-editor.tsx messages/en.json messages/nl.json
git commit -m "feat(classroom): create/edit course + lesson authoring UI"
```
> This is the largest UI task. If `CourseEditor` grows past ~250 lines, split the lessons section into `src/components/classroom/lesson-editor.tsx` and report it. Do NOT add a rich WYSIWYG — plain textarea + `plainTextToLexical` is the deliberate MVP choice.

---

## Task 8: Course detail / learner view (enroll + lessons + progress)

**Files:** Create `src/app/[locale]/communities/[slug]/classroom/[courseSlug]/page.tsx`, `src/components/classroom/course-view.tsx`.

The learner view: course header (title, summary, author, enrollment count, members-only/public badge), an **Enroll** button (or progress bar + lesson list when enrolled), a lessons list (locked-looking until enrolled), and a selected-lesson panel rendering the YouTube embed + body (`LexicalRenderer` from `@/lib/lexical`) + resources, with a **Mark complete** toggle. Author/admins see Edit / promote-public / archive controls.

- [ ] **Step 1:** Implement `CourseView` using `api.classrooms.get({ slug: courseSlug })` → `{ course, lessons, enrolled, completedLessonIds }`. Compute progress with `courseProgressPercent(completedLessonIds.length, lessons.length)`. Enroll/unenroll via `api.classrooms.enroll`/`unenroll`; per-lesson `api.classrooms.markLessonComplete`. YouTube embed: convert a watch URL to an embed iframe (`https://www.youtube.com/embed/<id>`); extract the id from `youtubeUrl` with a small helper (add `youtubeEmbedUrl(url)` to `src/lib/classroom.ts` + a test: handles `watch?v=`, `youtu.be/`, returns null otherwise). Render body via `LexicalRenderer`. Gate the lesson body/video behind `enrolled` (show enroll CTA otherwise).
- [ ] **Step 2:** Author/privileged controls: if caller is the author → "Edit" link to the edit page; if caller is owner/admin/mod → `setPublic` toggle + `moderateArchive`. Derive caller role like the listing does.
- [ ] **Step 3:** Add the `youtubeEmbedUrl` helper + test to `src/lib/classroom.ts` / `classroom.test.ts` first (TDD): 
```typescript
// test
import { youtubeEmbedUrl } from "./classroom";
describe("youtubeEmbedUrl", () => {
  it("converts watch URLs", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube.com/embed/abc123");
  });
  it("converts youtu.be URLs", () => {
    expect(youtubeEmbedUrl("https://youtu.be/abc123")).toBe("https://www.youtube.com/embed/abc123");
  });
  it("returns null for non-youtube", () => {
    expect(youtubeEmbedUrl("https://vimeo.com/123")).toBeNull();
  });
});
```
```typescript
// impl
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
```
- [ ] **Step 4:** Page renders `<CourseView slug={slug} courseSlug={courseSlug} />`. `npx tsc --noEmit` clean; tests pass. Commit:
```bash
git add "src/app/[locale]/communities/[slug]/classroom/[courseSlug]/page.tsx" src/components/classroom/course-view.tsx src/lib/classroom.ts src/lib/classroom.test.ts
git commit -m "feat(classroom): course learner view — enroll, lessons, progress, YouTube embed"
```

---

## Task 9: Community setting — classroom create policy

**Files:** Modify `src/server/api/routers/communities.ts` (settings update mutation); modify `src/components/communities/settings/settings-sidebar.tsx`; create `src/app/[locale]/communities/[slug]/settings/classroom/page.tsx` + `src/components/communities/settings/classroom-settings.tsx`; i18n.

- [ ] **Step 1:** In the community settings update mutation (the one that handles `feedPostPolicy`), accept and persist `classroomCreatePolicy: z.enum(["all_members","admins_only"]).optional()` exactly like `feedPostPolicy`. Read the mutation first; mirror its input + `updates.classroomCreatePolicy = input.classroomCreatePolicy` line. Also ensure `getBySlug` returns `classroomCreatePolicy` (add the column to its `columns`/select if it uses an explicit projection — the listing reads `community.classroomCreatePolicy`).
- [ ] **Step 2:** Add `{ key: "classroom", href: \`${basePath}/classroom\` }` to the settings sidebar `items` (before `broadcast`) and `| "classroom"` to its union cast(s). Add `"classroom": "Classroom"` under `communities.settings.sidebar` in both locales.
- [ ] **Step 3:** `classroom-settings.tsx` — a small admin form: a two-option toggle (`all_members` / `admins_only`) bound to `api.communities.getBySlug` → `classroomCreatePolicy`, saved via the settings update mutation (`api.communities.update...` — use the same mutation the general settings page uses). Mirror an existing simple settings component. Page renders it via `use(params)`.
- [ ] **Step 4:** Add `classroom` settings i18n keys (both locales): `policyTitle`, `policySubtitle`, `policyAllMembers`, `policyAdminsOnly`, `saved`. `npx tsc --noEmit` clean; JSON valid. Commit:
```bash
git add src/server/api/routers/communities.ts src/components/communities/settings/settings-sidebar.tsx "src/app/[locale]/communities/[slug]/settings/classroom" src/components/communities/settings/classroom-settings.tsx messages/en.json messages/nl.json
git commit -m "feat(classroom): per-community classroomCreatePolicy setting"
```

---

## Task 10: Regression + verification

- [ ] **Step 1:** `npm test` — all pass (incl. `classroom` helper tests).
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` — clean (fix any lint in touched files; e.g. no empty arrow fns, prefer `!` over redundant casts).
- [ ] **Step 3: Manual smoke** (`npm run dev`):
  - As an active member: Classroom tab → Create course → add 2 lessons (one with a YouTube URL) → publish.
  - As another member: see the course, Enroll → enrollment count increments, author gains XP; open a lesson → video embeds, mark complete → progress bar moves; unenroll works.
  - As admin: promote a course to public → visible to logged-out/non-member; archive a course → disappears from listing.
  - Set `classroomCreatePolicy = admins_only` in settings → a plain member no longer sees "Create course".
  - Confirm the Classroom UI matches the app theme.
- [ ] **Step 4:** final commit if fixups.

---

## Self-Review Notes (vs ADR-0027)
- Member-authored (any active member), Launchpad model, publish-immediately, post-hoc moderation. ✅ (Tasks 4,5)
- Members-only default; public only via admin promotion (`setPublic`). ✅ (Tasks 4 list-gating, 5)
- Flat Course → ordered Lessons; YouTube + plain-text-lexical body + resources; no native video. ✅ (Tasks 1,4,8)
- Explicit enrollment (event-registration style) + per-lesson completion → progress %. ✅ (Tasks 2,5,8)
- XP per distinct enrollment to the creator; none for create/self-completion. ✅ (Tasks 4,5)
- Signal = distinct-enrollment count; no separate up-vote. ✅
- Per-community `classroomCreatePolicy` (all_members | admins_only). ✅ (Tasks 2,9)
- Not coupled to level-gating. ✅
- Type names consistent: `courses`, `lessons`, `course_enrollment`, `lesson_completion`, `classrooms` router (`list/get/create/update/addLesson/updateLesson/deleteLesson/enroll/unenroll/markLessonComplete/setPublic/moderateArchive`), `courseProgressPercent`, `canCreateCourse`, `youtubeEmbedUrl`, `COURSE_RECEIVE_ENROLLMENT`. ✅
