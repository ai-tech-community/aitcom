# Hackathon Organizer & Judge Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Workers must NOT run `git checkout` / `git switch`.** All work happens on the current branch `feat/hackathon-organizer-and-judge-roles` (already cut off `main`). The orchestrator owns the branch.

**Goal:** Add per-hackathon **organizer** (delegated event management) and **judge** (rank submitted teams + per-team comments) roles, where judges decide the authoritative final ranking when present.

**Architecture:** One shared Drizzle grant table `app.hackathon_staff` (role discriminator `organizer | judge`) plus a `app.judge_ranking` table, gated by a new pure capability resolver layered over the existing `isCommunityHackathonAdmin` (ADR-0031). A new "judging" lifecycle phase sits between roster-lock and finalize; `finalizeHackathon` branches to a Borda-style judge aggregation (reusing the existing deterministic tiebreaks in `scoring.ts`) when judges are assigned, otherwise keeps the automated path untouched.

**Tech Stack:** Next.js App Router (RSC + client islands), tRPC v11 + React Query v5, Drizzle (`app` pgSchema), Payload CMS (hand-written migrations + `payload generate:types`), Vitest, next-intl, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-13-hackathon-organizer-and-judge-roles-design.md`

---

## File Structure

**New files:**
- `src/server/hackathon/staff-roles.ts` — pure capability resolver + grant predicates (db-free, mirrors `community-admin.ts`).
- `src/server/hackathon/staff-roles.test.ts` — unit tests for the resolver.
- `src/server/hackathon/judge-aggregation.ts` — pure `aggregateJudgeRankings` (db-free, sibling to `scoring.ts`).
- `src/server/hackathon/judge-aggregation.test.ts` — unit tests for aggregation.
- `src/migrations/20260613a_hackathon_staff.ts` — creates `app.hackathon_staff`.
- `src/migrations/20260613b_judge_rankings.ts` — creates `app.judge_ranking`.
- `src/migrations/20260613c_challenge_judging_opened.ts` — adds `judging_opened_at` to the Payload `challenges` table.
- `src/components/hackathon/manage/manage-staff.tsx` — staffing UI (organizers + judges lists).
- `src/app/[locale]/communities/[slug]/events/[eventSlug]/judge/page.tsx` — judge workspace (server gate + island).
- `src/components/hackathon/judge/judge-workspace.tsx` — judge ranking client island.

**Modified files:**
- `src/server/db/schema.ts` — add `hackathonStaff`, `judgeRankings` tables + relations.
- `src/migrations/index.ts` — register the three new migrations.
- `src/collections/Challenges.ts` — add `judgingOpenedAt` field.
- `src/server/api/routers/hackathon.ts` — new gates, staff/judging procedures, finalize judge-branch.
- `src/server/hackathon/load-manage.ts` — surface staff + judging-progress to manage tabs; widen gate to organizers.
- `src/components/hackathon/manage/manage-setup.tsx` — embed `ManageStaff`.
- `src/components/hackathon/manage/manage-lifecycle.tsx` — "Open judging" action + judging progress.
- `src/server/hackathon/hackathon-phase.ts` (the `hackathonPhase` helper) — add `judging` phase.

---

## STAGE 1 — Shared staff grant: schema, migration, pure resolver, gates

### Task 1: Pure capability resolver (TDD)

**Files:**
- Create: `src/server/hackathon/staff-roles.ts`
- Test: `src/server/hackathon/staff-roles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/staff-roles.test.ts
import { describe, it, expect } from "vitest";
import {
  hasActiveGrant,
  resolveHackathonCapability,
  type StaffGrantRow,
} from "./staff-roles";

const admin = { status: "active", role: "admin" as const };
const member = { status: "active", role: "member" as const };
const organizerGrant: StaffGrantRow = { role: "organizer", revokedAt: null };
const judgeGrant: StaffGrantRow = { role: "judge", revokedAt: null };
const revokedJudge: StaffGrantRow = { role: "judge", revokedAt: new Date() };

describe("hasActiveGrant", () => {
  it("is true for a matching active grant", () => {
    expect(hasActiveGrant([judgeGrant], "judge")).toBe(true);
  });
  it("ignores revoked grants", () => {
    expect(hasActiveGrant([revokedJudge], "judge")).toBe(false);
  });
  it("is false when the role is absent", () => {
    expect(hasActiveGrant([organizerGrant], "judge")).toBe(false);
  });
});

describe("resolveHackathonCapability", () => {
  it("returns 'admin' for an active community owner/admin regardless of grants", () => {
    expect(resolveHackathonCapability(admin, [judgeGrant])).toBe("admin");
  });
  it("returns 'organizer' for a non-admin with an active organizer grant", () => {
    expect(resolveHackathonCapability(member, [organizerGrant])).toBe(
      "organizer",
    );
  });
  it("prefers 'organizer' over 'judge' when both grants are held", () => {
    expect(
      resolveHackathonCapability(member, [organizerGrant, judgeGrant]),
    ).toBe("organizer");
  });
  it("returns 'judge' for a non-admin with only an active judge grant", () => {
    expect(resolveHackathonCapability(member, [judgeGrant])).toBe("judge");
  });
  it("returns null for a plain member with no active grants", () => {
    expect(resolveHackathonCapability(member, [revokedJudge])).toBe(null);
  });
  it("returns null for no membership and no grants", () => {
    expect(resolveHackathonCapability(null, [])).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/hackathon/staff-roles.test.ts`
Expected: FAIL — `Cannot find module './staff-roles'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/server/hackathon/staff-roles.ts
// Pure per-hackathon role math (per-hackathon staff grants). Db-free so it is
// unit-testable; the tRPC gates do the membership + grant lookups and call these.
import {
  isCommunityHackathonAdmin,
  type MembershipRow,
} from "./community-admin";

export type StaffRole = "organizer" | "judge";

export interface StaffGrantRow {
  role: StaffRole;
  revokedAt: Date | null;
}

export type HackathonCapability = "admin" | "organizer" | "judge" | null;

/** True iff `grants` contains a non-revoked grant of `role`. */
export function hasActiveGrant(
  grants: StaffGrantRow[],
  role: StaffRole,
): boolean {
  return grants.some((g) => g.role === role && g.revokedAt === null);
}

/**
 * Highest management capability the user holds for one hackathon:
 * community owner/admin > organizer grant > judge grant > none.
 * NOTE: ranking is gated on `hasActiveGrant(grants, "judge")` directly — an
 * admin is NOT implicitly a judge.
 */
export function resolveHackathonCapability(
  membership: MembershipRow | null | undefined,
  grants: StaffGrantRow[],
): HackathonCapability {
  if (isCommunityHackathonAdmin(membership ?? null)) return "admin";
  if (hasActiveGrant(grants, "organizer")) return "organizer";
  if (hasActiveGrant(grants, "judge")) return "judge";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/hackathon/staff-roles.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/staff-roles.ts src/server/hackathon/staff-roles.test.ts
git commit -m "feat(hackathon): pure per-hackathon staff capability resolver"
```

---

### Task 2: `hackathon_staff` Drizzle table + relations

**Files:**
- Modify: `src/server/db/schema.ts` (add after the `teamsRelations` block, ~line 1570)

- [ ] **Step 1: Add the table + relations**

Insert after `teamsRelations` in `src/server/db/schema.ts`:

```typescript
// Per-hackathon staff grants: organizer (delegated event management) or judge
// (rank submitted teams). Keyed on challengeId (the hackathon discriminator),
// like teams/enrollments. Soft-revoked via revokedAt.
export const hackathonStaff = appSchema.table(
  "hackathon_staff",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    role: d
      .varchar({ length: 20 })
      .notNull()
      .$type<"organizer" | "judge">(),
    grantedBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    grantedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    revokedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("hackathon_staff_challenge_idx").on(t.challengeId),
    index("hackathon_staff_user_idx").on(t.userId),
    uniqueIndex("hackathon_staff_challenge_user_role_uidx").on(
      t.challengeId,
      t.userId,
      t.role,
    ),
  ],
);

export const hackathonStaffRelations = relations(hackathonStaff, ({ one }) => ({
  user: one(user, {
    fields: [hackathonStaff.userId],
    references: [user.id],
  }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no usages yet; this only adds definitions). If `crypto` is flagged, confirm other tables in this file use `crypto.randomUUID()` the same way (they do — `teams.id`).

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(hackathon): hackathon_staff drizzle table"
```

---

### Task 3: `hackathon_staff` migration

**Files:**
- Create: `src/migrations/20260613a_hackathon_staff.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

```typescript
// src/migrations/20260613a_hackathon_staff.ts
// Per-hackathon staff grants (organizer | judge). Mirrors the Drizzle def in
// src/server/db/schema.ts (hackathonStaff). Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hackathon_staff" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL,
      "granted_by" varchar(255) NOT NULL,
      "granted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "revoked_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "hackathon_staff_challenge_idx" ON "app"."hackathon_staff" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "hackathon_staff_user_idx" ON "app"."hackathon_staff" ("user_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_staff_challenge_user_role_uidx" ON "app"."hackathon_staff" ("challenge_id","user_id","role");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."hackathon_staff";`);
}
```

- [ ] **Step 2: Register the migration**

In `src/migrations/index.ts`, add the import alongside the other `20260612*` imports:

```typescript
import * as migration_20260613a_hackathon_staff from "./20260613a_hackathon_staff";
```

And add to the `migrations` array (keep chronological order, after the last `20260612*` entry):

```typescript
  {
    up: migration_20260613a_hackathon_staff.up,
    down: migration_20260613a_hackathon_staff.down,
    name: "20260613a_hackathon_staff",
  },
```

- [ ] **Step 3: Typecheck (do NOT run db:apply — author only)**

Run: `pnpm typecheck`
Expected: PASS. Per repo convention, migrations are committed but applied separately via `pnpm db:apply` by the operator — do not apply in this session.

- [ ] **Step 4: Commit**

```bash
git add src/migrations/20260613a_hackathon_staff.ts src/migrations/index.ts
git commit -m "feat(hackathon): migration for hackathon_staff table"
```

---

### Task 4: Grant lookup + gates in the router

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add near `requireHackathonOperator`, ~line 161)

- [ ] **Step 1: Add the imports**

At the top of `src/server/api/routers/hackathon.ts`, extend the existing schema import to include `hackathonStaff`, and import the resolver. The file already imports `communityMemberships`, `teams`, etc. from the schema and `isCommunityHackathonAdmin`; add:

```typescript
import { hackathonStaff } from "@/server/db/schema";
import {
  hasActiveGrant,
  resolveHackathonCapability,
  type StaffGrantRow,
} from "@/server/hackathon/staff-roles";
```

(If the schema import is a single `import { ... } from "@/server/db/schema"` block, add `hackathonStaff` to it rather than a second import.)

- [ ] **Step 2: Add the grant loader + gates**

Insert after `requireHackathonOperator` (~line 161):

```typescript
/** Active (non-revoked) staff grants for one user on one hackathon. */
async function loadHackathonGrants(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
): Promise<StaffGrantRow[]> {
  const rows = await db
    .select({ role: hackathonStaff.role, revokedAt: hackathonStaff.revokedAt })
    .from(hackathonStaff)
    .where(
      and(
        eq(hackathonStaff.challengeId, challengeId),
        eq(hackathonStaff.userId, userId),
      ),
    );
  return rows as StaffGrantRow[];
}

/** Load the caller's community membership for a challenge (null for Hub-wide). */
async function loadMembershipForChallenge(
  db: typeof import("@/server/db").db,
  communityId: string | null | undefined,
  userId: string,
) {
  if (!communityId) return null;
  return (
    (await db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userId, userId),
      ),
    })) ?? null
  );
}

/**
 * Organizer-tier gate: community owner/admin, the Hub-wide sponsor, OR an active
 * organizer grant. Used for Setup/Tasks/Analytics + opening judging. Returns the
 * challenge doc.
 */
async function requireHackathonOrganizer(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const challenge = await loadChallenge(challengeId);
  const membership = await loadMembershipForChallenge(
    db,
    challenge.communityId,
    userId,
  );
  const grants = await loadHackathonGrants(db, challengeId, userId);
  const capability = resolveHackathonCapability(membership, grants);
  const isHubSponsor =
    !challenge.communityId && challenge.creatorId === userId;
  if (capability === "admin" || capability === "organizer" || isHubSponsor) {
    return challenge;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only an organizer or community admin can manage this hackathon",
  });
}

/** Judge-tier gate: an active judge grant is required (admins are not implicitly judges). */
async function requireHackathonJudge(
  db: typeof import("@/server/db").db,
  challengeId: number,
  userId: string,
) {
  const challenge = await loadChallenge(challengeId);
  const grants = await loadHackathonGrants(db, challengeId, userId);
  if (!hasActiveGrant(grants, "judge")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an assigned judge can rank this hackathon",
    });
  }
  return challenge;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (Gates are defined but not yet wired into procedures — that happens in Stage 2/3.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): organizer + judge gates and grant loader"
```

---

## STAGE 2 — Organizer surface: staff procedures + manage gate + staffing UI

### Task 5: `grantStaff` / `revokeStaff` / `listStaff` procedures

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add new procedures inside the router object)

- [ ] **Step 1: Add the three procedures**

Inside the `hackathonRouter` object (alongside `lockRosters`), add:

```typescript
listStaff: protectedProcedure
  .input(z.object({ challengeId: z.number() }))
  .query(async ({ ctx, input }) => {
    await requireHackathonOrganizer(ctx.db, input.challengeId, ctx.session.user.id);
    const rows = await ctx.db
      .select({
        id: hackathonStaff.id,
        userId: hackathonStaff.userId,
        role: hackathonStaff.role,
        revokedAt: hackathonStaff.revokedAt,
        grantedAt: hackathonStaff.grantedAt,
      })
      .from(hackathonStaff)
      .where(eq(hackathonStaff.challengeId, input.challengeId));
    const active = rows.filter((r) => r.revokedAt === null);
    return {
      organizers: active.filter((r) => r.role === "organizer"),
      judges: active.filter((r) => r.role === "judge"),
    };
  }),

grantStaff: protectedProcedure
  .input(
    z.object({
      challengeId: z.number(),
      userId: z.string(),
      role: z.enum(["organizer", "judge"]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const actorId = ctx.session.user.id;
    // Granting organizers is admin-only; granting judges is organizer-or-admin.
    if (input.role === "organizer") {
      await requireCommunityHackathonAdmin(ctx.db, input.challengeId, actorId);
    } else {
      await requireHackathonOrganizer(ctx.db, input.challengeId, actorId);
    }
    const challenge = await loadChallenge(input.challengeId);
    // Re-grant after revoke: reactivate the existing row rather than violating
    // the (challenge_id, user_id, role) unique index.
    const [existing] = await ctx.db
      .select({ id: hackathonStaff.id })
      .from(hackathonStaff)
      .where(
        and(
          eq(hackathonStaff.challengeId, input.challengeId),
          eq(hackathonStaff.userId, input.userId),
          eq(hackathonStaff.role, input.role),
        ),
      )
      .limit(1);
    if (existing) {
      await ctx.db
        .update(hackathonStaff)
        .set({ revokedAt: null, grantedBy: actorId, grantedAt: new Date() })
        .where(eq(hackathonStaff.id, existing.id));
    } else {
      await ctx.db.insert(hackathonStaff).values({
        challengeId: input.challengeId,
        userId: input.userId,
        role: input.role,
        grantedBy: actorId,
      });
    }
    await ctx.db.insert(notifications).values({
      userId: input.userId,
      type: "hackathon_staff_grant",
      title: input.role === "organizer" ? "You're now an organizer" : "You're now a judge",
      content: `You were added as ${input.role === "organizer" ? "an organizer" : "a judge"} for "${challenge.title}".`,
      metadata: { challengeId: String(input.challengeId), role: input.role },
      communityId: challenge.communityId ?? null,
    });
    return { ok: true };
  }),

revokeStaff: protectedProcedure
  .input(
    z.object({
      challengeId: z.number(),
      userId: z.string(),
      role: z.enum(["organizer", "judge"]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const actorId = ctx.session.user.id;
    if (input.role === "organizer") {
      await requireCommunityHackathonAdmin(ctx.db, input.challengeId, actorId);
    } else {
      await requireHackathonOrganizer(ctx.db, input.challengeId, actorId);
    }
    await ctx.db
      .update(hackathonStaff)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(hackathonStaff.challengeId, input.challengeId),
          eq(hackathonStaff.userId, input.userId),
          eq(hackathonStaff.role, input.role),
          isNull(hackathonStaff.revokedAt),
        ),
      );
    return { ok: true };
  }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. `notifications`, `loadChallenge`, `requireCommunityHackathonAdmin`, `and`, `eq`, `isNull` are already imported/defined in this file (verify the schema import line includes `notifications`; it is used by `finalizeHackathon`).

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): grant/revoke/list staff procedures"
```

---

### Task 6: Widen manage-tab gate to organizers + surface staff list

**Files:**
- Modify: `src/server/hackathon/load-manage.ts`

- [ ] **Step 1: Replace the admin-only gate with an organizer-tier gate**

In `loadManageData`, the current gate is:

```typescript
const membership = await db.query.communityMemberships.findFirst({
  where: and(
    eq(communityMemberships.communityId, community.id),
    eq(communityMemberships.userId, userId),
  ),
});
if (!isCommunityHackathonAdmin(membership ?? null)) {
  redirect(`/communities/${slug}/events`);
}
```

This gate runs BEFORE the event/challenge is resolved, so we don't yet have `challengeId`. Move the gate to AFTER `challenge` is loaded (just below the `payload.findByID({ collection: "challenges", ... })` call) and replace it with a capability check. Delete the early membership/gate block above, and after `const challenge = await payload.findByID(...)` add:

```typescript
const grants = await db
  .select({
    role: hackathonStaff.role,
    revokedAt: hackathonStaff.revokedAt,
  })
  .from(hackathonStaff)
  .where(
    and(
      eq(hackathonStaff.challengeId, Number(challenge.id)),
      eq(hackathonStaff.userId, userId),
    ),
  );
const capability = resolveHackathonCapability(
  membership ?? null,
  grants as StaffGrantRow[],
);
const isHubSponsor = !challenge.communityId && challenge.creatorId === userId;
if (capability === null && !isHubSponsor) {
  redirect(`/communities/${slug}/events`);
}
const isAdmin = capability === "admin" || isHubSponsor;
```

Keep the `membership` lookup (move it down to just before the `grants` query if needed so both are available). Add imports at top:

```typescript
import { hackathonStaff } from "@/server/db/schema";
import {
  resolveHackathonCapability,
  type StaffGrantRow,
} from "@/server/hackathon/staff-roles";
```

- [ ] **Step 2: Add `isAdmin` + staff to the returned `ManageData`**

Extend the `ManageData` interface (top of file) and the returned object with:

```typescript
// in ManageData interface:
isAdmin: boolean;
// in the returned object:
isAdmin,
```

This lets the UI show/hide admin-only controls (organizer management, lock/finalize) vs organizer-visible controls.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. Fix any consumer of `ManageData` that destructures it exhaustively.

- [ ] **Step 4: Commit**

```bash
git add src/server/hackathon/load-manage.ts
git commit -m "feat(hackathon): organizers can open the manage tabs"
```

---

### Task 7: Staffing UI on the Setup tab

**Files:**
- Create: `src/components/hackathon/manage/manage-staff.tsx`
- Modify: `src/components/hackathon/manage/manage-setup.tsx`
- Modify: `src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx`

- [ ] **Step 1: Build the staffing island**

```typescript
// src/components/hackathon/manage/manage-staff.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";

export function ManageStaff({
  challengeId,
  isAdmin,
}: {
  challengeId: number;
  isAdmin: boolean;
}) {
  const utils = api.useUtils();
  const staff = api.hackathon.listStaff.useQuery({ challengeId });
  const [organizerId, setOrganizerId] = useState("");
  const [judgeId, setJudgeId] = useState("");

  const grant = api.hackathon.grantStaff.useMutation({
    onSuccess: () => {
      void utils.hackathon.listStaff.invalidate({ challengeId });
      setOrganizerId("");
      setJudgeId("");
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = api.hackathon.revokeStaff.useMutation({
    onSuccess: () => void utils.hackathon.listStaff.invalidate({ challengeId }),
    onError: (e) => toast.error(e.message),
  });

  if (staff.isLoading || !staff.data) return null;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <section>
          <h3 className="font-medium">Organizers</h3>
          <ul className="mt-2 space-y-1">
            {staff.data.organizers.map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span>{o.userId}</span>
                <button
                  className="text-sm text-red-600"
                  onClick={() =>
                    revoke.mutate({ challengeId, userId: o.userId, role: "organizer" })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className="border px-2 py-1"
              placeholder="user id"
              value={organizerId}
              onChange={(e) => setOrganizerId(e.target.value)}
            />
            <button
              disabled={!organizerId || grant.isPending}
              onClick={() =>
                grant.mutate({ challengeId, userId: organizerId, role: "organizer" })
              }
            >
              Add organizer
            </button>
          </div>
        </section>
      )}

      <section>
        <h3 className="font-medium">Judges</h3>
        <ul className="mt-2 space-y-1">
          {staff.data.judges.map((j) => (
            <li key={j.id} className="flex items-center justify-between">
              <span>{j.userId}</span>
              <button
                className="text-sm text-red-600"
                onClick={() =>
                  revoke.mutate({ challengeId, userId: j.userId, role: "judge" })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="border px-2 py-1"
            placeholder="user id"
            value={judgeId}
            onChange={(e) => setJudgeId(e.target.value)}
          />
          <button
            disabled={!judgeId || grant.isPending}
            onClick={() => grant.mutate({ challengeId, userId: judgeId, role: "judge" })}
          >
            Add judge
          </button>
        </div>
      </section>
    </div>
  );
}
```

> NOTE: the plain `user id` text input is a deliberate v1 placeholder. A community-member picker is a follow-up; the procedure already validates the actor's authority, and an invalid id simply yields no grant the user can see. Flag this in the PR description.

- [ ] **Step 2: Embed in the Setup tab**

In `src/components/hackathon/manage/manage-setup.tsx`, add `isAdmin: boolean` to the component's prop type, import `ManageStaff`, and render it at the bottom of the returned JSX:

```typescript
import { ManageStaff } from "./manage-staff";
// ...inside the returned JSX, after the existing form:
<ManageStaff challengeId={challengeId} isAdmin={isAdmin} />
```

- [ ] **Step 3: Pass `isAdmin` from the page**

In `manage/page.tsx`, add `isAdmin={data.isAdmin}` to the `<ManageSetup ... />` props.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. Manual check (after `pnpm dev` + `pnpm db:apply`): as a community admin, the Setup tab shows Organizers + Judges lists; adding/removing updates the list.

- [ ] **Step 5: Commit**

```bash
git add src/components/hackathon/manage/manage-staff.tsx src/components/hackathon/manage/manage-setup.tsx "src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx"
git commit -m "feat(hackathon): staffing UI on the manage Setup tab"
```

---

## STAGE 3 — Judge surface: judging table, lifecycle phase, workspace

### Task 8: `judge_ranking` table + migration

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/migrations/20260613b_judge_rankings.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Add the Drizzle table**

After `hackathonStaffRelations` in `schema.ts`:

```typescript
// A judge's verdict on one team: ordinal rank (1 = best) + optional comment.
// One row per (challenge, judge, team).
export const judgeRankings = appSchema.table(
  "judge_ranking",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(),
    judgeUserId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    rank: d.integer().notNull(),
    comment: d.text(),
    submittedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("judge_ranking_challenge_idx").on(t.challengeId),
    index("judge_ranking_team_idx").on(t.teamId),
    uniqueIndex("judge_ranking_challenge_judge_team_uidx").on(
      t.challengeId,
      t.judgeUserId,
      t.teamId,
    ),
  ],
);

export const judgeRankingsRelations = relations(judgeRankings, ({ one }) => ({
  team: one(teams, {
    fields: [judgeRankings.teamId],
    references: [teams.id],
  }),
}));
```

- [ ] **Step 2: Write the migration**

```typescript
// src/migrations/20260613b_judge_rankings.ts
// Human judge rankings + per-team comments. Mirrors judgeRankings in schema.ts.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."judge_ranking" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "judge_user_id" varchar(255) NOT NULL,
      "team_id" varchar(255) NOT NULL,
      "rank" integer NOT NULL,
      "comment" text,
      "submitted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "judge_ranking_challenge_idx" ON "app"."judge_ranking" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "judge_ranking_team_idx" ON "app"."judge_ranking" ("team_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "judge_ranking_challenge_judge_team_uidx" ON "app"."judge_ranking" ("challenge_id","judge_user_id","team_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."judge_ranking";`);
}
```

- [ ] **Step 3: Register the migration** in `src/migrations/index.ts` (import + array entry `20260613b_judge_rankings`, after `20260613a`).

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/server/db/schema.ts src/migrations/20260613b_judge_rankings.ts src/migrations/index.ts
git commit -m "feat(hackathon): judge_ranking table + migration"
```

---

### Task 9: `judgingOpenedAt` on the challenge + `judging` phase

**Files:**
- Modify: `src/collections/Challenges.ts`
- Create: `src/migrations/20260613c_challenge_judging_opened.ts`
- Modify: `src/migrations/index.ts`
- Modify: `src/server/hackathon/hackathon-phase.ts`

> Reference: `src/migrations/20260609d_challenge_team_config_and_cell_template.ts` is the precedent for adding a Payload `challenges` field via hand-written migration — open it to confirm the exact table name/schema the `challenges` collection maps to, and mirror its ALTER TABLE.

- [ ] **Step 1: Add the Payload field**

In `src/collections/Challenges.ts`, add (near `rankingMode`, sidebar):

```typescript
{
  name: "judgingOpenedAt",
  type: "date",
  admin: {
    position: "sidebar",
    readOnly: true,
    description: "Set when an organizer opens judging; gates judge ranking.",
  },
},
```

- [ ] **Step 2: Write the migration**

Mirror the table name from `20260609d` (Payload `challenges` table). Using the same qualified name that migration used:

```typescript
// src/migrations/20260613c_challenge_judging_opened.ts
// Adds judging_opened_at to the Payload challenges table (gates judge ranking).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "judging_opened_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "challenges" DROP COLUMN IF EXISTS "judging_opened_at";
  `);
}
```

> If `20260609d` qualified the table differently (e.g. `"public"."challenges"`), match it exactly.

- [ ] **Step 3: Register the migration** (`20260613c_challenge_judging_opened`).

- [ ] **Step 4: Regenerate Payload types**

Run: `pnpm payload generate:types`
Expected: `src/payload-types.ts` gains `judgingOpenedAt?: string | null` on the `Challenge` type. Commit the regenerated file.

- [ ] **Step 5: Add the `judging` phase**

In `src/server/hackathon/hackathon-phase.ts`, the phase function currently returns `"draft" | "live" | "locked" | "finalized"`. Add `"judging"` to the union and the rule: a hackathon is in `judging` when it would otherwise be `locked` AND `judgingOpenedAt` is set AND it is not finalized. Extend the input to accept `judgingOpenedAt: Date | string | null`:

```typescript
// inside hackathonPhase, before returning "locked":
if (judgingOpenedAt) return "judging";
```

Update callers (`load-manage.ts` passes `challenge` data — add `judgingOpenedAt: challenge.judgingOpenedAt ?? null` to the `hackathonPhase({...})` call and to `ManageData.phase`'s union everywhere it is typed).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS (resolve all `phase` union widenings the compiler flags).

```bash
git add src/collections/Challenges.ts src/migrations/20260613c_challenge_judging_opened.ts src/migrations/index.ts src/payload-types.ts src/server/hackathon/hackathon-phase.ts src/server/hackathon/load-manage.ts
git commit -m "feat(hackathon): judgingOpenedAt field + judging lifecycle phase"
```

---

### Task 10: Judging procedures — open, list teams, submit rankings

**Files:**
- Modify: `src/server/api/routers/hackathon.ts`

- [ ] **Step 1: Add `openJudging`**

```typescript
openJudging: protectedProcedure
  .input(z.object({ challengeId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    await requireHackathonOrganizer(ctx.db, input.challengeId, ctx.session.user.id);
    const payload = await getPayloadClient();
    await payload.update({
      collection: "challenges",
      id: input.challengeId,
      data: { judgingOpenedAt: new Date().toISOString() },
    });
    return { ok: true };
  }),
```

(Use whatever Payload client accessor this router already uses — `getPayloadClient()` per `load-manage.ts`; import it if not present.)

- [ ] **Step 2: Add `judgeableTeams`** (judge-only; submitted teams + reference automated score)

```typescript
judgeableTeams: protectedProcedure
  .input(z.object({ challengeId: z.number() }))
  .query(async ({ ctx, input }) => {
    await requireHackathonJudge(ctx.db, input.challengeId, ctx.session.user.id);
    const rows = await ctx.db
      .select({
        teamId: teams.id,
        name: teams.name,
        artifactUrl: teams.artifactUrl,
        artifactSummary: teams.artifactSummary,
        score: teams.score,
        submittedAt: teams.submittedAt,
      })
      .from(teams)
      .where(
        and(
          eq(teams.challengeId, input.challengeId),
          isNotNull(teams.submittedAt),
        ),
      );
    const mine = await ctx.db
      .select({
        teamId: judgeRankings.teamId,
        rank: judgeRankings.rank,
        comment: judgeRankings.comment,
      })
      .from(judgeRankings)
      .where(
        and(
          eq(judgeRankings.challengeId, input.challengeId),
          eq(judgeRankings.judgeUserId, ctx.session.user.id),
        ),
      );
    const byTeam = new Map(mine.map((m) => [m.teamId, m]));
    return rows.map((t) => ({
      ...t,
      myRank: byTeam.get(t.teamId)?.rank ?? null,
      myComment: byTeam.get(t.teamId)?.comment ?? null,
    }));
  }),
```

- [ ] **Step 3: Add `submitRankings`** (validates distinct ranks over exactly the submitted teams; judging window only)

```typescript
submitRankings: protectedProcedure
  .input(
    z.object({
      challengeId: z.number(),
      rankings: z
        .array(
          z.object({
            teamId: z.string(),
            rank: z.number().int().positive(),
            comment: z.string().max(2000).optional(),
          }),
        )
        .min(1),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const judgeId = ctx.session.user.id;
    const challenge = await requireHackathonJudge(ctx.db, input.challengeId, judgeId);
    if (!challenge.judgingOpenedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Judging is not open yet" });
    }
    // Must cover exactly the submitted teams, with distinct ranks.
    const submitted = await ctx.db
      .select({ teamId: teams.id })
      .from(teams)
      .where(
        and(eq(teams.challengeId, input.challengeId), isNotNull(teams.submittedAt)),
      );
    const submittedIds = new Set(submitted.map((t) => t.teamId));
    const givenIds = new Set(input.rankings.map((r) => r.teamId));
    if (
      submittedIds.size !== givenIds.size ||
      [...givenIds].some((id) => !submittedIds.has(id))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Rank every submitted team exactly once",
      });
    }
    const ranks = input.rankings.map((r) => r.rank);
    if (new Set(ranks).size !== ranks.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Ranks must be distinct" });
    }
    await ctx.db.transaction(async (tx) => {
      await tx
        .delete(judgeRankings)
        .where(
          and(
            eq(judgeRankings.challengeId, input.challengeId),
            eq(judgeRankings.judgeUserId, judgeId),
          ),
        );
      await tx.insert(judgeRankings).values(
        input.rankings.map((r) => ({
          challengeId: input.challengeId,
          judgeUserId: judgeId,
          teamId: r.teamId,
          rank: r.rank,
          comment: r.comment ?? null,
        })),
      );
    });
    return { ok: true };
  }),
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. Ensure `judgeRankings`, `isNotNull`, `getPayloadClient` are imported.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): openJudging + judgeableTeams + submitRankings"
```

---

### Task 11: Judge workspace page + island

**Files:**
- Create: `src/app/[locale]/communities/[slug]/events/[eventSlug]/judge/page.tsx`
- Create: `src/components/hackathon/judge/judge-workspace.tsx`

- [ ] **Step 1: Server page (gate + resolve challengeId)**

```typescript
// src/app/[locale]/communities/[slug]/events/[eventSlug]/judge/page.tsx
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { getSession } from "@/server/auth";
import { getPayloadClient } from "@/server/payload";
import { communities } from "@/server/db/schema";
import { hackathonStaff } from "@/server/db/schema";
import { hasActiveGrant, type StaffGrantRow } from "@/server/hackathon/staff-roles";
import { JudgeWorkspace } from "@/components/hackathon/judge/judge-workspace";

export default async function JudgePage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) redirect(`/communities/${slug}/events`);

  const community = await db.query.communities.findFirst({
    where: eq(communities.slug, slug),
  });
  if (!community) notFound();

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: eventSlug }, communityId: { equals: community.id } },
    limit: 1,
  });
  const event = docs[0];
  if (!event?.challengeId) notFound();
  const challengeId = Number(event.challengeId);

  const grants = await db
    .select({ role: hackathonStaff.role, revokedAt: hackathonStaff.revokedAt })
    .from(hackathonStaff)
    .where(
      and(
        eq(hackathonStaff.challengeId, challengeId),
        eq(hackathonStaff.userId, userId),
      ),
    );
  if (!hasActiveGrant(grants as StaffGrantRow[], "judge")) {
    redirect(`/communities/${slug}/events`);
  }

  return <JudgeWorkspace challengeId={challengeId} />;
}
```

> Match the actual import paths used elsewhere for `getSession`, `getPayloadClient`, and `db` (copy them verbatim from `src/server/hackathon/load-manage.ts`).

- [ ] **Step 2: Client island**

```typescript
// src/components/hackathon/judge/judge-workspace.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";

export function JudgeWorkspace({ challengeId }: { challengeId: number }) {
  const teams = api.hackathon.judgeableTeams.useQuery({ challengeId });
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!teams.data) return;
    setRanks(
      Object.fromEntries(
        teams.data.map((t) => [t.teamId, t.myRank ? String(t.myRank) : ""]),
      ),
    );
    setComments(
      Object.fromEntries(teams.data.map((t) => [t.teamId, t.myComment ?? ""])),
    );
  }, [teams.data]);

  const submit = api.hackathon.submitRankings.useMutation({
    onSuccess: () => toast.success("Rankings submitted"),
    onError: (e) => toast.error(e.message),
  });

  if (teams.isLoading || !teams.data) return null;
  if (teams.data.length === 0) return <p>No submitted teams to judge yet.</p>;

  return (
    <div className="space-y-4">
      {teams.data.map((t) => (
        <div key={t.teamId} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <strong>{t.name}</strong>
            <span className="text-sm text-muted-foreground">
              auto score: {t.score ?? 0}
            </span>
          </div>
          {t.artifactUrl && (
            <a className="text-sm text-blue-600" href={t.artifactUrl} target="_blank" rel="noreferrer">
              View artifact
            </a>
          )}
          {t.artifactSummary && <p className="text-sm">{t.artifactSummary}</p>}
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={1}
              className="w-20 border px-2 py-1"
              placeholder="rank"
              value={ranks[t.teamId] ?? ""}
              onChange={(e) =>
                setRanks((r) => ({ ...r, [t.teamId]: e.target.value }))
              }
            />
            <input
              className="flex-1 border px-2 py-1"
              placeholder="comment (optional)"
              value={comments[t.teamId] ?? ""}
              onChange={(e) =>
                setComments((c) => ({ ...c, [t.teamId]: e.target.value }))
              }
            />
          </div>
        </div>
      ))}
      <button
        disabled={submit.isPending}
        onClick={() =>
          submit.mutate({
            challengeId,
            rankings: teams.data!.map((t) => ({
              teamId: t.teamId,
              rank: Number(ranks[t.teamId]),
              comment: comments[t.teamId] || undefined,
            })),
          })
        }
      >
        Submit rankings
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. Manual (after `pnpm db:apply` + grant yourself a judge role + open judging): the page lists submitted teams with auto-score reference; submitting distinct ranks succeeds; non-distinct ranks or partial coverage shows the validation error toast.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/events/[eventSlug]/judge/page.tsx" src/components/hackathon/judge/judge-workspace.tsx
git commit -m "feat(hackathon): judge workspace page + ranking island"
```

---

## STAGE 4 — Aggregation, finalize judge-branch, team feedback

### Task 12: `aggregateJudgeRankings` pure function (TDD)

**Files:**
- Create: `src/server/hackathon/judge-aggregation.ts`
- Test: `src/server/hackathon/judge-aggregation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/judge-aggregation.test.ts
import { describe, it, expect } from "vitest";
import { aggregateJudgeRankings } from "./judge-aggregation";

const ref = {
  automatedScores: new Map<string, number>(),
  submittedAt: new Map<string, Date>(),
};

describe("aggregateJudgeRankings", () => {
  it("ranks by mean judge rank, lower mean first", () => {
    const out = aggregateJudgeRankings(
      [
        { judgeUserId: "j1", teamId: "a", rank: 1 },
        { judgeUserId: "j1", teamId: "b", rank: 2 },
        { judgeUserId: "j2", teamId: "a", rank: 2 },
        { judgeUserId: "j2", teamId: "b", rank: 1 },
        { judgeUserId: "j3", teamId: "a", rank: 1 },
        { judgeUserId: "j3", teamId: "b", rank: 2 },
      ],
      ref.automatedScores,
      ref.submittedAt,
    );
    // a: mean (1+2+1)/3=1.33 ; b: (2+1+2)/3=1.67 → a first
    expect(out).toEqual([
      { teamId: "a", finalRank: 1 },
      { teamId: "b", finalRank: 2 },
    ]);
  });

  it("breaks a mean-rank tie by higher automated score", () => {
    const out = aggregateJudgeRankings(
      [
        { judgeUserId: "j1", teamId: "a", rank: 1 },
        { judgeUserId: "j1", teamId: "b", rank: 2 },
        { judgeUserId: "j2", teamId: "a", rank: 2 },
        { judgeUserId: "j2", teamId: "b", rank: 1 },
      ],
      new Map([
        ["a", 10],
        ["b", 99],
      ]),
      new Map(),
    );
    // both mean 1.5 → higher auto score (b) wins
    expect(out.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("breaks a full tie by earliest submission, then teamId", () => {
    const out = aggregateJudgeRankings(
      [
        { judgeUserId: "j1", teamId: "b", rank: 1 },
        { judgeUserId: "j1", teamId: "a", rank: 2 },
        { judgeUserId: "j2", teamId: "b", rank: 2 },
        { judgeUserId: "j2", teamId: "a", rank: 1 },
      ],
      new Map([
        ["a", 5],
        ["b", 5],
      ]),
      new Map([
        ["a", new Date("2026-06-13T10:00:00Z")],
        ["b", new Date("2026-06-13T09:00:00Z")],
      ]),
    );
    // mean tie, auto tie → earliest submission (b) wins
    expect(out.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("ignores teams with no judge rankings", () => {
    const out = aggregateJudgeRankings(
      [{ judgeUserId: "j1", teamId: "a", rank: 1 }],
      new Map(),
      new Map(),
    );
    expect(out).toEqual([{ teamId: "a", finalRank: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/hackathon/judge-aggregation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/hackathon/judge-aggregation.ts
// Pure Borda-style aggregation of human judge rankings into a final order.
// Lower mean rank wins; ties break by higher automated verification score, then
// earliest submission, then teamId (mirrors the deterministic chain in scoring.ts).

export interface JudgeRankRow {
  judgeUserId: string;
  teamId: string;
  rank: number;
}

export interface AggregatedTeam {
  teamId: string;
  finalRank: number;
}

export function aggregateJudgeRankings(
  rankings: JudgeRankRow[],
  automatedScores: Map<string, number>,
  submittedAt: Map<string, Date>,
): AggregatedTeam[] {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of rankings) {
    const cur = sums.get(r.teamId) ?? { total: 0, count: 0 };
    cur.total += r.rank;
    cur.count += 1;
    sums.set(r.teamId, cur);
  }

  const teams = [...sums.entries()].map(([teamId, { total, count }]) => ({
    teamId,
    mean: total / count,
  }));

  teams.sort((a, b) => {
    if (a.mean !== b.mean) return a.mean - b.mean; // lower mean rank first
    const sa = automatedScores.get(a.teamId) ?? 0;
    const sb = automatedScores.get(b.teamId) ?? 0;
    if (sb !== sa) return sb - sa; // higher automated score first
    const ta = submittedAt.get(a.teamId);
    const tb = submittedAt.get(b.teamId);
    if (ta && tb) {
      const d = ta.getTime() - tb.getTime();
      if (d !== 0) return d; // earliest submission first
    }
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });

  return teams.map((t, i) => ({ teamId: t.teamId, finalRank: i + 1 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/hackathon/judge-aggregation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/judge-aggregation.ts src/server/hackathon/judge-aggregation.test.ts
git commit -m "feat(hackathon): pure judge-ranking aggregation"
```

---

### Task 13: Finalize judge-branch

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (the `finalizeHackathon` mutation)

- [ ] **Step 1: Compute judge-driven ranks when judges exist**

In `finalizeHackathon`, after `scoreByTeam` is built and BEFORE the existing `const ranked = rankTeams(...)`, insert a branch that overrides `ranked` when active judges are assigned and have ranked. Add the imports `judgeRankings`, `hackathonStaff`, and `aggregateJudgeRankings` at the top.

Replace:

```typescript
const submitted = challengeTeams.filter((t) => t.submittedAt !== null);
const ranked = rankTeams(
  submitted.map((t) => ({
    teamId: t.id,
    score: scoreByTeam.get(t.id) ?? 0,
    submittedAt: t.submittedAt,
  })),
  rankingMode,
);
```

with:

```typescript
const submitted = challengeTeams.filter((t) => t.submittedAt !== null);

// Judge-driven path: if this hackathon has any active judge grants, their
// aggregated ranking is authoritative; otherwise keep the automated ranking.
const activeJudges = await ctx.db
  .select({ userId: hackathonStaff.userId })
  .from(hackathonStaff)
  .where(
    and(
      eq(hackathonStaff.challengeId, input.challengeId),
      eq(hackathonStaff.role, "judge"),
      isNull(hackathonStaff.revokedAt),
    ),
  );

let ranked: { teamId: string; rank: number }[];
if (activeJudges.length > 0) {
  const rankingRows = await ctx.db
    .select({
      judgeUserId: judgeRankings.judgeUserId,
      teamId: judgeRankings.teamId,
      rank: judgeRankings.rank,
    })
    .from(judgeRankings)
    .where(eq(judgeRankings.challengeId, input.challengeId));
  const judgesWhoRanked = new Set(rankingRows.map((r) => r.judgeUserId));
  const allRanked = activeJudges.every((j) => judgesWhoRanked.has(j.userId));
  if (!allRanked) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "All assigned judges must submit rankings before finalizing (or revoke a non-responsive judge).",
    });
  }
  const submittedAtMap = new Map(
    submitted
      .filter((t) => t.submittedAt !== null)
      .map((t) => [t.id, t.submittedAt as Date]),
  );
  ranked = aggregateJudgeRankings(rankingRows, scoreByTeam, submittedAtMap).map(
    (r) => ({ teamId: r.teamId, rank: r.finalRank }),
  );
} else {
  ranked = rankTeams(
    submitted.map((t) => ({
      teamId: t.id,
      score: scoreByTeam.get(t.id) ?? 0,
      submittedAt: t.submittedAt,
    })),
    rankingMode,
  );
}
```

The rest of `finalizeHackathon` (writing `score`/`finalRank`, prize idempotency, certificates) is unchanged — it consumes `ranked` and `rankByTeam` exactly as before. `score` stays the automated reference; `finalRank` now follows judges when present.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Verify automated path is untouched**

Run: `pnpm test src/server/hackathon/scoring.test.ts`
Expected: PASS (no regressions; the no-judges branch still uses `rankTeams`).

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): finalize uses judge aggregation when judges assigned"
```

---

### Task 14: "Open judging" + progress on the Lifecycle tab

**Files:**
- Modify: `src/components/hackathon/manage/manage-lifecycle.tsx`
- Modify: `src/server/api/routers/hackathon.ts` (add a small `judgingProgress` query)

- [ ] **Step 1: Add `judgingProgress` query**

```typescript
judgingProgress: protectedProcedure
  .input(z.object({ challengeId: z.number() }))
  .query(async ({ ctx, input }) => {
    await requireHackathonOrganizer(ctx.db, input.challengeId, ctx.session.user.id);
    const judges = await ctx.db
      .select({ userId: hackathonStaff.userId })
      .from(hackathonStaff)
      .where(
        and(
          eq(hackathonStaff.challengeId, input.challengeId),
          eq(hackathonStaff.role, "judge"),
          isNull(hackathonStaff.revokedAt),
        ),
      );
    const ranked = await ctx.db
      .selectDistinct({ judgeUserId: judgeRankings.judgeUserId })
      .from(judgeRankings)
      .where(eq(judgeRankings.challengeId, input.challengeId));
    const rankedSet = new Set(ranked.map((r) => r.judgeUserId));
    return {
      total: judges.length,
      submitted: judges.filter((j) => rankedSet.has(j.userId)).length,
    };
  }),
```

- [ ] **Step 2: Wire the Lifecycle tab**

In `manage-lifecycle.tsx`, add an "Open judging" button (calls `api.hackathon.openJudging`) shown when `phase === "locked"`, and a progress line from `api.hackathon.judgingProgress` ("N of M judges submitted") shown when `phase === "judging"`, sitting just before the existing Finalize button. Follow the existing `useMutation`/`toast`/`setPhase` pattern:

```typescript
const openJudging = api.hackathon.openJudging.useMutation({
  onSuccess: () => {
    setPhase("judging");
    toast.success("Judging opened");
  },
  onError: (e) => toast.error(e.message),
});
const progress = api.hackathon.judgingProgress.useQuery(
  { challengeId },
  { enabled: phase === "judging" },
);
```

Render (within the returned JSX, near the Finalize control):

```tsx
{phase === "locked" && (
  <button disabled={openJudging.isPending} onClick={() => openJudging.mutate({ challengeId })}>
    Open judging
  </button>
)}
{phase === "judging" && progress.data && (
  <p className="text-sm">
    {progress.data.submitted} of {progress.data.total} judges submitted
  </p>
)}
```

Add `"judging"` to the `initialPhase`/`phase` prop union in this component.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. Manual: lock → "Open judging" flips phase to judging; the progress line tracks judge submissions; Finalize blocks until all judges submit.

- [ ] **Step 4: Commit**

```bash
git add src/components/hackathon/manage/manage-lifecycle.tsx src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): open-judging action + judge progress on Lifecycle tab"
```

---

### Task 15: Team feedback (judges' comments on own submission, post-finalize)

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add `teamJudgeFeedback`)
- Modify: the team workspace component that renders a finalized team's result (locate via `teamLeaderboard`/team workspace; e.g. `src/components/hackathon/team/...`).

- [ ] **Step 1: Add `teamJudgeFeedback` query**

```typescript
teamJudgeFeedback: protectedProcedure
  .input(z.object({ teamId: z.string() }))
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    // Caller must be a member of this team (enrollment with teamId).
    const membership = await ctx.db
      .select({ id: challengeEnrollments.id })
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.teamId, input.teamId),
          eq(challengeEnrollments.userId, userId),
        ),
      )
      .limit(1);
    if (membership.length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this team" });
    }
    // Only after finalize (finalRank set) to avoid leaking in-progress deliberation.
    const [team] = await ctx.db
      .select({ finalRank: teams.finalRank })
      .from(teams)
      .where(eq(teams.id, input.teamId))
      .limit(1);
    if (!team?.finalRank) return { finalized: false, comments: [] as string[] };
    const rows = await ctx.db
      .select({ comment: judgeRankings.comment })
      .from(judgeRankings)
      .where(eq(judgeRankings.teamId, input.teamId));
    return {
      finalized: true,
      comments: rows
        .map((r) => r.comment)
        .filter((c): c is string => !!c && c.trim().length > 0),
    };
  }),
```

- [ ] **Step 2: Render feedback in the team workspace**

In the finalized-team view, add a "Judge feedback" section fed by `api.hackathon.teamJudgeFeedback.useQuery({ teamId })`, shown only when `data.finalized` and `data.comments.length > 0`. Comments are shown without judge identity (anonymous to the team — consistent with the visibility decision: team sees feedback, not who said what). Follow the existing component's query/render style.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. Manual: after finalize, a team member sees the comments left on their team; a non-member gets FORBIDDEN; nothing appears pre-finalize.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/hackathon.ts src/components/hackathon/team
git commit -m "feat(hackathon): teams see judge feedback on their submission post-finalize"
```

---

## Final verification (run after all tasks)

- [ ] `pnpm test` — all unit tests pass (staff-roles, judge-aggregation, scoring unchanged).
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm lint` — clean.
- [ ] `pnpm db:apply` (operator step) — three migrations apply cleanly; tables + `judging_opened_at` column exist.
- [ ] Manual end-to-end on a dev hackathon: admin grants an organizer + two judges → organizer edits Setup/Tasks but cannot lock/finalize → admin locks → organizer opens judging → judges submit rankings → finalize blocked until both judges submit → finalize ranks by judge aggregation → teams see their feedback.

## Spec coverage check (self-review)

- Per-hackathon grant scope → Tasks 2,3 (`hackathon_staff`).
- Judges decide final ranking → Tasks 12,13 (`aggregateJudgeRankings` + finalize branch).
- Automated path unchanged when no judges → Task 13 else-branch + Task 13 Step 3.
- Comment visibility (team sees own, post-finalize, not public) → Task 15.
- Organizer powers (Setup/Tasks/Analytics + invite judges, NOT lock/finalize/grant-organizers) → Tasks 4,5,6,7 gates.
- New judging lifecycle phase → Task 9.
- Finalize requires all active judges → Task 13.
- Immediate grant + in-app notification → Task 5.
- Out-of-scope items (rubrics, blind judging, email invites, quorum) → not implemented, by design.
