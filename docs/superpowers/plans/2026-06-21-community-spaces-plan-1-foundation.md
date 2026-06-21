# Community Spaces — Plan 1: Foundation + Configurable Nav

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let community owners/admins decide which built-in surfaces appear in their community nav, in what order, and under what label — backed by a new `space` table that becomes the foundation for rooms (Plan 2) and posts/agents (Plan 3).

**Architecture:** Introduce one Drizzle table, `app.space`. v1 rows are all `kind='builtin'` — configurable pointers to the existing surfaces (forum / events / classroom / ideas / members); the underlying surface data is untouched. Seed the five defaults on community creation and backfill existing communities. The hardcoded `CommunityNav` surface tabs become DB-driven; a new **Compose** settings page drives enable/reorder/rename. No private-access mechanism yet — that is Plan 2.

**Tech Stack:** Next.js App Router, tRPC, Drizzle (`app` schema), Payload-style hand-written SQL migrations applied via `pnpm db:apply`, next-intl (en/nl), Vitest.

**Scope note:** This is Plan 1 of 3 from [the Spaces design spec](../specs/2026-06-21-spaces-design.md). Plan 2 = custom rooms + chat + per-room access (`requireSpaceAccess`, `spaceMembership`, `conversations.spaceId`). Plan 3 = posts-in-rooms (Payload `forum-threads.spaceId`) + resident agent. Do **not** build those here.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/server/db/schema.ts` | `spaces` table + relations | Modify |
| `src/migrations/20260621b_spaces.ts` | Create `app.space` table | Create |
| `src/migrations/20260621c_spaces_backfill.ts` | Seed defaults for existing communities | Create |
| `src/migrations/index.ts` | Register both migrations | Modify |
| `src/server/communities/space-defaults.ts` | Pure: built-in surface list + default row builder + label resolver | Create |
| `src/server/communities/space-defaults.test.ts` | Unit tests for the pure module | Create |
| `src/server/api/routers/spaces.ts` | `spaces` tRPC router (list / admin list / reorder / setEnabled / rename) | Create |
| `src/server/api/routers/spaces.integration.test.ts` | DB-gated integration test for list + mutations | Create |
| `src/server/api/root.ts` | Register `spacesRouter` | Modify |
| `src/server/api/routers/communities.ts` | Seed default spaces inside `create` | Modify |
| `src/components/communities/community-nav.tsx` | DB-driven surface tabs | Modify |
| `src/components/communities/settings/settings-sidebar.tsx` | Add "spaces" settings entry | Modify |
| `src/app/[locale]/communities/[slug]/settings/spaces/page.tsx` | Compose page route | Create |
| `src/components/communities/settings/compose-spaces.tsx` | Compose UI (enable/reorder/rename) | Create |
| `messages/en.json`, `messages/nl.json` | i18n keys | Modify |

---

## Task 1: Add the `spaces` table to the schema

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Add the table + relations**

Add this block immediately after the `communityMemberships` table definition (after its closing `);`, around line 3246). It mirrors the existing `appSchema.table` idiom (UUID PK via `$defaultFn`, `$type<>` enums, `index`/`uniqueIndex`):

```typescript
// Community Spaces — composable navigation surfaces + rooms (Slice 3, Plan 1).
// kind="builtin": a configurable pointer to an existing community surface
// (forum/events/classroom/ideas/members); the surface's data stays community-level.
// kind="room": (Plan 2) a real container with its own membership + chat/posts.
// `name` is an optional display override — for builtins, null means "use the
// default i18n label"; rooms set it at creation (enforced in the app layer).
export const spaces = appSchema.table(
  "space",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    kind: d
      .varchar({ length: 10 })
      .notNull()
      .default("builtin")
      .$type<"builtin" | "room">(),
    builtinSurface: d
      .varchar("builtin_surface", { length: 20 })
      .$type<"forum" | "events" | "classroom" | "ideas" | "members">(),
    name: d.text(),
    purpose: d.text(),
    slug: d.text().notNull(),
    position: d.integer().notNull().default(0),
    createdBy: d.varchar({ length: 255 }).references(() => user.id),
    archivedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    uniqueIndex("space_community_slug_uidx").on(t.communityId, t.slug),
    index("space_community_position_idx").on(t.communityId, t.position),
  ],
);

export const spacesRelations = relations(spaces, ({ one }) => ({
  community: one(communities, {
    fields: [spaces.communityId],
    references: [communities.id],
  }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors). The new table is exported and self-consistent.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(spaces): add space table to schema (Slice 3 Plan 1)"
```

---

## Task 2: Migration — create the `app.space` table

**Files:**
- Create: `src/migrations/20260621b_spaces.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

Create `src/migrations/20260621b_spaces.ts` (idempotent CREATE TABLE, schema-qualified FKs to `app.community` / `app.user`, mirroring `20260609a_hackathon_teams.ts`):

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Community Spaces (Slice 3, Plan 1) — the `space` table backs DB-driven
 * community navigation. v1 rows are all kind='builtin' (configurable pointers to
 * existing surfaces). Room-only columns (visibility, resident agent) arrive in a
 * later plan. DDL mirrors the Drizzle definition in src/server/db/schema.ts.
 * Idempotent so `payload migrate` is a safe no-op where already applied.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."space" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "kind" varchar(10) NOT NULL DEFAULT 'builtin',
      "builtin_surface" varchar(20),
      "name" text,
      "purpose" text,
      "slug" text NOT NULL,
      "position" integer NOT NULL DEFAULT 0,
      "created_by" varchar(255) REFERENCES "app"."user"("id"),
      "archived_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "space_community_slug_uidx"
      ON "app"."space" ("community_id", "slug");
    CREATE INDEX IF NOT EXISTS "space_community_position_idx"
      ON "app"."space" ("community_id", "position");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."space";`);
}
```

- [ ] **Step 2: Register the migration in `index.ts`**

In `src/migrations/index.ts`, add the import alongside the others (near the `20260621a_agent_webhook_status` import):

```typescript
import * as migration_20260621b_spaces from "./20260621b_spaces";
```

Then add this object to the **end** of the `migrations` array (after the `20260621a_agent_webhook_status` entry):

```typescript
  {
    up: migration_20260621b_spaces.up,
    down: migration_20260621b_spaces.down,
    name: "20260621b_spaces",
  },
```

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:apply`
Expected: Output reports `20260621b_spaces` applied (or "no pending" if already run). No error.

- [ ] **Step 4: Verify the table exists**

Create a throwaway check script `scripts/_check-space.ts`:

```typescript
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

const r = await db.execute(sql`SELECT to_regclass('app.space') AS t`);
console.log(r.rows);
process.exit(0);
```

Run: `pnpm tsx --env-file=.env scripts/_check-space.ts`
Expected: prints `[ { t: 'app.space' } ]` (not `null`). Then delete the script: `rm scripts/_check-space.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260621b_spaces.ts src/migrations/index.ts
git commit -m "feat(spaces): migration creating app.space table"
```

---

## Task 3: Pure module — built-in surfaces, default rows, label resolver

**Files:**
- Create: `src/server/communities/space-defaults.ts`
- Test: `src/server/communities/space-defaults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/communities/space-defaults.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  BUILTIN_SURFACES,
  buildDefaultSpaceRows,
  resolveSpaceLabel,
} from "./space-defaults";

describe("BUILTIN_SURFACES", () => {
  it("is the five surfaces in canonical nav order", () => {
    expect(BUILTIN_SURFACES).toEqual([
      "forum",
      "events",
      "classroom",
      "ideas",
      "members",
    ]);
  });
});

describe("buildDefaultSpaceRows", () => {
  it("returns one builtin row per surface, position-ordered, slug=surface", () => {
    const rows = buildDefaultSpaceRows("comm-1");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.builtinSurface)).toEqual(BUILTIN_SURFACES);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    for (const r of rows) {
      expect(r.communityId).toBe("comm-1");
      expect(r.kind).toBe("builtin");
      expect(r.slug).toBe(r.builtinSurface);
      expect(r.name).toBeNull();
    }
  });
});

describe("resolveSpaceLabel", () => {
  const t = (key: string) => `T:${key}`;

  it("uses the i18n default for a builtin with no override", () => {
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "forum", name: null },
        t,
      ),
    ).toBe("T:forum");
  });

  it("prefers an explicit name override", () => {
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "forum", name: "Discussions" },
        t,
      ),
    ).toBe("Discussions");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/server/communities/space-defaults.test.ts`
Expected: FAIL — cannot resolve module `./space-defaults`.

- [ ] **Step 3: Write the implementation**

Create `src/server/communities/space-defaults.ts`:

```typescript
/**
 * Pure helpers for community Spaces (Slice 3, Plan 1). No DB access here — these
 * are unit-testable building blocks used by the seed mutation, the backfill
 * migration, and the nav.
 */

export const BUILTIN_SURFACES = [
  "forum",
  "events",
  "classroom",
  "ideas",
  "members",
] as const;

export type BuiltinSurface = (typeof BUILTIN_SURFACES)[number];

/** Shape of a default builtin space row (pre-insert; id/createdAt are DB-filled). */
export interface DefaultSpaceRow {
  communityId: string;
  kind: "builtin";
  builtinSurface: BuiltinSurface;
  name: null;
  slug: BuiltinSurface;
  position: number;
}

/** The five default builtin spaces for a community, in canonical nav order. */
export function buildDefaultSpaceRows(communityId: string): DefaultSpaceRow[] {
  return BUILTIN_SURFACES.map((surface, position) => ({
    communityId,
    kind: "builtin" as const,
    builtinSurface: surface,
    name: null,
    slug: surface,
    position,
  }));
}

/** Minimal space shape the nav needs to compute a label. */
export interface LabelableSpace {
  kind: "builtin" | "room";
  builtinSurface: BuiltinSurface | null;
  name: string | null;
}

/**
 * Resolve the label shown in the nav: an explicit `name` override always wins;
 * otherwise a builtin falls back to its i18n key (forum/events/...). Rooms
 * (Plan 2) always carry a `name`, so the `?? ""` fallback is never hit there.
 */
export function resolveSpaceLabel(
  space: LabelableSpace,
  t: (key: BuiltinSurface) => string,
): string {
  if (space.name) return space.name;
  if (space.builtinSurface) return t(space.builtinSurface);
  return "";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/server/communities/space-defaults.test.ts`
Expected: PASS (3 files of assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/space-defaults.ts src/server/communities/space-defaults.test.ts
git commit -m "feat(spaces): pure defaults + label resolver (TDD)"
```

---

## Task 4: Seed default spaces on community creation

**Files:**
- Modify: `src/server/api/routers/communities.ts:336-366` (the `create` mutation)

- [ ] **Step 1: Add the import**

At the top of `src/server/api/routers/communities.ts`, add `spaces` to the existing schema import and import the builder. Update the schema import block (currently `communities, communityMemberships, communityInvites, memberProfiles, user`) to include `spaces`:

```typescript
import {
  communities,
  communityMemberships,
  communityInvites,
  memberProfiles,
  user,
  spaces,
} from "@/server/db/schema";
import { buildDefaultSpaceRows } from "@/server/communities/space-defaults";
```

- [ ] **Step 2: Insert default spaces after the owner membership**

In the `create` mutation, immediately after the `communityMemberships` insert (the `// Creator becomes owner` block ending at line 354) and before `logActivity`, add:

```typescript
      // Seed the default builtin spaces so the new community's nav is populated.
      await ctx.db
        .insert(spaces)
        .values(buildDefaultSpaceRows(community!.id));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. `buildDefaultSpaceRows` returns rows whose fields match the `spaces` insert type (`name: null` is valid for the nullable column).

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(spaces): seed default spaces on community create"
```

---

## Task 5: Backfill migration — seed defaults for existing communities

**Files:**
- Create: `src/migrations/20260621c_spaces_backfill.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the backfill migration**

Create `src/migrations/20260621c_spaces_backfill.ts`. It inserts the five builtin rows for every community that does not already have a space with that surface (idempotent via `NOT EXISTS`), generating UUIDs with `gen_random_uuid()`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Backfill default builtin spaces for communities that predate Slice 3 Plan 1.
 * For each (community × surface) pair, insert one builtin space if absent.
 * Idempotent: re-running inserts nothing. Position matches the canonical nav
 * order in src/server/communities/space-defaults.ts.
 */
const SURFACES: Array<{ surface: string; position: number }> = [
  { surface: "forum", position: 0 },
  { surface: "events", position: 1 },
  { surface: "classroom", position: 2 },
  { surface: "ideas", position: 3 },
  { surface: "members", position: 4 },
];

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { surface, position } of SURFACES) {
    await db.execute(sql`
      INSERT INTO "app"."space"
        ("id", "community_id", "kind", "builtin_surface", "slug", "position")
      SELECT
        gen_random_uuid()::text, c."id", 'builtin', ${surface}, ${surface}, ${position}
      FROM "app"."community" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "app"."space" s
        WHERE s."community_id" = c."id" AND s."builtin_surface" = ${surface}
      );
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Remove only backfilled builtin rows; leave any admin-created rows intact.
  await db.execute(
    sql`DELETE FROM "app"."space" WHERE "kind" = 'builtin';`,
  );
}
```

- [ ] **Step 2: Register the migration**

In `src/migrations/index.ts`, add the import:

```typescript
import * as migration_20260621c_spaces_backfill from "./20260621c_spaces_backfill";
```

And append to the **end** of the `migrations` array (after the `20260621b_spaces` entry):

```typescript
  {
    up: migration_20260621c_spaces_backfill.up,
    down: migration_20260621c_spaces_backfill.down,
    name: "20260621c_spaces_backfill",
  },
```

- [ ] **Step 3: Apply**

Run: `pnpm db:apply`
Expected: `20260621c_spaces_backfill` applied, no error.

- [ ] **Step 4: Verify every community has exactly 5 builtin spaces**

Create `scripts/_check-space-counts.ts`:

```typescript
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

// Any community whose builtin-space count is not exactly 5.
const r = await db.execute(sql`
  SELECT c.id, count(s.id) AS n
  FROM app.community c
  LEFT JOIN app.space s
    ON s.community_id = c.id AND s.kind = 'builtin'
  GROUP BY c.id
  HAVING count(s.id) <> 5
`);
console.log("communities NOT at 5 builtin spaces:", r.rows.length);
process.exit(0);
```

Run: `pnpm tsx --env-file=.env scripts/_check-space-counts.ts`
Expected: prints `communities NOT at 5 builtin spaces: 0`. Then `rm scripts/_check-space-counts.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260621c_spaces_backfill.ts src/migrations/index.ts
git commit -m "feat(spaces): backfill default spaces for existing communities"
```

---

## Task 6: The `spaces` tRPC router

**Files:**
- Create: `src/server/api/routers/spaces.ts`
- Modify: `src/server/api/root.ts`
- Test: `src/server/api/routers/spaces.integration.test.ts`

- [ ] **Step 1: Write the router**

Create `src/server/api/routers/spaces.ts`. `list` is public (the nav renders for logged-out visitors); the mutations and `listForAdmin` require owner/admin via `ctx.communityRole`:

```typescript
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  communityProcedure,
} from "@/server/api/trpc";
import { communities, spaces } from "@/server/db/schema";

/** Enabled spaces for the public nav, position-ordered. */
export const spacesRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db
        .select({
          id: spaces.id,
          kind: spaces.kind,
          builtinSurface: spaces.builtinSurface,
          name: spaces.name,
          slug: spaces.slug,
          position: spaces.position,
        })
        .from(spaces)
        .where(
          and(eq(spaces.communityId, community.id), isNull(spaces.archivedAt)),
        )
        .orderBy(asc(spaces.position));
    }),

  /** All spaces incl. disabled, for the admin Compose page. */
  listForAdmin: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rows = await ctx.db
        .select({
          id: spaces.id,
          kind: spaces.kind,
          builtinSurface: spaces.builtinSurface,
          name: spaces.name,
          slug: spaces.slug,
          position: spaces.position,
          archivedAt: spaces.archivedAt,
        })
        .from(spaces)
        .where(eq(spaces.communityId, ctx.community.id))
        .orderBy(asc(spaces.position));
      return rows.map((r) => ({ ...r, enabled: r.archivedAt === null }));
    }),

  /** Persist a new ordering: ids in display order → position = index. */
  reorder: communityProcedure
    .input(z.object({ slug: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await Promise.all(
        input.orderedIds.map((id, position) =>
          ctx.db
            .update(spaces)
            .set({ position })
            .where(
              and(eq(spaces.id, id), eq(spaces.communityId, ctx.community.id)),
            ),
        ),
      );
      return { success: true };
    }),

  /** Enable/disable a space (disable = archive; builtins only in Plan 1). */
  setEnabled: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({ archivedAt: input.enabled ? null : new Date() })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Set or clear the display-name override (null/empty resets to default). */
  rename: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        name: z.string().max(60).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trimmed = input.name?.trim();
      const [updated] = await ctx.db
        .update(spaces)
        .set({ name: trimmed && trimmed.length > 0 ? trimmed : null })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),
});
```

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import near the other router imports:

```typescript
import { spacesRouter } from "@/server/api/routers/spaces";
```

And add it inside the `createTRPCRouter({ ... })` call (next to `communities: communitiesRouter,`):

```typescript
  spaces: spacesRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Write a DB-gated integration test**

Create `src/server/api/routers/spaces.integration.test.ts`, following the opt-in DB gate from `src/server/agent/dispatch-immediate.integration.test.ts` (skips cleanly unless `RUN_DB=1` + a local DB):

```typescript
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

describe.skipIf(!RUN_DB)("spaces router [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    buildDefaultSpaceRows: typeof import("@/server/communities/space-defaults").buildDefaultSpaceRows;
  };
  let m: Mods;
  let communityId: string;
  let userId: string;

  beforeAll(async () => {
    const [{ db }, schema, { buildDefaultSpaceRows }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/communities/space-defaults"),
    ]);
    m = { db, schema, buildDefaultSpaceRows };
  });

  beforeEach(async () => {
    const { db, schema, buildDefaultSpaceRows } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    userId = `sp-owner-${suffix}`;
    await db.insert(schema.user).values({
      id: userId,
      email: `sp-${suffix}@example.test`,
      name: "Spaces Owner",
    });
    const [c] = await db
      .insert(schema.communities)
      .values({
        name: `Spaces Test ${suffix}`,
        slug: `spaces-test-${suffix}`,
        createdBy: userId,
      })
      .returning();
    communityId = c!.id;
    await db.insert(schema.spaces).values(buildDefaultSpaceRows(communityId));
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.spaces).where(eq(schema.spaces.communityId, communityId));
    await db.delete(schema.communities).where(eq(schema.communities.id, communityId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("seeds five ordered builtin spaces", async () => {
    const { db, schema } = m;
    const { eq, asc } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.spaces)
      .where(eq(schema.spaces.communityId, communityId))
      .orderBy(asc(schema.spaces.position));
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.builtinSurface)).toEqual([
      "forum",
      "events",
      "classroom",
      "ideas",
      "members",
    ]);
  });

  it("archiving a space hides it from an enabled-only query", async () => {
    const { db, schema } = m;
    const { eq, and, isNull } = await import("drizzle-orm");
    const [forum] = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.communityId, communityId),
          eq(schema.spaces.builtinSurface, "forum"),
        ),
      );
    await db
      .update(schema.spaces)
      .set({ archivedAt: new Date() })
      .where(eq(schema.spaces.id, forum!.id));
    const enabled = await db
      .select()
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.communityId, communityId),
          isNull(schema.spaces.archivedAt),
        ),
      );
    expect(enabled).toHaveLength(4);
  });
});
```

- [ ] **Step 5: Run the test (skips without a local DB)**

Run: `pnpm test src/server/api/routers/spaces.integration.test.ts`
Expected: PASS — either 2 tests green (if `RUN_DB_TESTS=1` + local DB) or "skipped" (default). Neither errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/spaces.ts src/server/api/root.ts src/server/api/routers/spaces.integration.test.ts
git commit -m "feat(spaces): spaces tRPC router (list/admin/reorder/setEnabled/rename)"
```

---

## Task 7: Make the community nav DB-driven

**Files:**
- Modify: `src/components/communities/community-nav.tsx`

- [ ] **Step 1: Replace the hardcoded surface tabs with a query**

Rewrite `src/components/communities/community-nav.tsx`. The `overview` tab and the role-gated tabs (`referrals`, `insights`, `rituals`, `settings`) stay hardcoded; only the five surface tabs come from `api.spaces.list`. Labels use `resolveSpaceLabel`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  resolveSpaceLabel,
  type BuiltinSurface,
} from "@/server/communities/space-defaults";

interface CommunityNavProps {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

interface NavItem {
  key: string;
  href: string;
  label: string;
}

export function CommunityNav({ slug, memberRole }: CommunityNavProps) {
  const t = useTranslations("communities.profile");
  const pathname = usePathname();

  const basePath = `/communities/${slug}`;
  const isAdminOrOwner = memberRole === "owner" || memberRole === "admin";

  const { data: spaceTabs } = api.spaces.list.useQuery({ slug });

  const surfaceItems: NavItem[] = (spaceTabs ?? [])
    .filter((s) => s.kind === "builtin" && s.builtinSurface)
    .map((s) => ({
      key: `space-${s.id}`,
      href: `${basePath}/${s.slug}`,
      label: resolveSpaceLabel(
        { kind: s.kind, builtinSurface: s.builtinSurface, name: s.name },
        (k: BuiltinSurface) => t(k),
      ),
    }));

  const navItems: NavItem[] = [
    { key: "overview", href: basePath, label: t("overview") },
    ...surfaceItems,
    ...(memberRole
      ? [{ key: "referrals", href: `${basePath}/referrals`, label: t("referrals") }]
      : []),
    ...(isAdminOrOwner || memberRole === "moderator"
      ? [
          { key: "insights", href: `${basePath}/insights`, label: t("insights") },
          { key: "rituals", href: `${basePath}/rituals`, label: t("rituals") },
        ]
      : []),
    ...(isAdminOrOwner
      ? [{ key: "settings", href: `${basePath}/settings`, label: t("settings") }]
      : []),
  ];

  return (
    <div className="bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-12 z-40 border-b backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <nav
          className="-mb-px flex gap-1 overflow-x-auto"
          aria-label="Community navigation"
        >
          {navItems.map((item) => {
            const isActive =
              item.key === "overview"
                ? pathname === basePath || pathname === `${basePath}/`
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.key}
                href={item.href as never}
                className={cn(
                  "border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`t` from `communities.profile` accepts the builtin-surface keys, which already exist in that namespace.)

- [ ] **Step 3: Manual smoke (defer full QA to Task 10)**

Run: `pnpm dev`, open a community page. The nav still shows Overview · Forum · Events · Classroom · Ideas · Members plus role tabs — now sourced from the DB. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/community-nav.tsx
git commit -m "feat(spaces): DB-driven community nav surface tabs"
```

---

## Task 8: The admin "Compose" settings page

**Files:**
- Modify: `src/components/communities/settings/settings-sidebar.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/spaces/page.tsx`
- Create: `src/components/communities/settings/compose-spaces.tsx`

- [ ] **Step 1: Add the sidebar entry**

In `src/components/communities/settings/settings-sidebar.tsx`, add a `spaces` item to the `items` array (after `general`):

```typescript
    { key: "general", href: `${basePath}/general` },
    { key: "spaces", href: `${basePath}/spaces` },
```

Then add `"spaces"` to BOTH `t(item.key as ...)` union casts (desktop + mobile), e.g.:

```typescript
              item.key as
                | "general"
                | "spaces"
                | "members"
                | "invites"
                | "rules"
                | "topics"
                | "links"
                | "classroom"
                | "broadcast"
                | "autonomy"
                | "acquire"
                | "integrations"
                | "ownership",
```

- [ ] **Step 2: Create the Compose UI component**

Create `src/components/communities/settings/compose-spaces.tsx`. It lists spaces with an enable toggle, up/down reorder, and inline rename. (Up/down keeps Plan 1 dependency-free; drag-and-drop can come later.)

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  resolveSpaceLabel,
  type BuiltinSurface,
} from "@/server/communities/space-defaults";

export function ComposeSpaces({ slug }: { slug: string }) {
  const t = useTranslations("communities.spaces");
  const tProfile = useTranslations("communities.profile");
  const utils = api.useUtils();

  const { data: spaces, isLoading } = api.spaces.listForAdmin.useQuery({ slug });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const invalidate = async () => {
    await Promise.all([
      utils.spaces.listForAdmin.invalidate({ slug }),
      utils.spaces.list.invalidate({ slug }),
    ]);
  };

  const setEnabled = api.spaces.setEnabled.useMutation({ onSuccess: invalidate });
  const reorder = api.spaces.reorder.useMutation({ onSuccess: invalidate });
  const rename = api.spaces.rename.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      await invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  const ordered = spaces ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...ordered];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate({ slug, orderedIds: next.map((s) => s.id) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <ul className="divide-y rounded-lg border">
        {ordered.map((space, index) => {
          const label = resolveSpaceLabel(
            {
              kind: space.kind,
              builtinSurface: space.builtinSurface,
              name: space.name,
            },
            (k: BuiltinSurface) => tProfile(k),
          );
          return (
            <li key={space.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  aria-label={t("moveUp")}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={t("moveDown")}
                  disabled={index === ordered.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editingId === space.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder={label}
                      maxLength={60}
                      className="h-8"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        rename.mutate({
                          slug,
                          spaceId: space.id,
                          name: draftName,
                        })
                      }
                      disabled={rename.isPending}
                    >
                      {t("save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-sm font-medium hover:underline"
                    onClick={() => {
                      setEditingId(space.id);
                      setDraftName(space.name ?? "");
                    }}
                  >
                    {label}
                  </button>
                )}
              </div>

              <Switch
                checked={space.enabled}
                onCheckedChange={(checked) =>
                  setEnabled.mutate({
                    slug,
                    spaceId: space.id,
                    enabled: checked,
                  })
                }
                aria-label={t("enabledToggle")}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

> If `@/components/ui/switch` does not exist, run `pnpm dlx shadcn@latest add switch` first, or substitute a `Button` toggle. Verify by checking `src/components/ui/switch.tsx`.

- [ ] **Step 3: Create the page route**

Create `src/app/[locale]/communities/[slug]/settings/spaces/page.tsx` (mirrors the `general` page structure):

```typescript
"use client";

import { use } from "react";
import { ComposeSpaces } from "@/components/communities/settings/compose-spaces";

export default function SpacesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ComposeSpaces slug={slug} />;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (after Task 9 adds the i18n keys, the `t(...)` calls resolve at runtime; typecheck passes regardless since next-intl keys are not statically typed here).

- [ ] **Step 5: Commit**

```bash
git add "src/components/communities/settings/settings-sidebar.tsx" "src/app/[locale]/communities/[slug]/settings/spaces/page.tsx" "src/components/communities/settings/compose-spaces.tsx"
git commit -m "feat(spaces): admin Compose settings page (toggle/reorder/rename)"
```

---

## Task 9: i18n keys (en + nl)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add the `spaces` namespace and sidebar key (English)**

In `messages/en.json`, inside the `communities` object, add a `spaces` key:

```json
    "spaces": {
      "title": "Spaces",
      "description": "Choose which surfaces appear in your community, their order, and their labels.",
      "save": "Save",
      "cancel": "Cancel",
      "moveUp": "Move up",
      "moveDown": "Move down",
      "enabledToggle": "Toggle visibility",
      "enabled": "Shown",
      "disabled": "Hidden"
    }
```

And inside `communities.settings.sidebar`, add the `spaces` label (next to `general`):

```json
        "spaces": "Spaces",
```

- [ ] **Step 2: Add the same keys to Dutch**

In `messages/nl.json`, inside `communities`, add:

```json
    "spaces": {
      "title": "Ruimtes",
      "description": "Kies welke onderdelen in je community verschijnen, hun volgorde en hun labels.",
      "save": "Opslaan",
      "cancel": "Annuleren",
      "moveUp": "Omhoog",
      "moveDown": "Omlaag",
      "enabledToggle": "Zichtbaarheid wisselen",
      "enabled": "Zichtbaar",
      "disabled": "Verborgen"
    }
```

And inside `communities.settings.sidebar`:

```json
        "spaces": "Ruimtes",
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "require('./messages/en.json'); require('./messages/nl.json'); console.log('ok')"`
Expected: prints `ok` (both files are valid JSON).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(spaces): i18n keys for Compose page (en+nl)"
```

---

## Task 10: Whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS. (Integration DB test skips unless `RUN_DB_TESTS=1`.)

- [ ] **Step 2: Live QA**

Run `pnpm dev`, sign in as an owner/admin (`dev@aitcommunity.local` / `devpassword123`), then verify:
- Community nav renders the five surface tabs from the DB (Overview · Forum · Events · Classroom · Ideas · Members + role tabs).
- Go to `/communities/<slug>/settings/spaces`: the Compose page lists all five spaces.
- Toggle "Events" off → it disappears from the community nav (refresh the community page).
- Reorder (move Ideas above Forum) → nav order updates.
- Rename "Forum" to "Discussions" → nav shows "Discussions"; clear the name → reverts to "Forum".
- A logged-out visitor to the community still sees the enabled tabs (the `list` query is public).

- [ ] **Step 3: Confirm no regression for non-admins**

As a plain member (or logged out), confirm `/settings/spaces` is not reachable (the settings layout already gates on owner/admin) and the nav renders normally.

- [ ] **Step 4: Final commit (if any QA fixes were needed)**

```bash
git add -A && git commit -m "fix(spaces): Plan 1 QA adjustments"
```

---

## Self-review checklist (completed by plan author)

- **Spec coverage (Plan 1 slice):** `space` table ✅ (T1/T2); seed on create ✅ (T4); backfill existing ✅ (T5); DB-driven nav ✅ (T7); admin compose enable/reorder/rename ✅ (T6/T8); i18n ✅ (T9). Deferred-by-design to Plan 2/3: `requireSpaceAccess`, `spaceMembership`, room visibility, `conversations.spaceId`/`forum-threads.spaceId`, resident agent, Lobby directory redesign.
- **No placeholders:** every code step contains full source; commands have expected output.
- **Type consistency:** `buildDefaultSpaceRows` / `resolveSpaceLabel` / `BuiltinSurface` are defined in Task 3 and consumed unchanged in Tasks 4, 7, 8. Router field names (`enabled`, `archivedAt`, `orderedIds`, `spaceId`) are consistent between Task 6 and Task 8.
- **Migration ordering:** `20260621b_spaces` (DDL) precedes `20260621c_spaces_backfill` (data) in `index.ts`; backfill is idempotent via `NOT EXISTS`.
