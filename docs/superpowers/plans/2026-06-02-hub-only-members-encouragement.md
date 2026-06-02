# Hub-Only Members & First-Tenant-Join Encouragement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user a member of the root Hub (`ait`) community on signup, treat that root row as an anchor (not a tenant), and add a non-coercive first-tenant-join nudge (onboarding step + interest-matched discovery + a Hub-only digest) that reaches members who belong to no tenant community.

**Architecture:** Two shippable phases. **Phase 1 (Foundation)** restores the documented invariant — universal Hub enrolment + reclassifying `ait` as an exempt anchor — and ships on its own with no user-facing change. **Phase 2 (Encouragement)** builds on it: an interest-matched discovery ranker, a `topics` field to match against, a "join your first community" onboarding step, and a Hub-only digest composition. The universal-enrolment invariant is what lets the existing digest cron reach Hub-only members for (almost) free.

**Tech Stack:** Next.js (App Router) · tRPC · Drizzle ORM (Postgres, `app` schema) · better-auth · Payload CMS (forum/events/articles) · Resend (email) · Vitest (pure-function unit tests only — there is **no DB integration-test harness**, so DB-touching code is verified manually and only pure logic is unit-tested).

**Canonical docs:** [CONTEXT.md](../../../CONTEXT.md) (terms **Hub**, **Hub-only member**), [ADR-0019](../../adr/0019-hub-root-is-an-anchor-not-a-tenant.md).

**Key constants/locations discovered:**
- `HUB_SLUG = "ait"` — [src/server/api/trpc.ts:205](../../../src/server/api/trpc.ts#L205)
- Signup hook — [src/server/better-auth/config.ts:38-56](../../../src/server/better-auth/config.ts#L38-L56)
- `communities` / `communityMemberships` / `memberProfiles` schema — [src/server/db/schema.ts](../../../src/server/db/schema.ts) lines 2401, 2474, 206
- Discovery ranker (pure) — [src/server/communities/discovery.ts](../../../src/server/communities/discovery.ts)
- Discovery DB glue — [src/server/communities/discovery-queries.ts](../../../src/server/communities/discovery-queries.ts)
- Discovery router — [src/server/api/routers/discovery.ts](../../../src/server/api/routers/discovery.ts)
- Onboarding router — [src/server/api/routers/onboarding.ts](../../../src/server/api/routers/onboarding.ts)
- Digest builder (pure) — [src/server/notifications/digest.ts](../../../src/server/notifications/digest.ts)
- Digest renderer — [src/server/notifications/render.ts](../../../src/server/notifications/render.ts)
- Digest cron — [src/app/api/cron/hub-digest/route.ts](../../../src/app/api/cron/hub-digest/route.ts)

---

## File Structure

**Phase 1 — Foundation**
- Modify: `src/server/better-auth/config.ts` — enrol new users in `ait` on signup
- Create: `src/server/db/enroll-in-hub.ts` — shared, idempotent "enrol user into the Hub root" helper used by the hook and the backfill
- Create: `src/server/db/backfill-hub-enrollment.ts` — one-off script: enrol every existing user lacking an `ait` membership
- Create: `src/server/db/reclassify-ait-anchor.ts` — one-off script: `isListedInDirectory = false` on `ait` + demote any `owner`/`admin` membership on `ait` to `member`

**Phase 2 — Encouragement**
- Modify: `src/server/db/schema.ts` — add `topics` json column to `communities`
- Create: `src/migrations/20260602_community_topics.ts` — Payload migration adding the column
- Modify: `src/server/communities/discovery.ts` — interest-overlap ranking, `topics` on `CommunityCandidate`
- Test: `src/server/communities/discovery.test.ts` — extend with interest-overlap tests
- Modify: `src/server/communities/discovery-queries.ts` — select `topics`, expose member interests
- Modify: `src/server/api/routers/discovery.ts` — pass member interests into the ranker
- Modify: `src/server/api/routers/onboarding.ts` — add `join_community` step + auto-detect
- Modify: `src/components/onboarding-checklist.tsx` — (no code change needed; verify rendering)
- Modify: `messages/en.json` (+ other locales) — `joinCommunity` label
- Modify: `src/server/notifications/digest.ts` — add `hubHighlights` to `HubDigest`
- Test: `src/server/notifications/digest.test.ts` — extend with hub-highlights tests
- Modify: `src/server/notifications/render.ts` — render hub highlights
- Modify: `src/app/api/cron/hub-digest/route.ts` — exclude `ait` from sections, fetch hub highlights, pass member interests to discovery

---

# PHASE 1 — FOUNDATION (universal Hub enrolment + anchor reclassification)

> Ships independently. After Phase 1: every user holds an `ait` membership row, `ait` is unlisted and ownerless. No user-facing behavior changes yet.

## Task 1: Idempotent Hub-enrolment helper + signup hook

**Files:**
- Create: `src/server/db/enroll-in-hub.ts`
- Modify: `src/server/better-auth/config.ts:6` (import) and `:38-56` (hook body)

- [ ] **Step 1: Write the helper**

Create `src/server/db/enroll-in-hub.ts`:

```typescript
import { and, eq, isNull } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { HUB_SLUG } from "@/server/api/trpc";

type DB = typeof _db;

/**
 * Idempotently enrol a user into the root Hub community (`ait`) as a plain
 * member. Safe to call repeatedly: the (community_id, user_id) unique index
 * makes the insert a no-op on conflict. No-op (returns false) if the Hub row
 * does not exist yet (e.g. before seeding). See ADR-0019.
 */
export async function enrollInHub(db: DB, userId: string): Promise<boolean> {
  const hub = await db.query.communities.findFirst({
    where: and(eq(communities.slug, HUB_SLUG), isNull(communities.deletedAt)),
    columns: { id: true },
  });
  if (!hub) return false;

  await db
    .insert(communityMemberships)
    .values({
      communityId: hub.id,
      userId,
      role: "member",
      status: "active",
    })
    .onConflictDoNothing();
  return true;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors referencing `enroll-in-hub.ts`.

- [ ] **Step 3: Wire the helper into the signup hook**

In `src/server/better-auth/config.ts`, update the schema import on line 6:

```typescript
import { memberProfiles } from "@/server/db/schema";
```

to add the helper import just below the existing `@/server/email` import (keep imports grouped):

```typescript
import { memberProfiles } from "@/server/db/schema";
import { enrollInHub } from "@/server/db/enroll-in-hub";
```

Then, inside the `user.create.after` hook, add the enrolment **after** the `memberProfiles` insert and **before** `checkEarlyAdopterBadge` (so the member exists, then is enrolled, then badge/activity run):

```typescript
        after: async (user) => {
          const displayName = user.name || user.email.split("@")[0]!;
          await db.insert(memberProfiles).values({
            userId: user.id,
            displayName,
          });
          await enrollInHub(db, user.id);
          await checkEarlyAdopterBadge(db, user.id);
          await logActivity(db, {
            actorId: user.id,
            actorType: "member",
            action: "member.joined",
            targetType: "member_profile",
            targetId: user.id,
            metadata: { displayName },
          });
          sendMemberWelcome(user.email, displayName).catch(() => {
            /* non-blocking */
          });
        },
```

> Note: we deliberately do **not** log a `community.joined` activity event for the Hub enrolment — `ait` is an anchor, and a `community.joined` on `ait` would pollute the discovery liveness/`newJoins` signal (see ADR-0019). The existing `member.joined` event already records the signup.

- [ ] **Step 4: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification (no DB test harness exists)**

Run the dev server (`pnpm dev`), register a brand-new test user, then query:

```sql
SELECT cm.role, cm.status, c.slug
FROM app.community_membership cm
JOIN app.community c ON c.id = cm.community_id
JOIN app."user" u ON u.id = cm.user_id
WHERE u.email = '<your-test-email>';
```

Expected: exactly one row, `slug = 'ait'`, `role = 'member'`, `status = 'active'`.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/enroll-in-hub.ts src/server/better-auth/config.ts
git commit -m "feat: enrol every new signup into the Hub root community (ADR-0019)"
```

---

## Task 2: Backfill existing users with no Hub membership

**Files:**
- Create: `src/server/db/backfill-hub-enrollment.ts`

This follows the exact idiom of the existing `src/server/db/seed-ait-community.ts` (standalone `tsx` script, `neon()` + `drizzle()`, run with `.env`).

- [ ] **Step 1: Write the backfill script**

Create `src/server/db/backfill-hub-enrollment.ts`:

```typescript
/**
 * One-off backfill — enrol every existing user who lacks an active membership
 * in the root Hub community (`ait`) as a plain member. Idempotent: re-running
 * only enrols users still missing. See ADR-0019.
 *
 * Run with:
 *   npx tsx src/server/db/backfill-hub-enrollment.ts
 *
 * Requires DATABASE_URL in the environment (e.g. via .env).
 */
import "dotenv/config";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import * as schema from "./schema";
import { communities, communityMemberships, user } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const conn = neon(DATABASE_URL);
const db = drizzle(conn, { schema: { ...schema }, casing: "snake_case" });

async function backfill() {
  const hub = await db
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.slug, "ait"), isNull(communities.deletedAt)))
    .limit(1);

  if (hub.length === 0) {
    console.error(
      "ERROR: Hub community (slug 'ait') not found. Run seed-ait-community.ts first.",
    );
    process.exit(1);
  }
  const hubId = hub[0]!.id;

  // User ids already holding an ait membership (any status).
  const alreadyRows = await db
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(eq(communityMemberships.communityId, hubId));
  const already = alreadyRows.map((r) => r.userId);

  // Users missing from that set.
  const missing = await db
    .select({ id: user.id })
    .from(user)
    .where(already.length > 0 ? notInArray(user.id, already) : sql`true`);

  if (missing.length === 0) {
    console.log("All users already enrolled in the Hub. Nothing to do.");
    return;
  }

  console.log(`Enrolling ${missing.length} user(s) into the Hub...`);
  await db
    .insert(communityMemberships)
    .values(
      missing.map((u) => ({
        communityId: hubId,
        userId: u.id,
        role: "member" as const,
        status: "active" as const,
      })),
    )
    .onConflictDoNothing();

  console.log(`  ✓ Enrolled ${missing.length} user(s).`);
}

backfill()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Dry-run mentally / run against a dev DB**

Run: `npx tsx src/server/db/backfill-hub-enrollment.ts`
Expected output (dev DB): `Enrolling N user(s) into the Hub...` then `✓ Enrolled N user(s).` Re-run immediately; expected: `All users already enrolled in the Hub. Nothing to do.` (proves idempotency).

- [ ] **Step 4: Verify with a count query**

```sql
SELECT
  (SELECT count(*) FROM app."user") AS users,
  (SELECT count(*) FROM app.community_membership cm
   JOIN app.community c ON c.id = cm.community_id
   WHERE c.slug = 'ait') AS ait_members;
```

Expected: `users == ait_members`.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/backfill-hub-enrollment.ts
git commit -m "feat: backfill script enrolling existing users into the Hub (ADR-0019)"
```

---

## Task 3: Reclassify `ait` as an anchor (unlisted, ownerless)

**Files:**
- Create: `src/server/db/reclassify-ait-anchor.ts`

The seed created `ait` with `isListedInDirectory: true` and the first user as `owner`. ADR-0019 requires `ait` to be unlisted/undiscoverable and to have no human organizer.

- [ ] **Step 1: Write the reclassification script**

Create `src/server/db/reclassify-ait-anchor.ts`:

```typescript
/**
 * One-off — reclassify the root Hub community (`ait`) as an anchor, not a
 * tenant (ADR-0019): unlist it from the directory and demote any
 * owner/admin membership to plain member so it has no community organizer.
 * Idempotent. Run with:
 *   npx tsx src/server/db/reclassify-ait-anchor.ts
 */
import "dotenv/config";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray, isNull } from "drizzle-orm";

import * as schema from "./schema";
import { communities, communityMemberships } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const conn = neon(DATABASE_URL);
const db = drizzle(conn, { schema: { ...schema }, casing: "snake_case" });

async function reclassify() {
  const hub = await db
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.slug, "ait"), isNull(communities.deletedAt)))
    .limit(1);
  if (hub.length === 0) {
    console.error("ERROR: Hub community (slug 'ait') not found.");
    process.exit(1);
  }
  const hubId = hub[0]!.id;

  await db
    .update(communities)
    .set({ isListedInDirectory: false })
    .where(eq(communities.id, hubId));
  console.log("  ✓ ait unlisted from directory.");

  const demoted = await db
    .update(communityMemberships)
    .set({ role: "member" })
    .where(
      and(
        eq(communityMemberships.communityId, hubId),
        inArray(communityMemberships.role, ["owner", "admin", "moderator"]),
      ),
    )
    .returning({ userId: communityMemberships.userId });
  console.log(`  ✓ Demoted ${demoted.length} privileged membership(s) on ait.`);
}

reclassify()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run it and verify**

Run: `npx tsx src/server/db/reclassify-ait-anchor.ts`
Then:

```sql
SELECT c.is_listed_in_directory,
       (SELECT count(*) FROM app.community_membership cm
        WHERE cm.community_id = c.id AND cm.role <> 'member') AS privileged
FROM app.community c WHERE c.slug = 'ait';
```

Expected: `is_listed_in_directory = false`, `privileged = 0`.

- [ ] **Step 4: Verify downstream exclusions hold (read-only sanity)**

Confirm the existing code already excludes `ait` once unlisted:
- `loadDiscoveryCandidates` filters `eq(communities.isListedInDirectory, true)` ([discovery-queries.ts:50](../../../src/server/communities/discovery-queries.ts#L50)) → `ait` is no longer a candidate. ✓
- `requireHubOperator` now FORBIDs everyone (no owner/admin on `ait`) ([trpc.ts:207](../../../src/server/api/trpc.ts#L207)) — intended; Hub-operator features stay closed until epic #85. ✓
- At-risk/activation/greeter loaders take a `communityId` argument and are only invoked per tenant community via organizer dashboards, which no one can reach for `ait` (no privileged membership). ✓

No code change required here; this step is a documented verification.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/reclassify-ait-anchor.ts
git commit -m "feat: reclassify ait as an unlisted, ownerless anchor (ADR-0019)"
```

---

# PHASE 2 — ENCOURAGEMENT (onboarding step + interest-matched discovery + Hub-only digest)

> Depends on Phase 1 (every user holds an `ait` row). Each task below is independently committable.

## Task 4: Add a `topics` field to communities

**Files:**
- Modify: `src/server/db/schema.ts` (communities table, ~line 2401-2444)
- Create: `src/migrations/20260602_community_topics.ts`

Interest-matching needs community-side data to match against. `topics` is an optional `string[]`, defaulting to `[]`, so existing communities behave exactly as today (no topics → zero overlap → pure liveness).

- [ ] **Step 1: Add the column to the Drizzle schema**

In `src/server/db/schema.ts`, inside the `communities` table definition, add `topics` immediately after the `description` column:

```typescript
    description: d.text(),
    topics: d.json().$type<string[]>().default([]).notNull(),
    logoUrl: d.text(),
```

(This matches the `skills`/`interests` pattern on `memberProfiles`: `d.json().$type<string[]>().default([])`.)

- [ ] **Step 2: Write the migration**

Create `src/migrations/20260602_community_topics.ts` (matching the `@payloadcms/db-postgres` idiom of `src/migrations/20260530_backfill_membership_community_id.ts`):

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
    ADD COLUMN IF NOT EXISTS "topics" jsonb NOT NULL DEFAULT '[]'::jsonb
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community" DROP COLUMN IF EXISTS "topics"
  `);
}
```

- [ ] **Step 3: Apply and verify**

Run: `pnpm db:migrate` (or the project's Payload migration runner; migrations auto-run on startup per the repo idiom).
Verify:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'app' AND table_name = 'community' AND column_name = 'topics';
```

Expected: one row, `data_type = jsonb`, default `'[]'::jsonb`.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260602_community_topics.ts
git commit -m "feat: add topics[] to communities for interest matching (ADR-0019)"
```

> **Scope note (state in PR description):** This task adds the column and wires it into ranking (Tasks 5–6). Letting community admins *edit* topics (community settings UI) is a deliberate follow-up — until communities are tagged, `topics = []` means the ranker degrades to today's pure-liveness behavior, so there is zero behavioral regression.

---

## Task 5: Interest-overlap ranking (pure function, TDD)

**Files:**
- Modify: `src/server/communities/discovery.ts`
- Test: `src/server/communities/discovery.test.ts`

Design (per the grilling): interest match is **primary**, liveness is the **tiebreak**; empty interests or empty topics → overlap 0 → pure liveness (current behavior preserved).

- [ ] **Step 1: Write the failing tests**

Append to `src/server/communities/discovery.test.ts` (the `candidate()` helper already exists in that file; extend it to accept `topics`). First, update the helper to include topics — change the helper's return object to add `topics: over.topics ?? []` and its param type to `Partial<CommunityCandidate> & { communityId: string }` (already partial). Then add:

```typescript
describe("interestOverlap", () => {
  it("counts shared tags case-insensitively, ignoring duplicates", () => {
    expect(
      interestOverlap(["AI", "Robotics", "ai"], ["robotics", "nlp"]),
    ).toBe(1);
  });
  it("is 0 when either side is empty", () => {
    expect(interestOverlap([], ["ai"])).toBe(0);
    expect(interestOverlap(["ai"], [])).toBe(0);
  });
});

describe("rankCommunitiesForMember with interests", () => {
  it("ranks interest matches above livelier non-matches", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "lively", activeNow: 50, topics: ["design"] }),
        candidate({ communityId: "match", activeNow: 1, topics: ["robotics"] }),
      ],
      memberCommunityIds: new Set(),
      interests: ["robotics"],
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["match", "lively"]);
  });

  it("falls back to pure liveness when the member has no interests", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "low", activeNow: 1, topics: ["robotics"] }),
        candidate({ communityId: "high", activeNow: 10, topics: ["design"] }),
      ],
      memberCommunityIds: new Set(),
      interests: [],
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["high", "low"]);
  });

  it("breaks overlap ties by liveness", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "a", activeNow: 2, topics: ["ai"] }),
        candidate({ communityId: "b", activeNow: 9, topics: ["ai"] }),
      ],
      memberCommunityIds: new Set(),
      interests: ["ai"],
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["b", "a"]);
  });

  it("treats omitted interests as pure liveness (back-compat)", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "low", activeNow: 1 }),
        candidate({ communityId: "high", activeNow: 10 }),
      ],
      memberCommunityIds: new Set(),
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["high", "low"]);
  });
});
```

Add `interestOverlap` to the imports at the top of the test file:

```typescript
import {
  livenessScore,
  interestOverlap,
  rankCommunitiesForMember,
  type CommunityCandidate,
} from "./discovery";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/server/communities/discovery.test.ts`
Expected: FAIL — `interestOverlap is not exported`, and `rankCommunitiesForMember` does not accept `interests`.

- [ ] **Step 3: Implement**

In `src/server/communities/discovery.ts`:

(a) Add `topics` to the `CommunityCandidate` type (after `description`):

```typescript
export type CommunityCandidate = {
  communityId: string;
  slug: string;
  name: string;
  description: string | null;
  /** Admin-set topic tags, matched against a member's interests. */
  topics: string[];
  logoUrl: string | null;
  memberCount: number;
  activeNow: number;
  contributionCount: number;
  contributionPrev: number;
  newJoins: number;
};
```

(b) Add the pure overlap helper (below `livenessScore`):

```typescript
/** Case-insensitive count of distinct tags shared between two tag lists. */
export function interestOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const norm = (s: string) => s.trim().toLowerCase();
  const setB = new Set(b.map(norm));
  const seen = new Set<string>();
  let n = 0;
  for (const tag of a) {
    const t = norm(tag);
    if (!seen.has(t) && setB.has(t)) {
      seen.add(t);
      n++;
    }
  }
  return n;
}
```

(c) Extend `RankedCommunity` and `rankCommunitiesForMember` to be interest-aware. Replace the existing `RankedCommunity` type and function with:

```typescript
export type RankedCommunity = CommunityCandidate & {
  score: number;
  overlap: number;
};

export function rankCommunitiesForMember(opts: {
  candidates: CommunityCandidate[];
  memberCommunityIds: Set<string>;
  interests?: string[];
  limit?: number;
}): RankedCommunity[] {
  const limit = opts.limit ?? 10;
  const interests = opts.interests ?? [];
  const ranked = opts.candidates
    .filter((c) => !opts.memberCommunityIds.has(c.communityId))
    .map((c) => ({
      ...c,
      overlap: interestOverlap(interests, c.topics),
      score: livenessScore(c),
    }))
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        b.score - a.score ||
        b.activeNow - a.activeNow ||
        b.memberCount - a.memberCount ||
        (a.communityId < b.communityId
          ? -1
          : a.communityId > b.communityId
            ? 1
            : 0),
    );
  return ranked.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/server/communities/discovery.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Typecheck (the new `topics`/`overlap` fields ripple to callers)**

Run: `pnpm exec tsc --noEmit`
Expected: errors in `discovery-queries.ts` (CommunityCandidate now requires `topics`) — fixed in Task 6. If any other caller breaks, note it; it will be addressed in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/server/communities/discovery.ts src/server/communities/discovery.test.ts
git commit -m "feat: interest-matched community ranking with liveness tiebreak"
```

---

## Task 6: Thread topics + member interests through the discovery pipeline

**Files:**
- Modify: `src/server/communities/discovery-queries.ts`
- Modify: `src/server/api/routers/discovery.ts`

- [ ] **Step 1: Select `topics` in `loadDiscoveryCandidates`**

In `src/server/communities/discovery-queries.ts`, add `topics` to the `communities` select (after `description`) and to the returned candidate object.

In the `.select({...})` block (around line 35):

```typescript
      description: communities.description,
      topics: communities.topics,
      logoUrl: communities.logoUrl,
```

In the final `return eligible.map((r) => {...})` candidate object (around line 127), add:

```typescript
      slug: r.slug,
      name: r.name,
      description: r.description,
      topics: r.topics,
      logoUrl: r.logoUrl,
```

- [ ] **Step 2: Add a member-interests loader**

Append to `src/server/communities/discovery-queries.ts`:

```typescript
/** The current member's interest tags (empty array if none / no profile). */
export async function loadMemberInterests(
  db: DB,
  userId: string,
): Promise<string[]> {
  const row = await db.query.memberProfiles.findFirst({
    where: eq(memberProfiles.userId, userId),
    columns: { interests: true },
  });
  return row?.interests ?? [];
}
```

Add `memberProfiles` to the schema import at the top of the file:

```typescript
import {
  communities,
  communityMemberships,
  activityEvents,
  communityAcquireConfig,
  memberProfiles,
} from "@/server/db/schema";
```

- [ ] **Step 3: Pass interests into the ranker from the discovery router**

In `src/server/api/routers/discovery.ts`, update `recommendedForMe`:

```typescript
import { rankCommunitiesForMember } from "@/server/communities/discovery";
import {
  loadDiscoveryCandidates,
  loadMemberCommunityIds,
  loadMemberInterests,
} from "@/server/communities/discovery-queries";

export const discoveryRouter = createTRPCRouter({
  recommendedForMe: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(6) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const [candidates, memberCommunityIds, interests] = await Promise.all([
        loadDiscoveryCandidates(ctx.db, now),
        loadMemberCommunityIds(ctx.db, ctx.session.user.id),
        loadMemberInterests(ctx.db, ctx.session.user.id),
      ]);
      return rankCommunitiesForMember({
        candidates,
        memberCommunityIds,
        interests,
        limit: input.limit,
      });
    }),
});
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (the Task 5 ripple is now resolved).

- [ ] **Step 5: Manual verification**

With a dev user whose `member_profile.interests` contains a tag, set a listed community's `topics` to include that tag (SQL: `UPDATE app.community SET topics = '["robotics"]'::jsonb WHERE slug = '<some-listed-community>';`). Load `/communities`; expected: that community ranks first under "Recommended for you".

- [ ] **Step 6: Commit**

```bash
git add src/server/communities/discovery-queries.ts src/server/api/routers/discovery.ts
git commit -m "feat: feed community topics + member interests into discovery ranking"
```

---

## Task 7: "Join your first community" onboarding step

**Files:**
- Modify: `src/server/api/routers/onboarding.ts`
- Modify: `messages/en.json` (and any other locale files under `messages/`)

The step is added **after `complete_profile`** in every intent's step list, with auto-detection so it self-completes once the member joins a tenant community.

- [ ] **Step 1: Add the step to each intent's step list**

In `src/server/api/routers/onboarding.ts`, insert this step object as the **second** entry (right after `complete_profile`) in `LEARNING_STEPS`, `NETWORKING_STEPS`, and `EXPERTISE_STEPS`:

```typescript
  {
    slug: "join_community",
    labelKey: "joinCommunity",
    href: "/communities",
    autoDetect: true,
  },
```

(`GENERIC_STEPS = LEARNING_STEPS`, so it inherits automatically.)

- [ ] **Step 2: Add auto-detection for `join_community`**

Locate the auto-detection logic (the `getStatus` query and/or `syncAutoDetected` mutation, ~lines 205-443). Add a check that the user holds an `active` membership in any community whose slug is **not** `ait`. Add the needed imports at the top of the file if absent:

```typescript
import { and, eq, ne } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";
import { HUB_SLUG } from "@/server/api/trpc";
```

In the block that computes the set of auto-detected step slugs (where other `autoDetect` steps are resolved), add:

```typescript
      const [tenantMembership] = await ctx.db
        .select({ id: communityMemberships.id })
        .from(communityMemberships)
        .innerJoin(
          communities,
          eq(communityMemberships.communityId, communities.id),
        )
        .where(
          and(
            eq(communityMemberships.userId, userId),
            eq(communityMemberships.status, "active"),
            ne(communities.slug, HUB_SLUG),
          ),
        )
        .limit(1);
      if (tenantMembership) autoDetected.add("join_community");
```

> Match the exact variable name used for the auto-detected set in that function (the explorer found it referenced as `autoDetected` in `getStatus`). If the function builds a `Set` under a different local name, use that name.

- [ ] **Step 3: Add the i18n label**

In `messages/en.json`, under the onboarding checklist `steps` object (sibling of `completeProfile`, `browseEvents`, etc.), add:

```json
"joinCommunity": "Join your first community"
```

Add the same key to every other locale file in `messages/` (use the English string as a placeholder translation if no translation is available).

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

As a Hub-only dev user (no tenant membership), open the dashboard onboarding checklist; expected: "Join your first community" appears second, unchecked, linking to `/communities`. Join an open tenant community, return to the dashboard; expected: the step is now checked (auto-detected).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/onboarding.ts messages/
git commit -m "feat: add 'join your first community' onboarding step with auto-detect"
```

---

## Task 8: Hub-only digest — Hub-wide highlights + discovery, auto-retiring on first join

**Files:**
- Modify: `src/server/notifications/digest.ts`
- Test: `src/server/notifications/digest.test.ts`
- Modify: `src/server/notifications/render.ts`
- Modify: `src/app/api/cron/hub-digest/route.ts`

Approach: every user now has an `ait` row, so they already appear in the cron's recipient map. We (a) **exclude the `ait` row from community sections** (it's an anchor), and (b) add **Hub-wide highlights** to the digest so a Hub-only member's email has standalone value alongside the discovery line. Auto-retire is automatic: once the member joins a tenant community, their digest gains real community sections and the discovery line reverts to ordinary cross-promotion.

### 8a — Add `hubHighlights` to the digest model (pure, TDD)

- [ ] **Step 1: Write the failing tests**

Append to `src/server/notifications/digest.test.ts`:

```typescript
describe("buildHubDigest hub highlights", () => {
  it("sends a digest for a Hub-only member: no sections, but highlights + discovery", () => {
    const d = buildHubDigest({
      userId: "u1",
      sections: [],
      optedOutCommunityIds: new Set(),
      discovery: { name: "Robotics", slug: "robotics" },
      hubHighlights: [
        { kind: "article", title: "Hello AIT", href: "/blog/hello" },
      ],
    });
    expect(d).not.toBeNull();
    expect(d!.hubHighlights).toHaveLength(1);
    expect(d!.discovery).toEqual({ name: "Robotics", slug: "robotics" });
  });

  it("sends a digest when only highlights exist (no sections, no discovery)", () => {
    const d = buildHubDigest({
      userId: "u1",
      sections: [],
      optedOutCommunityIds: new Set(),
      hubHighlights: [
        { kind: "event", title: "Meetup", href: "/events/1" },
      ],
    });
    expect(d).not.toBeNull();
  });

  it("still returns null when sections, discovery, and highlights are all empty", () => {
    expect(
      buildHubDigest({
        userId: "u1",
        sections: [],
        optedOutCommunityIds: new Set(),
        hubHighlights: [],
      }),
    ).toBeNull();
  });

  it("defaults hubHighlights to [] when omitted (back-compat)", () => {
    const d = buildHubDigest({
      userId: "u1",
      sections: [
        summarizeCommunitySection({
          communityId: "c1",
          communityName: "C1",
          newThreads: 1,
          newEvents: 0,
          newMembers: 0,
          ritualItems: [],
        }),
      ],
      optedOutCommunityIds: new Set(),
    });
    expect(d!.hubHighlights).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/server/notifications/digest.test.ts`
Expected: FAIL — `hubHighlights` is not a known property; the digest returns null for the highlights-only case.

- [ ] **Step 3: Implement in `src/server/notifications/digest.ts`**

Add the highlight type and extend `HubDigest` + `buildHubDigest`:

```typescript
export type HubHighlight = {
  kind: "article" | "event";
  title: string;
  href: string;
};

export type HubDigest = {
  userId: string;
  sections: CommunitySection[];
  discovery: DiscoveryPick;
  hubHighlights: HubHighlight[];
};

export function buildHubDigest(opts: {
  userId: string;
  sections: CommunitySection[];
  optedOutCommunityIds: Set<string>;
  discovery?: DiscoveryPick;
  hubHighlights?: HubHighlight[];
}): HubDigest | null {
  const visible = opts.sections.filter(
    (s) => !s.isEmpty && !opts.optedOutCommunityIds.has(s.communityId),
  );
  const discovery = opts.discovery ?? null;
  const hubHighlights = opts.hubHighlights ?? [];
  if (visible.length === 0 && !discovery && hubHighlights.length === 0) {
    return null;
  }
  return { userId: opts.userId, sections: visible, discovery, hubHighlights };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/server/notifications/digest.test.ts`
Expected: PASS.

### 8b — Render hub highlights

- [ ] **Step 5: Render highlights in `src/server/notifications/render.ts`**

After the `discoveryHtml` constant (around line 33), add a highlights block and include it in the returned template before `${sections}`:

```typescript
  const highlightsHtml =
    digest.hubHighlights.length > 0
      ? `<div style="margin: 20px 0; padding-bottom: 16px; border-bottom: 1px solid #eee;">
           <h3 style="font-size: 15px; margin: 0 0 8px;">Across AIT this week</h3>
           <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #333;">
             ${digest.hubHighlights
               .map(
                 (h) =>
                   `<li><a href="${baseUrl}${esc(h.href)}">${esc(h.title)}</a></li>`,
               )
               .join("")}
           </ul>
         </div>`
      : "";
```

Then insert `${highlightsHtml}` into the main template, immediately after the intro `<p>` and before `${sections}`:

```typescript
      <p style="font-size: 14px; color: #555;">Here's what happened across your communities this week.</p>
      ${highlightsHtml}
      ${sections}
      ${discoveryHtml}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: errors only in the cron route (it does not yet pass `hubHighlights`) — fixed next.

### 8c — Wire the cron: exclude `ait`, fetch highlights, pass interests

- [ ] **Step 7: Exclude the `ait` row from sections and add slug to the membership query**

In `src/app/api/cron/hub-digest/route.ts`, the membership query (lines 84-98) must keep `ait` so Hub-only members still appear as recipients, but expose `slug` so we can skip it when building sections. Update the `.select` to add slug:

```typescript
  const memberships = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      communityName: communities.name,
      communitySlug: communities.slug,
      email: user.email,
      name: user.name,
    })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communityMemberships.communityId, communities.id),
    )
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .where(eq(communityMemberships.status, "active"));
```

Add the import for the Hub slug near the top of the file:

```typescript
import { HUB_SLUG } from "@/server/api/trpc";
```

Inside the per-user loop, when building `sections`, filter out the `ait` row. Replace the `const sections = rows.map(...)` block with:

```typescript
    const tenantRows = rows.filter((r) => r.communitySlug !== HUB_SLUG);
    const sections = tenantRows.map((r) =>
      summarizeCommunitySection({
        communityId: r.communityId,
        communityName: r.communityName,
        newThreads: countOf(r.communityId, "thread.create"),
        newEvents: countOf(r.communityId, "event.create"),
        newMembers: countOf(r.communityId, "community.joined"),
        ritualItems: buildRitualItems({
          config: cfgOf(r.communityId),
          recap: recapByCommunity.get(r.communityId) ?? [],
          reminders: remindersByCommunity.get(r.communityId) ?? [],
          recipientIsAtRisk:
            atRiskByCommunity.get(r.communityId)?.has(userId) ?? false,
          recipientName,
        }),
      }),
    );
```

Also update the discovery `memberIds` set so `ait` does not suppress a tenant recommendation (it won't — `ait` is unlisted so it's not a candidate — but exclude it for clarity):

```typescript
    const memberIds = new Set(tenantRows.map((r) => r.communityId));
```

- [ ] **Step 8: Pass member interests into the per-member discovery pick**

The cron currently calls `rankCommunitiesForMember` with no interests. Load interests in bulk before the loop (one query), then pass per user. After the discovery candidates load (line 205), add:

```typescript
  // Member interests for interest-matched discovery (bulk read).
  const interestRows =
    allUserIds.length === 0
      ? []
      : await db
          .select({
            userId: memberProfiles.userId,
            interests: memberProfiles.interests,
          })
          .from(memberProfiles)
          .where(inArray(memberProfiles.userId, allUserIds));
  const interestsByUser = new Map(
    interestRows.map((r) => [r.userId, r.interests ?? []]),
  );
```

> `allUserIds` is defined at line 210 (`const allUserIds = [...byUser.keys()]`). Move the `allUserIds` declaration above this block, or place this block after line 210. Add `memberProfiles` to the schema import block at the top of the file.

Then update the `rankCommunitiesForMember` call inside the loop:

```typescript
    const topPick = rankCommunitiesForMember({
      candidates: discoveryCandidates,
      memberCommunityIds: memberIds,
      interests: interestsByUser.get(userId) ?? [],
      limit: 1,
    })[0];
```

- [ ] **Step 9: Fetch Hub-wide highlights once, before the loop, and pass to every digest**

After the discovery candidates load, fetch recent Hub-wide articles and upcoming Hub-wide events via the Payload client (the cron already imports `getPayloadClient` indirectly — add it if needed). Add near the other pre-loop computations:

```typescript
  // Hub-wide highlights (communityId null) — shared by all recipients this run.
  const payloadForHighlights = await getPayloadClient();
  const [recentArticles, upcomingEvents] = await Promise.all([
    payloadForHighlights.find({
      collection: "articles",
      where: {
        status: { equals: "published" },
        publishedAt: { greater_than_equal: weekAgo.toISOString() },
      },
      sort: "-publishedAt",
      limit: 3,
      depth: 0,
    }),
    payloadForHighlights.find({
      collection: "events",
      where: {
        communityId: { exists: false },
        status: { equals: "published" },
        date: { greater_than: now.toISOString() },
      },
      sort: "date",
      limit: 3,
      depth: 0,
    }),
  ]);
  const hubHighlights: HubHighlight[] = [
    ...recentArticles.docs.map((a) => ({
      kind: "article" as const,
      title: String(a.title ?? "Untitled"),
      href: `/blog/${String(a.slug ?? a.id)}`,
    })),
    ...upcomingEvents.docs.map((e) => ({
      kind: "event" as const,
      title: String(e.title ?? "Event"),
      href: `/events/${String(e.id)}`,
    })),
  ];
```

Add imports at the top of the file:

```typescript
import { getPayloadClient } from "@/server/payload";
import { type HubHighlight } from "@/server/notifications/digest";
```

> `getPayloadClient` is already imported in this file (used for ritual recap reply counts, line 16) — reuse it; do not import twice. Verify the `articles` collection slug and field names (`title`, `slug`, `publishedAt`) against `src/collections/Articles.ts`; adjust `href`/field names if the collection differs.

Then pass `hubHighlights` into `buildHubDigest`:

```typescript
    const digest = buildHubDigest({
      userId,
      sections,
      optedOutCommunityIds: prefs.digestOptOutCommunityIds,
      discovery,
      hubHighlights,
    });
    if (!digest) continue;
```

- [ ] **Step 10: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Run the full unit suite**

Run: `pnpm exec vitest run`
Expected: PASS (discovery + digest suites green; nothing else regressed).

- [ ] **Step 12: Manual end-to-end verification**

Trigger the cron locally:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/hub-digest
```

With a Hub-only dev user (only `ait` membership) who has not opted out of the digest, confirm (via Resend dev logs / the returned `sent` count) that they receive a digest containing the "Across AIT this week" highlights block and a discovery recommendation, and **no** "AIT Community" section. With a user in a tenant community, confirm they get their tenant section(s) and no `ait` section.

- [ ] **Step 13: Commit**

```bash
git add src/server/notifications/digest.ts src/server/notifications/digest.test.ts src/server/notifications/render.ts src/app/api/cron/hub-digest/route.ts
git commit -m "feat: Hub-only digest — hub highlights + interest-matched discovery, ait excluded from sections"
```

---

## Self-Review (completed against the settled design)

**Spec coverage** — every settled decision maps to a task:
- Universal Hub enrolment on signup → Task 1; backfill of existing users → Task 2.
- `ait` = anchor not tenant (unlisted, no organizer, excluded from growth loops) → Task 3 (+ verified exclusions reuse existing `isListedInDirectory` / per-community gating).
- Encouraged action = *join* (not create) → no "create" nudge added anywhere; onboarding step + discovery both point at joining existing communities.
- Primary nudge in onboarding checklist, after profile step → Task 7 (inserted second, after `complete_profile`).
- Interest-matched ranking, liveness tiebreak, pure-liveness fallback → Tasks 4–6.
- Hub-only recurring email = hub highlights + discovery, auto-retiring on first join → Task 8 (auto-retire is emergent: sections appear once a tenant is joined).
- Honor existing digest opt-out → unchanged; the cron's `prefs.globalDigestOptOut`/`optedOutCommunityIds` checks still apply.

**Placeholder scan** — no `TBD`/`handle edge cases`/"similar to Task N". Two explicit scope notes (admin topic-editing UI; Payload field-name verification) are called out as such, not hidden.

**Type consistency** — `CommunityCandidate.topics: string[]` defined in Task 5 is selected in Task 6; `interestOverlap`/`rankCommunitiesForMember({interests})` signatures match between test and impl; `HubHighlight`/`HubDigest.hubHighlights` defined in Task 8a are consumed by 8b (render) and produced in 8c (cron); `HUB_SLUG` reused everywhere rather than re-literaled.

**Known residual risks (flagged, not blocking):**
- No DB integration-test harness exists, so Tasks 1–3, 6, 7, 8c rely on manual verification steps. Pure logic (ranking, digest, overlap) is fully unit-tested.
- Payload collection field names for articles/events highlights (Task 8 Step 9) must be confirmed against `src/collections/*` during implementation.
