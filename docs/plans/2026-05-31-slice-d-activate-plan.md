# Slice D — Activate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newcomer **activation** an admin-tunable, observable funnel — joined → first contribution → reciprocal response → activated — with a greeter that guarantees the response, a near-churn admin nudge, and admin-authored per-community onboarding steps.

**Architecture:** Pure-logic core (`computeActivationStage`/`selectActivationFunnel`, vitest, injected clock) + thin tRPC (`communityProcedure`/`agentProcedure`) + thin cron + thin MCP, reusing Slice A insight selectors, Slice C warm-welcome + `thread_reply` drafts, Slice B notifications, and the `community_engage_config` config pattern. The reciprocity signal is the existing-but-unpopulated `activity_event.recipient_id` column.

**Tech Stack:** Next.js App Router, tRPC, Drizzle (`drizzle-orm/neon-http`, `app` schema), Payload CMS, Vitest, Vercel Cron.

**Design + decisions:** [`docs/plans/2026-05-31-slice-d-activate-design.md`](2026-05-31-slice-d-activate-design.md), [`docs/adr/0017-activation-milestone-and-reciprocity.md`](../adr/0017-activation-milestone-and-reciprocity.md), ADR-0013/0015.

**Conventions (do not relearn):**

- CI = `pnpm check` (next lint + tsc). ALWAYS run `pnpm format:check` + `pnpm prettier --write` on changed files before committing.
- Migrations: `src/migrations/<key>.ts` (`up`/`down`, `sql` from `@payloadcms/db-postgres`) + register in `src/migrations/index.ts` as the LAST array entry. App tables in `"app"` schema; FK targets `"app"."community"`, `"app"."user"`.
- DB is neon-http — NO transactions. Use claim/CAS/`onConflictDoNothing`/`onConflictDoUpdate`.
- Agent-callable endpoints need an MCP tool.
- Do NOT stage `CONTEXT.md` in any task except Task 10 — it has unrelated working-tree changes. Stage your task's files explicitly.

**Names locked across tasks:**

- `src/server/communities/activation.ts`: `computeActivationStage`, `selectActivationFunnel`, `RESPONSE_ACTIONS`, types `ActivationStage`, `ActivationConfig`, `FunnelMemberInput`, `ActivationFunnel`.
- Schema exports: `communityActivationConfig`, `communityOnboardingStep`, `communityOnboardingProgress`.
- Routers: `activationConfigRouter`, `activationRouter`, `onboardingStepsRouter`.
- Advisory: `suggestGreeting`, `newcomersAwaitingResponse`. Draft type reused: `thread_reply`.
- Constants: `ACTIVATION_COHORT_DAYS = 30`, `GREETER_GRACE_HOURS = 48`, `CHURN_MIN_DAYS = 23`, `CHURN_MAX_DAYS = 30`.

---

## File Structure

| File                                                                            | Responsibility                                       | Task |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- | ---- |
| `src/server/communities/activation.ts` (+`.test.ts`)                            | Pure stage + funnel logic, `RESPONSE_ACTIONS`        | 1    |
| `src/server/db/schema.ts` (modify)                                              | 3 new tables                                         | 1    |
| `src/migrations/20260531e_activation.ts` (+ index)                              | DDL for the 3 tables                                 | 1    |
| `src/server/api/routers/forum.ts`, `feed.ts`, `launchpad.ts` (modify)           | `recipientId` on response actions                    | 2    |
| `src/server/api/routers/activationConfig.ts` (+ root.ts)                        | Milestone config get/set (owner/admin)               | 3    |
| `src/components/communities/activation/activation-settings.tsx`                 | Config UI                                            | 3    |
| `src/server/api/routers/activation.ts` (+ root.ts)                              | `funnel` + `awaitingResponse` + cohort queries       | 4    |
| `src/components/communities/activation/*`                                       | Funnel section + status badges                       | 5    |
| `src/server/api/routers/advisory.ts` (modify), `mcp/advisory-tools.ts` (modify) | `suggestGreeting`, `newcomersAwaitingResponse` + MCP | 6    |
| `src/components/communities/activation/awaiting-response-list.tsx`              | Greeter queue UI                                     | 6    |
| `src/app/api/cron/activation-newcomer-churn/route.ts` + `vercel.json`           | Near-churn admin notify                              | 7    |
| `src/server/api/routers/onboardingSteps.ts` (+ root.ts)                         | Admin CRUD/reorder + member list/complete            | 8    |
| `src/components/communities/onboarding/*`                                       | Admin authoring + member checklist                   | 9    |
| `CONTEXT.md` (modify)                                                           | Glossary                                             | 10   |

---

## Task 1: Schema + migration + activation pure core

**Files:**

- Create: `src/server/communities/activation.ts` + `src/server/communities/activation.test.ts`
- Modify: `src/server/db/schema.ts` (add 3 tables after `communityEngageConfig`)
- Create: `src/migrations/20260531e_activation.ts`; Modify `src/migrations/index.ts`

- [ ] **Step 1: Write the failing test** — `src/server/communities/activation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  computeActivationStage,
  selectActivationFunnel,
  type ActivationConfig,
} from "./activation";

const DEFAULT_CFG: ActivationConfig = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};
const C = new Date("2026-06-01T00:00:00.000Z"); // contribution time
const within = new Date("2026-06-05T00:00:00.000Z"); // +4d
const after = new Date("2026-06-10T00:00:00.000Z"); // +9d

describe("computeActivationStage", () => {
  it("unactivated when no contribution", () => {
    expect(
      computeActivationStage({
        firstContributionAt: null,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: within,
      }),
    ).toBe("unactivated");
  });
  it("awaiting_response when contributed, no response yet, window open", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: within,
      }),
    ).toBe("awaiting_response");
  });
  it("activated when response received within window", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: within,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: after,
      }),
    ).toBe("activated");
  });
  it("stalled when window closed without a response", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: after,
      }),
    ).toBe("stalled");
  });
  it("late response (after window) does not activate", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: after,
        profileComplete: false,
        config: DEFAULT_CFG,
        now: after,
      }),
    ).toBe("stalled");
  });
  it("relaxed (no response required) activates on contribution alone", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: null,
        profileComplete: false,
        config: {
          requireResponse: false,
          requireProfileComplete: false,
          windowDays: 7,
        },
        now: within,
      }),
    ).toBe("activated");
  });
  it("awaiting_profile when response ok but profile required and incomplete", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: within,
        profileComplete: false,
        config: {
          requireResponse: true,
          requireProfileComplete: true,
          windowDays: 7,
        },
        now: after,
      }),
    ).toBe("awaiting_profile");
  });
  it("activated when response + profile both satisfied", () => {
    expect(
      computeActivationStage({
        firstContributionAt: C,
        firstResponseReceivedAt: within,
        profileComplete: true,
        config: {
          requireResponse: true,
          requireProfileComplete: true,
          windowDays: 7,
        },
        now: after,
      }),
    ).toBe("activated");
  });
});

describe("selectActivationFunnel", () => {
  it("counts cohort, contributed, responded, activated, and per-stage", () => {
    const f = selectActivationFunnel({
      config: DEFAULT_CFG,
      now: after,
      members: [
        {
          userId: "a",
          joinedAt: C,
          firstContributionAt: null,
          firstResponseReceivedAt: null,
          profileComplete: false,
        },
        {
          userId: "b",
          joinedAt: C,
          firstContributionAt: C,
          firstResponseReceivedAt: null,
          profileComplete: false,
        },
        {
          userId: "c",
          joinedAt: C,
          firstContributionAt: C,
          firstResponseReceivedAt: within,
          profileComplete: false,
        },
      ],
    });
    expect(f.cohortSize).toBe(3);
    expect(f.contributed).toBe(2);
    expect(f.responded).toBe(1);
    expect(f.activated).toBe(1);
    expect(f.byStage.unactivated).toBe(1);
    expect(f.byStage.stalled).toBe(1); // b: window closed, no response
    expect(f.byStage.activated).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL**
      Run: `pnpm vitest run src/server/communities/activation.test.ts` → "Cannot find module './activation'".

- [ ] **Step 3: Implement `src/server/communities/activation.ts`:**

```typescript
/** Pure activation funnel logic. No DB, no clock — `now` injected. */

export const RESPONSE_ACTIONS = [
  "thread.reply",
  "feed.comment_created",
  "launchpad.comment.created",
] as const;

export type ActivationStage =
  | "unactivated"
  | "awaiting_response"
  | "awaiting_profile"
  | "activated"
  | "stalled";

export type ActivationConfig = {
  requireResponse: boolean;
  requireProfileComplete: boolean;
  windowDays: number;
};

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/** The activation stage for one member, given their signals + the community config. */
export function computeActivationStage(opts: {
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null;
  profileComplete: boolean;
  config: ActivationConfig;
  now: Date;
}): ActivationStage {
  const {
    firstContributionAt,
    firstResponseReceivedAt,
    profileComplete,
    config,
    now,
  } = opts;
  if (!firstContributionAt) return "unactivated";

  const deadline = addDays(firstContributionAt, config.windowDays);
  const responseOk =
    !config.requireResponse ||
    (firstResponseReceivedAt !== null && firstResponseReceivedAt <= deadline);
  const profileOk = !config.requireProfileComplete || profileComplete;

  if (responseOk && profileOk) return "activated";
  if (!responseOk) return now <= deadline ? "awaiting_response" : "stalled";
  return "awaiting_profile"; // responseOk but profile incomplete
}

export type FunnelMemberInput = {
  userId: string;
  joinedAt: Date;
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null;
  profileComplete: boolean;
};

export type ActivationFunnel = {
  cohortSize: number;
  contributed: number;
  responded: number;
  activated: number;
  byStage: Record<ActivationStage, number>;
};

/** Aggregate the newcomer cohort into funnel counts + per-stage tallies. */
export function selectActivationFunnel(opts: {
  members: FunnelMemberInput[];
  config: ActivationConfig;
  now: Date;
}): ActivationFunnel {
  const byStage: Record<ActivationStage, number> = {
    unactivated: 0,
    awaiting_response: 0,
    awaiting_profile: 0,
    activated: 0,
    stalled: 0,
  };
  let contributed = 0;
  let responded = 0;
  let activated = 0;
  for (const m of opts.members) {
    if (m.firstContributionAt) contributed++;
    if (
      m.firstContributionAt &&
      m.firstResponseReceivedAt !== null &&
      m.firstResponseReceivedAt <=
        addDays(m.firstContributionAt, opts.config.windowDays)
    ) {
      responded++;
    }
    const stage = computeActivationStage({
      firstContributionAt: m.firstContributionAt,
      firstResponseReceivedAt: m.firstResponseReceivedAt,
      profileComplete: m.profileComplete,
      config: opts.config,
      now: opts.now,
    });
    byStage[stage]++;
    if (stage === "activated") activated++;
  }
  return {
    cohortSize: opts.members.length,
    contributed,
    responded,
    activated,
    byStage,
  };
}
```

- [ ] **Step 4: Run → PASS**
      Run: `pnpm vitest run src/server/communities/activation.test.ts` → all pass.

- [ ] **Step 5: Add the 3 schema tables** in `src/server/db/schema.ts`, immediately after `communityEngageConfig` (~line 827). `index`/`uniqueIndex` are already imported.

```typescript
export const communityActivationConfig = appSchema.table(
  "community_activation_config",
  (d) => ({
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => communities.id),
    requireResponse: d.boolean().notNull().default(true),
    requireProfileComplete: d.boolean().notNull().default(false),
    windowDays: d.integer().notNull().default(7),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);

export const communityOnboardingStep = appSchema.table(
  "community_onboarding_step",
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
    title: d.varchar({ length: 255 }).notNull(),
    href: d.varchar({ length: 500 }).notNull(),
    position: d.integer().notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("community_onboarding_step_community_pos_idx").on(
      t.communityId,
      t.position,
    ),
  ],
);

export const communityOnboardingProgress = appSchema.table(
  "community_onboarding_progress",
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
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    stepId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communityOnboardingStep.id),
    completedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("community_onboarding_progress_uidx").on(
      t.communityId,
      t.userId,
      t.stepId,
    ),
    index("community_onboarding_progress_member_idx").on(
      t.communityId,
      t.userId,
    ),
  ],
);
```

- [ ] **Step 6: Create migration `src/migrations/20260531e_activation.ts`:**

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."community_activation_config" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."community"("id"),
      "require_response" boolean DEFAULT true NOT NULL,
      "require_profile_complete" boolean DEFAULT false NOT NULL,
      "window_days" integer DEFAULT 7 NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "app"."community_onboarding_step" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "title" varchar(255) NOT NULL,
      "href" varchar(500) NOT NULL,
      "position" integer DEFAULT 0 NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "community_onboarding_step_community_pos_idx" ON "app"."community_onboarding_step" USING btree ("community_id","position");

    CREATE TABLE IF NOT EXISTS "app"."community_onboarding_progress" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "step_id" varchar(255) NOT NULL REFERENCES "app"."community_onboarding_step"("id"),
      "completed_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "community_onboarding_progress_uidx" ON "app"."community_onboarding_progress" ("community_id","user_id","step_id");
    CREATE INDEX IF NOT EXISTS "community_onboarding_progress_member_idx" ON "app"."community_onboarding_progress" USING btree ("community_id","user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."community_onboarding_progress";
    DROP TABLE IF EXISTS "app"."community_onboarding_step";
    DROP TABLE IF EXISTS "app"."community_activation_config";
  `);
}
```

- [ ] **Step 7: Register** in `src/migrations/index.ts` — add `import * as migration_20260531e_activation from "./20260531e_activation";` and append as the LAST array entry:

```typescript
  {
    up: migration_20260531e_activation.up,
    down: migration_20260531e_activation.down,
    name: "20260531e_activation",
  },
```

- [ ] **Step 8: Verify + format + commit**
      Run: `pnpm check` (no new errors), `pnpm prettier --write` the 5 files, `pnpm format:check`.

```bash
git add src/server/communities/activation.ts src/server/communities/activation.test.ts src/server/db/schema.ts src/migrations/20260531e_activation.ts src/migrations/index.ts
git commit -m "feat(activate): activation schema + migration + pure stage/funnel logic"
```

---

## Task 2: Reciprocity instrumentation (`recipientId` on response actions)

**Files:** Modify `src/server/api/routers/forum.ts`, `src/server/api/routers/feed.ts`, `src/server/api/routers/launchpad.ts`.

The parent-content author is already fetched and in scope at each call site. Add ONE field to each `logActivity` call.

- [ ] **Step 1: forum.ts `thread.reply`** — in the `addReply` mutation, the `logActivity({ action: "thread.reply", ... })` call (it already includes `metadata.threadAuthorId: thread.authorId`). Add `recipientId: thread.authorId ?? undefined,` to the `logActivity` object.

- [ ] **Step 2: feed.ts `feed.comment_created`** — in the comment-create mutation, the `logActivity({ action: "feed.comment_created", ... })` call has `post` in scope (fetched via `payload.findByID({collection:"feed-posts"})`). Add `recipientId: post.authorId ?? undefined,`.

- [ ] **Step 3: launchpad.ts `launchpad.comment.created`** — in the comment mutation, `project` is in scope (fetched via `payload.findByID({collection:"launchpad-projects"})`). Add `recipientId: project.authorId ?? undefined,` to the `logActivity({ action: "launchpad.comment.created", ... })` call.

> In all three: only the `logActivity` argument object changes — append the `recipientId` line. Do NOT change the payload/db writes. `logActivity` already accepts `recipientId` (`src/server/agent/activity.ts`). A self-response (author replies to own thread) still logs recipientId=self; activation queries filter `actorId ≠ recipientId`, so self-responses don't count — no guard needed here.

- [ ] **Step 4: Verify**
      Run: `pnpm check` (clean), `pnpm vitest run` (no regressions). There is no unit test for these glue lines; they are exercised by Task 4's queries + manual.

- [ ] **Step 5: Format + commit**

```bash
pnpm prettier --write src/server/api/routers/forum.ts src/server/api/routers/feed.ts src/server/api/routers/launchpad.ts
git add src/server/api/routers/forum.ts src/server/api/routers/feed.ts src/server/api/routers/launchpad.ts
git commit -m "feat(activate): populate activity_event.recipient_id on response actions (reciprocity)"
```

---

## Task 3: Activation config router + settings UI

**Files:** Create `src/server/api/routers/activationConfig.ts`; Modify `src/server/api/root.ts`; Create `src/components/communities/activation/activation-settings.tsx`.

- [ ] **Step 1: Create `src/server/api/routers/activationConfig.ts`** (mirrors `engageConfig.ts`):

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityActivationConfig } from "@/server/db/schema";

const DEFAULTS = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};

function requireConfigAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const activationConfigRouter = createTRPCRouter({
  get: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      const [row] = await ctx.db
        .select()
        .from(communityActivationConfig)
        .where(eq(communityActivationConfig.communityId, ctx.community.id))
        .limit(1);
      return row
        ? {
            requireResponse: row.requireResponse,
            requireProfileComplete: row.requireProfileComplete,
            windowDays: row.windowDays,
          }
        : DEFAULTS;
    }),

  set: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        requireResponse: z.boolean(),
        requireProfileComplete: z.boolean(),
        windowDays: z.number().int().min(1).max(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const values = {
        requireResponse: input.requireResponse,
        requireProfileComplete: input.requireProfileComplete,
        windowDays: input.windowDays,
        updatedAt: new Date(),
      };
      await ctx.db
        .insert(communityActivationConfig)
        .values({ communityId: ctx.community.id, ...values })
        .onConflictDoUpdate({
          target: communityActivationConfig.communityId,
          set: values,
        });
      return { ok: true };
    }),
});
```

- [ ] **Step 2: Register** in `root.ts`: `import { activationConfigRouter } from "@/server/api/routers/activationConfig";` + `activationConfig: activationConfigRouter,`.

- [ ] **Step 3: Build `src/components/communities/activation/activation-settings.tsx`** — a `"use client"` panel (mirror `digest-recall-settings.tsx`): two switches (`requireResponse`, `requireProfileComplete`) + a number input for `windowDays` (1–30), bound to `api.activationConfig.get`/`set`, optimistic draft with `onError` rollback to `data`, hides on FORBIDDEN. Captions: response = "Count a newcomer activated only once their first contribution gets a reply." profile = "Also require a completed profile (onboarding done + interests & experience set)." Mount it where the digest-recall settings mount (the community admin/insights settings area — grep `DigestRecallSettings` usage and add a sibling). Use shadcn `Switch`, `Input`, `Label`, `Button`, `api.useUtils()` invalidation.

- [ ] **Step 4: Verify + format + commit**
      Run `pnpm check`.

```bash
pnpm prettier --write src/server/api/routers/activationConfig.ts src/server/api/root.ts src/components/communities/activation/activation-settings.tsx
git add src/server/api/routers/activationConfig.ts src/server/api/root.ts src/components/communities/activation/activation-settings.tsx
git commit -m "feat(activate): activation milestone config router + settings UI"
```

---

## Task 4: Activation tRPC — funnel + awaitingResponse + cohort queries

**Files:** Create `src/server/api/routers/activation.ts`; Modify `src/server/api/root.ts`.

This is the data layer feeding the pure core. Helpers used: `RESPONSE_ACTIONS`, `selectActivationFunnel`, `computeActivationStage` from `@/server/communities/activation`; `CONTRIBUTION_ACTIONS`, `windowStart` from `@/server/communities/insights`; `ACTIVATION_COHORT_DAYS=30`, `GREETER_GRACE_HOURS=48` constants.

- [ ] **Step 1: Create `src/server/api/routers/activation.ts`:**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, ne, isNotNull } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  communityMemberships,
  communityActivationConfig,
  memberProfiles,
  user,
} from "@/server/db/schema";
import {
  selectActivationFunnel,
  computeActivationStage,
  RESPONSE_ACTIONS,
  type ActivationConfig,
  type FunnelMemberInput,
} from "@/server/communities/activation";
import {
  CONTRIBUTION_ACTIONS,
  windowStart,
} from "@/server/communities/insights";

const ACTIVATION_COHORT_DAYS = 30;
const GREETER_GRACE_HOURS = 48;
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];
const RESPONSE_LIST: string[] = [...RESPONSE_ACTIONS];
const RESPONDABLE_CONTRIB = ["thread.create", "feed.post_created"];

function requireAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

async function loadConfig(
  db: typeof import("@/server/db").db,
  communityId: string,
): Promise<ActivationConfig> {
  const [row] = await db
    .select()
    .from(communityActivationConfig)
    .where(eq(communityActivationConfig.communityId, communityId))
    .limit(1);
  return row
    ? {
        requireResponse: row.requireResponse,
        requireProfileComplete: row.requireProfileComplete,
        windowDays: row.windowDays,
      }
    : { requireResponse: true, requireProfileComplete: false, windowDays: 7 };
}

export const activationRouter = createTRPCRouter({
  funnel: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.communityRole);
      const now = new Date();
      const cohortStart = windowStart(now, ACTIVATION_COHORT_DAYS);
      const config = await loadConfig(ctx.db, ctx.community.id);

      // Cohort: active members joined within the last 30 days.
      const memberships = await ctx.db
        .select({
          userId: communityMemberships.userId,
          joinedAt: communityMemberships.joinedAt,
        })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.status, "active"),
            gte(communityMemberships.joinedAt, cohortStart),
          ),
        );
      if (memberships.length === 0) {
        return {
          cohortSize: 0,
          contributed: 0,
          responded: 0,
          activated: 0,
          byStage: {
            unactivated: 0,
            awaiting_response: 0,
            awaiting_profile: 0,
            activated: 0,
            stalled: 0,
          },
        };
      }
      const cohortIds = memberships.map((m) => m.userId);

      // First contribution per member.
      const contribEvents = await ctx.db
        .select({
          actorId: activityEvents.actorId,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            inArray(activityEvents.actorId, cohortIds),
            inArray(activityEvents.action, CONTRIBUTION_LIST),
          ),
        );
      const firstContribution = earliestByKey(
        contribEvents,
        (e) => e.actorId,
        (e) => e.createdAt,
      );

      // First response RECEIVED per member (recipientId=member, actor≠member).
      const responseEvents = await ctx.db
        .select({
          recipientId: activityEvents.recipientId,
          actorId: activityEvents.actorId,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            isNotNull(activityEvents.recipientId),
            inArray(activityEvents.recipientId, cohortIds),
            inArray(activityEvents.action, RESPONSE_LIST),
          ),
        );
      const firstResponse = earliestByKey(
        responseEvents.filter((e) => e.recipientId !== e.actorId),
        (e) => e.recipientId!,
        (e) => e.createdAt,
      );

      // Profile completeness (hub-level): onboardingCompleted AND interests>=1 AND experienceLevel set.
      const profiles = await ctx.db
        .select({
          userId: memberProfiles.userId,
          onboardingCompleted: memberProfiles.onboardingCompleted,
          interests: memberProfiles.interests,
          experienceLevel: memberProfiles.experienceLevel,
        })
        .from(memberProfiles)
        .where(inArray(memberProfiles.userId, cohortIds));
      const profileComplete = new Map<string, boolean>(
        profiles.map((p) => [
          p.userId,
          !!p.onboardingCompleted &&
            (p.interests?.length ?? 0) >= 1 &&
            !!p.experienceLevel,
        ]),
      );

      const members: FunnelMemberInput[] = memberships.map((m) => ({
        userId: m.userId,
        joinedAt: m.joinedAt,
        firstContributionAt: firstContribution.get(m.userId) ?? null,
        firstResponseReceivedAt: firstResponse.get(m.userId) ?? null,
        profileComplete: profileComplete.get(m.userId) ?? false,
      }));
      return selectActivationFunnel({ members, config, now });
    }),

  awaitingResponse: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.communityRole);
      const now = new Date();
      const cohortStart = windowStart(now, ACTIVATION_COHORT_DAYS);
      const config = await loadConfig(ctx.db, ctx.community.id);

      const memberships = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.status, "active"),
            gte(communityMemberships.joinedAt, cohortStart),
          ),
        );
      if (memberships.length === 0) return [];
      const cohortIds = memberships.map((m) => m.userId);

      // Earliest RESPONDABLE contribution (thread/post) per member, with metadata for the link.
      const respondable = await ctx.db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            inArray(activityEvents.actorId, cohortIds),
            inArray(activityEvents.action, RESPONDABLE_CONTRIB),
          ),
        );
      const earliestRespondable = new Map<
        string,
        (typeof respondable)[number]
      >();
      for (const e of respondable) {
        const cur = earliestRespondable.get(e.actorId);
        if (!cur || e.createdAt < cur.createdAt)
          earliestRespondable.set(e.actorId, e);
      }

      // Responses received.
      const responseEvents = await ctx.db
        .select({
          recipientId: activityEvents.recipientId,
          actorId: activityEvents.actorId,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            isNotNull(activityEvents.recipientId),
            inArray(activityEvents.recipientId, cohortIds),
            inArray(activityEvents.action, RESPONSE_LIST),
          ),
        );
      const respondedSet = new Set(
        responseEvents
          .filter((e) => e.recipientId !== e.actorId)
          .map((e) => e.recipientId!),
      );

      const graceMs = GREETER_GRACE_HOURS * 60 * 60 * 1000;
      const windowMs = config.windowDays * 24 * 60 * 60 * 1000;
      const queue = [...earliestRespondable.entries()]
        .filter(([userId, e]) => {
          if (respondedSet.has(userId)) return false; // already answered
          const ageMs = now.getTime() - e.createdAt.getTime();
          return ageMs >= graceMs && ageMs <= windowMs; // past grace, still within window
        })
        .map(([userId, e]) => ({
          userId,
          action: e.action,
          targetType: e.targetType,
          targetId: e.targetId,
          metadata: e.metadata,
          contributionAt: e.createdAt,
        }));
      if (queue.length === 0) return [];

      // Hydrate names/images.
      const ids = queue.map((q) => q.userId);
      const profileRows = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(memberProfiles.userId, user.id))
        .where(inArray(memberProfiles.userId, ids));
      const pmap = new Map(
        profileRows.map((r) => [
          r.userId,
          { displayName: r.displayName, image: r.image },
        ]),
      );
      return queue
        .map((q) => ({
          ...q,
          ...(pmap.get(q.userId) ?? { displayName: null, image: null }),
        }))
        .sort(
          (a, b) => a.contributionAt.getTime() - b.contributionAt.getTime(),
        ); // oldest first (most urgent)
    }),
});

/** Earliest value per key (e.g. earliest createdAt per actorId). */
function earliestByKey<T>(
  rows: T[],
  keyOf: (r: T) => string,
  dateOf: (r: T) => Date,
): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const r of rows) {
    const k = keyOf(r);
    const d = dateOf(r);
    const cur = m.get(k);
    if (!cur || d < cur) m.set(k, d);
  }
  return m;
}
```

> Adjust the `loadConfig` db param type to whatever typechecks (e.g. `ctx.db`'s type — use `Parameters<...>` or just inline the query into each procedure if the shared-helper typing is awkward). `computeActivationStage` import may be unused in this file — drop it if so (the funnel uses `selectActivationFunnel`). Confirm `activityEvents.recipientId` is the drizzle column name (the column is `recipient_id` → `recipientId` in the schema object).

- [ ] **Step 2: Register** in `root.ts`: `import { activationRouter } from "@/server/api/routers/activation";` + `activation: activationRouter,`.

- [ ] **Step 3: Verify + commit**
      Run `pnpm check`. There's no unit test for the queries (thin glue over the tested pure core); exercised via UI + manual.

```bash
pnpm prettier --write src/server/api/routers/activation.ts src/server/api/root.ts
git add src/server/api/routers/activation.ts src/server/api/root.ts
git commit -m "feat(activate): activation funnel + awaiting-response tRPC queries"
```

---

## Task 5: Funnel dashboard + member status badges

**Files:** Create `src/components/communities/activation/activation-funnel.tsx`; modify the insights dashboard mount; create a small `activation-badge.tsx`.

- [ ] **Step 1: `activation-funnel.tsx`** — `"use client"`, `{slug}`, `api.activation.funnel.useQuery({slug})`. Render the funnel as labelled bars/rows: Joined (cohortSize) → Contributed → Responded → Activated, plus a small per-stage breakdown (unactivated / awaiting_response / awaiting_profile / stalled). Loading skeleton + FORBIDDEN-hide, mirroring `health-pulse.tsx`. Pure presentational from the query result.

- [ ] **Step 2: `activation-badge.tsx`** — a tiny `"use client"` or pure component mapping an `ActivationStage` (or a boolean activated) to a shadcn `Badge` (activated → default/green; awaiting_response → outline; unactivated → secondary; stalled → destructive-outline). Used in lists.

- [ ] **Step 3: Mount** the funnel in `src/components/communities/insights/insights-dashboard.tsx` as a new section above or beside the existing grid:

```tsx
<ActivationFunnel slug={slug} />
```

(Import it; keep the existing `HealthPulse`/`AtRiskList`/`UnactivatedList` layout.)

- [ ] **Step 4: Verify + commit**
      Run `pnpm check`.

```bash
pnpm prettier --write src/components/communities/activation/*.tsx src/components/communities/insights/insights-dashboard.tsx
git add src/components/communities/activation/activation-funnel.tsx src/components/communities/activation/activation-badge.tsx src/components/communities/insights/insights-dashboard.tsx
git commit -m "feat(activate): activation funnel dashboard + status badge"
```

---

## Task 6: Greeter — suggestGreeting + awaitingResponse advisory + MCP + queue UI

**Files:** Modify `src/server/api/routers/advisory.ts`, `src/app/api/mcp/advisory-tools.ts`; create `src/components/communities/activation/awaiting-response-list.tsx`.

- [ ] **Step 1: `advisory.newcomersAwaitingResponse`** (agentProcedure read) — mirror `atRiskMembers`/`suggestWelcome` access (`requireScope("read")`, `requireOwner`, `requireAdvisoryAccess`). It returns the same awaiting-response queue as `activation.awaitingResponse` but for the agent. Simplest: factor the queue logic so both call it, OR re-run the query scoped to the resolved community. Given the no-shared-ctx, re-run the same query body (read `activity_event`s as in Task 4) inside this procedure using the resolved `community.id`. Return `[{ userId, targetType, targetId, contributionAt }]` (no need to hydrate profiles for the agent).

- [ ] **Step 2: `advisory.suggestGreeting`** (agentProcedure write) — mirror `suggestWelcome` but produce a `thread_reply` draft targeting the newcomer's thread:

```typescript
  suggestGreeting: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        threadId: z.number(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "thread_reply",
          targetType: "forum-threads",
          targetId: String(input.threadId),
          content: input.message,
          metadata: { communityId: community.id, communitySlug: input.slug, greeting: true },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),
```

> `thread_reply` drafts publish via the existing `reviewDraft` thread_reply branch (owner-scoped — the agent owner approves). No reviewDraft change needed.

- [ ] **Step 3: MCP tools** in `advisory-tools.ts` — `newcomers-awaiting-response` (wraps `caller.advisory.newcomersAwaitingResponse`) and `suggest-greeting` (wraps `caller.advisory.suggestGreeting`, inputs slug/threadId/message). Description for suggest-greeting: "Draft a warm reply to a newcomer's unanswered first post, saved for an admin to review and post in their own name. Completes the activation reciprocity. You never post it yourself." Update any tool-count comment.

- [ ] **Step 4: `awaiting-response-list.tsx`** — `"use client"`, `{slug}`, `api.activation.awaitingResponse.useQuery({slug})`. Each row: newcomer (avatar + name) + "posted N days ago, no reply yet" + a **Reply in thread** link (build the href from `targetType`/`targetId`/`metadata.threadSlug` — for `thread.create` use the thread slug if present, else `/communities/{slug}/forum/{targetId}`; mirror how the forum thread link is built elsewhere — grep for an existing thread link). Empty/loading states. Mount it in the insights dashboard (sibling of `UnactivatedList`). (The agent-draft path is exercised via MCP; the human path here is the reply link.)

- [ ] **Step 5: Verify + commit**
      Run `pnpm check`, `pnpm vitest run` (no regressions).

```bash
pnpm prettier --write src/server/api/routers/advisory.ts src/app/api/mcp/advisory-tools.ts src/components/communities/activation/awaiting-response-list.tsx src/components/communities/insights/insights-dashboard.tsx
git add src/server/api/routers/advisory.ts src/app/api/mcp/advisory-tools.ts src/components/communities/activation/awaiting-response-list.tsx src/components/communities/insights/insights-dashboard.tsx
git commit -m "feat(activate): greeter — awaiting-response advisory + suggestGreeting + MCP + queue UI"
```

---

## Task 7: Near-churn cron — notify admins

**Files:** Create `src/app/api/cron/activation-newcomer-churn/route.ts`; modify `vercel.json`.

- [ ] **Step 1: Create the cron route** (mirror `event-reminders/route.ts` auth/exports):

```typescript
import { NextResponse } from "next/server";
import { and, eq, gte, lte, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  communityMemberships,
  activityEvents,
  notifications,
  communities,
} from "@/server/db/schema";
import {
  CONTRIBUTION_ACTIONS,
  windowStart,
} from "@/server/communities/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHURN_MIN_DAYS = 23;
const CHURN_MAX_DAYS = 30;
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const youngCutoff = windowStart(now, CHURN_MIN_DAYS); // joined on/before this
  const oldCutoff = windowStart(now, CHURN_MAX_DAYS); // joined on/after this

  // Active members joined 23–30d ago.
  const cohort = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
    })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.status, "active"),
        lte(communityMemberships.joinedAt, youngCutoff),
        gte(communityMemberships.joinedAt, oldCutoff),
      ),
    );
  if (cohort.length === 0)
    return NextResponse.json({ success: true, notified: 0 });

  // Who has EVER contributed (any of their communities — scope to community below).
  const cohortIds = [...new Set(cohort.map((c) => c.userId))];
  const contributors = await db
    .selectDistinct({
      actorId: activityEvents.actorId,
      communityId: activityEvents.communityId,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.actorId, cohortIds),
        inArray(activityEvents.action, CONTRIBUTION_LIST),
      ),
    );
  const contributedKey = new Set(
    contributors.map((c) => `${c.communityId}:${c.actorId}`),
  );

  // Un-activated near-churn newcomers per community.
  const byCommunity = new Map<string, number>();
  for (const m of cohort) {
    if (contributedKey.has(`${m.communityId}:${m.userId}`)) continue;
    byCommunity.set(m.communityId, (byCommunity.get(m.communityId) ?? 0) + 1);
  }
  if (byCommunity.size === 0)
    return NextResponse.json({ success: true, notified: 0 });

  // Notify each community's owner/admins.
  const communityIds = [...byCommunity.keys()];
  const admins = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      role: communityMemberships.role,
    })
    .from(communityMemberships)
    .where(
      and(
        inArray(communityMemberships.communityId, communityIds),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, ["owner", "admin"]),
      ),
    );
  const communityNames = new Map(
    (
      await db
        .select({ id: communities.id, name: communities.name })
        .from(communities)
        .where(inArray(communities.id, communityIds))
    ).map((c) => [c.id, c.name]),
  );

  // Idempotency: one notification per (admin, community, ISO-week).
  const weekKey = isoWeekKey(now);
  const rows = admins.map((a) => ({
    userId: a.userId,
    type: "newcomer_churn_risk",
    title: "Newcomers about to lapse",
    content: `${byCommunity.get(a.communityId)} newcomer(s) in ${communityNames.get(a.communityId) ?? "your community"} joined ~3–4 weeks ago and haven't contributed yet. A warm welcome now can still activate them.`,
    communityId: a.communityId,
    metadata: { count: byCommunity.get(a.communityId), weekKey },
  }));
  if (rows.length) await db.insert(notifications).values(rows);

  return NextResponse.json({ success: true, notified: rows.length });
}

function isoWeekKey(d: Date): string {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${week}`;
}
```

> Notification dedup: this cron runs weekly so a duplicate within a week is unlikely; if you want a hard guard, add a unique check on `metadata.weekKey` or accept at-most-weekly cadence. Confirm `notifications.type` is a free varchar (it is) so `"newcomer_churn_risk"` is fine. Confirm `communities.name` column.

- [ ] **Step 2: Register in `vercel.json`** — add to the `crons` array: `{ "path": "/api/cron/activation-newcomer-churn", "schedule": "0 8 * * 1" }` (weekly, Monday 08:00 UTC). Keep valid JSON.

- [ ] **Step 3: Verify + commit**
      Run `pnpm check`.

```bash
pnpm prettier --write src/app/api/cron/activation-newcomer-churn/route.ts vercel.json
git add src/app/api/cron/activation-newcomer-churn/route.ts vercel.json
git commit -m "feat(activate): near-churn cron — notify admins of lapsing newcomers"
```

---

## Task 8: Onboarding wizard backend (admin-authored steps)

**Files:** Create `src/server/api/routers/onboardingSteps.ts`; modify `src/server/api/root.ts`. (Tables exist from Task 1.)

- [ ] **Step 1: Create `src/server/api/routers/onboardingSteps.ts`:**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  communityOnboardingStep,
  communityOnboardingProgress,
} from "@/server/db/schema";

function requireConfigAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin")
    throw new TRPCError({ code: "FORBIDDEN" });
}

export const onboardingStepsRouter = createTRPCRouter({
  // ── Admin authoring (owner/admin) ──
  list: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      return ctx.db
        .select()
        .from(communityOnboardingStep)
        .where(eq(communityOnboardingStep.communityId, ctx.community.id))
        .orderBy(asc(communityOnboardingStep.position));
    }),

  create: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(1).max(255),
        href: z.string().min(1).max(500),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const [s] = await ctx.db
        .insert(communityOnboardingStep)
        .values({
          communityId: ctx.community.id,
          title: input.title,
          href: input.href,
          position: input.position,
        })
        .returning({ id: communityOnboardingStep.id });
      return { stepId: s!.id };
    }),

  update: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        stepId: z.string(),
        title: z.string().min(1).max(255).optional(),
        href: z.string().min(1).max(500).optional(),
        position: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const { slug: _s, stepId, ...fields } = input;
      await ctx.db
        .update(communityOnboardingStep)
        .set(fields)
        .where(
          and(
            eq(communityOnboardingStep.id, stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  remove: communityProcedure
    .input(z.object({ slug: z.string(), stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      // Delete member progress for the step first (no FK cascade in neon-http path).
      await ctx.db
        .delete(communityOnboardingProgress)
        .where(eq(communityOnboardingProgress.stepId, input.stepId));
      await ctx.db
        .delete(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.id, input.stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  // ── Member-facing ──
  listForMe: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const [steps, done] = await Promise.all([
        ctx.db
          .select()
          .from(communityOnboardingStep)
          .where(eq(communityOnboardingStep.communityId, ctx.community.id))
          .orderBy(asc(communityOnboardingStep.position)),
        ctx.db
          .select({ stepId: communityOnboardingProgress.stepId })
          .from(communityOnboardingProgress)
          .where(
            and(
              eq(communityOnboardingProgress.communityId, ctx.community.id),
              eq(communityOnboardingProgress.userId, userId),
            ),
          ),
      ]);
      const doneSet = new Set(done.map((d) => d.stepId));
      return steps.map((s) => ({
        id: s.id,
        title: s.title,
        href: s.href,
        position: s.position,
        completed: doneSet.has(s.id),
      }));
    }),

  markComplete: communityProcedure
    .input(z.object({ slug: z.string(), stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Validate the step belongs to this community.
      const [step] = await ctx.db
        .select({ id: communityOnboardingStep.id })
        .from(communityOnboardingStep)
        .where(
          and(
            eq(communityOnboardingStep.id, input.stepId),
            eq(communityOnboardingStep.communityId, ctx.community.id),
          ),
        )
        .limit(1);
      if (!step) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .insert(communityOnboardingProgress)
        .values({ communityId: ctx.community.id, userId, stepId: input.stepId })
        .onConflictDoNothing();
      return { ok: true };
    }),
});
```

> Reorder is handled by `update` with a new `position` per step (the UI sends updated positions). `requireConfigAdmin` (owner/admin) gates authoring; member procedures are open to any authenticated community member (no role gate beyond `communityProcedure` membership). Confirm `communityProcedure` requires the caller to be a member; if a non-member could call `listForMe`, that's acceptable (returns their empty progress).

- [ ] **Step 2: Register** in `root.ts`: `import { onboardingStepsRouter } from "@/server/api/routers/onboardingSteps";` + `onboardingSteps: onboardingStepsRouter,`.

- [ ] **Step 3: Verify + commit**
      Run `pnpm check`.

```bash
pnpm prettier --write src/server/api/routers/onboardingSteps.ts src/server/api/root.ts
git add src/server/api/routers/onboardingSteps.ts src/server/api/root.ts
git commit -m "feat(activate): community onboarding steps router (admin CRUD + member progress)"
```

---

## Task 9: Onboarding UI — admin authoring + member checklist

**Files:** Create `src/components/communities/onboarding/onboarding-steps-admin.tsx`, `src/components/communities/onboarding/welcome-checklist.tsx`; mount each.

- [ ] **Step 1: `onboarding-steps-admin.tsx`** — `"use client"`, `{slug}`. Lists `api.onboardingSteps.list.useQuery({slug})`; each step row editable (title, href) with Save (`update`), Delete (`remove`), and up/down reorder (calls `update` with swapped `position`s). An "Add step" form (`create`, position = current count). Invalidate `list` on each mutation. Gate to owner/admin (hide on FORBIDDEN). Mount in the community admin settings area (sibling of the activation/digest settings panels).

- [ ] **Step 2: `welcome-checklist.tsx`** — `"use client"`, `{slug}`. Member-facing: `api.onboardingSteps.listForMe.useQuery({slug})` renders a checklist (each step a link to `href` + a checkbox calling `markComplete`). **Auto-hide when the member is activated** — query `api.activation.funnel`? No, that's admin-gated. Instead add a lightweight member-scoped `api.activation.myStage` query (add to `activation.ts`: a `communityProcedure` returning `computeActivationStage` for `ctx.session.user.id` using the same per-member signal loads, no admin gate) and hide the checklist when stage === "activated". If adding `myStage` is out of scope, hide the checklist only when all steps are completed (simpler fallback) — choose the `myStage` approach for correctness and note it. Mount on the community landing/home page for members (grep where a community member home renders; place near the top, dismissible).

> If you add `activation.myStage`, it loads only the caller's own first-contribution/first-response/profile signals (scoped to `ctx.session.user.id` + `ctx.community.id`) and returns the stage — no `requireAdmin`. Keep it minimal.

- [ ] **Step 3: i18n** — add any new message keys to BOTH `messages/en.json` and `messages/nl.json` if the components use `useTranslations` (mirror how rituals/insights components do; if you hardcode strings consistent with neighbors, ensure consistency). Prefer matching the existing i18n usage of sibling components.

- [ ] **Step 4: Verify + commit**
      Run `pnpm check`.

```bash
pnpm prettier --write src/components/communities/onboarding/*.tsx <mount files> src/server/api/routers/activation.ts messages/en.json messages/nl.json
git add src/components/communities/onboarding/ <mount files> src/server/api/routers/activation.ts messages/en.json messages/nl.json
git commit -m "feat(activate): onboarding UI — admin step authoring + member welcome checklist"
```

---

## Task 10: CONTEXT.md + integration verification

**Files:** Modify `CONTEXT.md` (ADR-0017 already committed).

- [ ] **Step 1: Update CONTEXT.md** — add glossary entries (terse, house style, `[[wiki-links]]`, ADR cross-refs as `[[adr-0017-activation-milestone-and-reciprocity]]`):
  - **Activation / Activation milestone** — the admin-tunable milestone (contribution baseline + optional reciprocal response within window + optional profile-complete); the funnel joined → contributed → responded → activated; stages (`unactivated`/`awaiting_response`/`awaiting_profile`/`activated`/`stalled`).
  - **Greeter** — owner/admin/moderator who guarantees a newcomer's first contribution gets a response (reply or agent-drafted `thread_reply`); the awaiting-response queue (48h grace, within window).
  - Note reciprocity is measured via `activity_event.recipient_id` populated forward-only on response actions.
  - Note community onboarding steps are admin-authored and the member checklist hides once activated.

- [ ] **Step 2: Full verification sweep** — run and confirm:

```bash
pnpm vitest run src/server/communities/activation.test.ts
pnpm vitest run
pnpm check
pnpm format:check
```

Expect: activation suite passes; full suite green except the one pre-existing `agent-suggestions.test.tsx` NextIntl failure (no NEW failures); check clean (pre-existing `insights.ts`/`rituals.ts` warnings OK); format clean.

- [ ] **Step 3: Registration sanity** — confirm `activation`, `activationConfig`, `onboardingSteps` are in `root.ts`; the new MCP tools (`newcomers-awaiting-response`, `suggest-greeting`) are registered in `advisory-tools.ts`; the cron is in `vercel.json`; the migration is the LAST entry in `index.ts`.

- [ ] **Step 4: Commit** (stage ONLY CONTEXT.md — `git status` first):

```bash
pnpm prettier --write CONTEXT.md
git add CONTEXT.md
git commit -m "docs(activate): CONTEXT.md — activation milestone, greeter, reciprocity, onboarding steps"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** milestone config (T3) · reciprocity instrumentation (T2) · pure stage/funnel (T1) · funnel + awaiting-response queries (T4) · funnel dashboard + badges (T5) · greeter advisory + MCP + queue (T6) · near-churn cron (T7) · admin-authored onboarding backend (T8) + UI (T9) · ADR-0017 + CONTEXT (T10, ADR pre-committed). Profile-complete = onboardingCompleted AND interests≥1 AND experienceLevel — realized in T4/T9. ✅
- **Type consistency:** `ActivationConfig`/`ActivationStage`/`FunnelMemberInput`/`ActivationFunnel` (T1) consumed unchanged in T4/T5/T9; `RESPONSE_ACTIONS` (T1) used by T4's queries; the 3 response actions instrumented in T2 match `RESPONSE_ACTIONS`; `thread_reply` draft (T6) matches the existing reviewDraft publish branch; constants (`ACTIVATION_COHORT_DAYS`/`GREETER_GRACE_HOURS`/`CHURN_*`) consistent. ✅
- **Open implementation notes flagged inline** (loadConfig db typing, `myStage` addition for checklist hide, reply-link building, notification dedup) rather than left as silent gaps. ✅
