# Slice F — Agent Advisory Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a community organizer's own registered agent advise them — under a per-community autonomy switch — by drafting introduction-suggestions between members (double-opt-in → conversation) and a revival nudge for an at-risk member (organizer-sent DM), never posting as itself in human surfaces.

**Architecture:** Pure logic (`src/server/agents/*.ts`, vitest) + thin tRPC (`advisory` router for the agent + member consent; extensions to `communities`/`agent-management`/`agent-communities`) + reuse of `agent_draft`/`agent_suggestion`, the inbox `conversation`/`message` system, and Slice A insights. One new `community.autonomyLevel` column and one new `introduction` table.

**Tech Stack:** Next.js App Router, tRPC v11, Drizzle ORM (Neon HTTP), Payload CMS, vitest, next-intl, shadcn/ui.

**GitHub:** Epic #56 (Slice F). Tasks below become `role:task` sub-issues. Design: `docs/plans/2026-05-31-slice-f-agent-advisory-design.md`. Decisions: `docs/adr/0015`, `0013`; `CONTEXT.md`.

---

## Background facts (verified during planning)

- **Agent gating helpers** (`src/server/api/routers/agent-communities.ts:31-83`): module-private `resolveCommunity(db, slug)` (findFirst by slug, non-deleted, throws NOT_FOUND), `resolveOwnerMembership(db, communityId, ownerId)` (active membership or null), `requireAdmin(db, communityId, ownerId)` (throws FORBIDDEN unless owner/admin). The advisory router re-declares its own equivalents (the codebase keeps these per-file).
- **agentProcedure** (`trpc.ts:187`): injects `ctx.agent {agentId, ownerId, scopes}`. `requireScope(ctx.agent.scopes, "read"|"contribute")` and `requireOwner(ctx.agent.ownerId)` are imported from `@/server/api/trpc`.
- **agent_draft / agent_suggestion** CRUD (`agent-management.ts:632-774`): `getDrafts`/`reviewDraft`/`getSuggestions`/`dismissSuggestion` are `protectedProcedure`, scoped by `ownerId`. `reviewDraft` already special-cases `type === "thread_reply"` to publish via Payload — extend the same switch for `revival_nudge`.
- **visibilityMode branch sites** (ADR-0015 fix): `agent.ts:1067` (replyToThread), `:1236` (shareKnowledge), `:1930` (challenge post), `:2069` (challenge reply); `agent-feed.ts:223` (postToFeed), `:323` (commentOnPost). Each is `if (agent.visibilityMode === "ghost") { …insert draft…; return } …direct post…; return { mode:"visible", posted:true }`. The fix removes the direct-post branch so these **always** draft.
- **community table** (`schema.ts:2056`, exported `communities`, real table `"community"`): add `autonomyLevel`. Admin-gate idiom (`communities.ts:629`): `if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") throw new TRPCError({ code: "FORBIDDEN" })`.
- **Inbox DM creation** (`inbox.ts:418-427`): `insert(conversations).values({ type: "dm" }).returning()` then `insert(conversationParticipants).values([{conversationId, userId:a},{conversationId, userId:b}])`; messages via `insert(messages).values({ conversationId, senderId, senderType:"human", content })`. Exports `conversations`, `conversationParticipants`, `messages`.
- **member_profile** (`schema.ts:201`, exported `memberProfiles`): `interests` json `string[]` (nullable, default `[]`), `skills` json `string[]` (notNull default `[]`), `userId` pk.
- **Insights pure fn** (`src/server/communities/insights.ts`): `selectAtRisk({ memberships, contributions, now, windowDays, priorWindowDays, cap })` returns `AtRiskMember[]` (`{userId, role, priorContributions, lastContributionAt}`). The `insights.ts` router (`atRiskMembers`) shows the exact query feeding it.
- **Migrations**: `src/migrations/<key>.ts` export `up`/`down` (`sql` from `@payloadcms/db-postgres`), register in `src/migrations/index.ts` (import + last array entry). App tables in `"app"` schema. Latest on main: `20260531_notifications_harden_unique_indexes`.
- **Tests**: pure vitest (`describe/it/expect`, import the fn). No DB harness.

## File structure
- Create `src/server/agents/advisory.ts` (+ `.test.ts`) — `canAdvise`, `nextIntroStatus`.
- Create `src/server/agents/matching.ts` (+ `.test.ts`) — `pairKey`, `scoreIntroductions`.
- Modify `src/server/db/schema.ts` — `community.autonomyLevel`; `introductions` table.
- Create `src/migrations/20260531b_community_autonomy_level.ts`, `src/migrations/20260531c_agent_introductions.ts`; register both in `index.ts`.
- Create `src/server/api/routers/advisory.ts`; register in `root.ts`.
- Modify `src/server/api/routers/communities.ts` — `setAutonomyLevel`.
- Modify `src/server/api/routers/agent-management.ts` — `approveIntroduction`; `reviewDraft` revival branch.
- Modify `src/server/api/routers/agent-communities.ts` — gate moderation suggestions on `canAdvise`.
- Modify `src/server/api/routers/agent.ts`, `agent-feed.ts` — always-draft on human surfaces.
- UI: `src/components/communities/settings/*` (autonomy toggle), extend `src/components/agent-suggestions.tsx`/`agent-drafts.tsx`, a member intro-consent surface; `messages/en.json`+`nl.json`.

---

## Task 1: `canAdvise` + `nextIntroStatus` (pure)

**Files:** Create `src/server/agents/advisory.ts`; Test `src/server/agents/advisory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/agents/advisory.test.ts
import { describe, expect, it } from "vitest";
import { canAdvise, nextIntroStatus } from "./advisory";

describe("canAdvise", () => {
  it("allows when autonomy is 'suggest'", () => {
    expect(canAdvise("suggest")).toBe(true);
  });
  it("blocks when 'off' or anything else", () => {
    expect(canAdvise("off")).toBe(false);
    expect(canAdvise("")).toBe(false);
  });
});

describe("nextIntroStatus", () => {
  it("stays pending until both accept", () => {
    expect(nextIntroStatus("pending", "pending")).toBe("pending_consent");
    expect(nextIntroStatus("accepted", "pending")).toBe("pending_consent");
  });
  it("connects only when both accept", () => {
    expect(nextIntroStatus("accepted", "accepted")).toBe("connected");
  });
  it("declines if either declines (even if the other accepted)", () => {
    expect(nextIntroStatus("declined", "pending")).toBe("declined");
    expect(nextIntroStatus("accepted", "declined")).toBe("declined");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/agents/advisory.test.ts`
Expected: FAIL — `Cannot find module './advisory'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/agents/advisory.ts

/** Per-community agent autonomy (ADR-0013 community-policy zone). Only "suggest"
 *  permits agents to file suggestions/drafts for the community; "off" blocks all. */
export function canAdvise(autonomyLevel: string): boolean {
  return autonomyLevel === "suggest";
}

export type IntroResponse = "pending" | "accepted" | "declined";
export type IntroStatus = "pending_consent" | "connected" | "declined";

/** Double-opt-in state machine: connect only when both accept; decline if
 *  either declines; otherwise still awaiting consent. */
export function nextIntroStatus(
  a: IntroResponse,
  b: IntroResponse,
): IntroStatus {
  if (a === "declined" || b === "declined") return "declined";
  if (a === "accepted" && b === "accepted") return "connected";
  return "pending_consent";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/agents/advisory.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/server/agents/advisory.ts src/server/agents/advisory.test.ts
git commit -m "feat(advisory): autonomy gate + intro consent state machine (T1 / #56)"
```

---

## Task 2: `pairKey` + `scoreIntroductions` (pure)

**Files:** Create `src/server/agents/matching.ts`; Test `src/server/agents/matching.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/agents/matching.test.ts
import { describe, expect, it } from "vitest";
import { pairKey, scoreIntroductions, type MemberProfile } from "./matching";

const m = (userId: string, interests: string[], skills: string[] = []): MemberProfile => ({
  userId,
  interests,
  skills,
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
    expect(pairKey("a", "b")).toBe("a|b");
  });
});

describe("scoreIntroductions", () => {
  it("pairs members by shared interests/skills, ranked by overlap", () => {
    const res = scoreIntroductions({
      members: [
        m("u1", ["ai", "rust"]),
        m("u2", ["ai", "rust"]), // 2 shared with u1
        m("u3", ["ai"], ["go"]), // 1 shared with u1/u2
      ],
    });
    expect(res[0]).toMatchObject({ userIdA: "u1", userIdB: "u2" });
    expect(res[0]!.sharedInterests).toEqual(["ai", "rust"]);
    expect(res[0]!.score).toBeGreaterThan(res[res.length - 1]!.score);
  });

  it("excludes pairs with zero overlap", () => {
    const res = scoreIntroductions({
      members: [m("u1", ["ai"]), m("u2", ["cooking"])],
    });
    expect(res).toEqual([]);
  });

  it("excludes already-connected/suggested pairs via excludePairs", () => {
    const res = scoreIntroductions({
      members: [m("u1", ["ai"]), m("u2", ["ai"])],
      excludePairs: new Set([pairKey("u1", "u2")]),
    });
    expect(res).toEqual([]);
  });

  it("counts shared skills too and respects the cap", () => {
    const res = scoreIntroductions({
      members: [
        m("u1", [], ["rust", "go"]),
        m("u2", [], ["rust", "go"]),
        m("u3", [], ["rust"]),
      ],
      cap: 1,
    });
    expect(res.length).toBe(1);
    expect(res[0]!.sharedSkills).toEqual(["rust", "go"]);
  });

  it("is deterministic: ties broken by userId", () => {
    const res = scoreIntroductions({
      members: [m("ub", ["x"]), m("ua", ["x"]), m("uc", ["x"])],
    });
    // all pairs share 1 interest; first pair is the lexicographically smallest
    expect(res[0]).toMatchObject({ userIdA: "ua", userIdB: "ub" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/agents/matching.test.ts`
Expected: FAIL — `Cannot find module './matching'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/agents/matching.ts

export type MemberProfile = {
  userId: string;
  interests: string[];
  skills: string[];
};

export type IntroCandidate = {
  userIdA: string; // always the lexicographically smaller id
  userIdB: string;
  sharedInterests: string[];
  sharedSkills: string[];
  score: number;
};

/** Order-independent key for an unordered member pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function overlap(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

/** Rank candidate introductions by shared interests (weighted ×2) + shared
 *  skills. Excludes zero-overlap pairs, self-pairs, and excluded pairs.
 *  Deterministic: sorted by score desc, then userIdA, then userIdB. */
export function scoreIntroductions(opts: {
  members: MemberProfile[];
  excludePairs?: Set<string>;
  cap?: number;
}): IntroCandidate[] {
  const { members, excludePairs, cap } = opts;
  const out: IntroCandidate[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const m1 = members[i]!;
      const m2 = members[j]!;
      const [a, b] = m1.userId < m2.userId ? [m1, m2] : [m2, m1];
      if (excludePairs?.has(pairKey(a.userId, b.userId))) continue;
      const sharedInterests = overlap(a.interests, b.interests);
      const sharedSkills = overlap(a.skills, b.skills);
      const score = sharedInterests.length * 2 + sharedSkills.length;
      if (score === 0) continue;
      out.push({
        userIdA: a.userId,
        userIdB: b.userId,
        sharedInterests,
        sharedSkills,
        score,
      });
    }
  }
  out.sort(
    (x, y) =>
      y.score - x.score ||
      x.userIdA.localeCompare(y.userIdA) ||
      x.userIdB.localeCompare(y.userIdB),
  );
  return cap != null ? out.slice(0, cap) : out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/agents/matching.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/agents/matching.ts src/server/agents/matching.test.ts
git commit -m "feat(advisory): introduction matching by shared interests/skills (T2 / #56)"
```

---

## Task 3: `community.autonomyLevel` column + migration + `setAutonomyLevel`

**Files:** Modify `src/server/db/schema.ts`; Create `src/migrations/20260531b_community_autonomy_level.ts`; Modify `src/migrations/index.ts`; Modify `src/server/api/routers/communities.ts`

- [ ] **Step 1: Add the column to the `communities` table** (`schema.ts:2056`, inside the column builder, after `feedPostPolicy`):

```ts
    autonomyLevel: d
      .varchar("autonomy_level", { length: 10 })
      .notNull()
      .default("suggest")
      .$type<"off" | "suggest">(),
```

- [ ] **Step 2: Migration** — `src/migrations/20260531b_community_autonomy_level.ts`:

```ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      ADD COLUMN IF NOT EXISTS "autonomy_level" varchar(10) DEFAULT 'suggest' NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community" DROP COLUMN IF EXISTS "autonomy_level";
  `);
}
```

Register in `src/migrations/index.ts` (import line + last array entry, name `"20260531b_community_autonomy_level"`).

- [ ] **Step 3: Add the `setAutonomyLevel` mutation** to `communities.ts` (near `updateSettings`, ~line 613). It is a `communityProcedure` with the standard admin gate:

```ts
  setAutonomyLevel: communityProcedure
    .input(
      z.object({ slug: z.string(), level: z.enum(["off", "suggest"]) }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db
        .update(communities)
        .set({ autonomyLevel: input.level })
        .where(eq(communities.id, ctx.community.id));
      return { ok: true };
    }),
```

> Confirm `communities`, `eq`, `z`, `TRPCError` are imported in `communities.ts` (they are — used throughout). `ctx.community` is injected by `communityProcedure`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260531b_community_autonomy_level.ts src/migrations/index.ts src/server/api/routers/communities.ts
git commit -m "feat(advisory): per-community autonomyLevel column + setAutonomyLevel (T3 / #56)"
```

---

## Task 4: `introductions` table + migration

**Files:** Modify `src/server/db/schema.ts`; Create `src/migrations/20260531c_agent_introductions.ts`; Modify `src/migrations/index.ts`

- [ ] **Step 1: Add the Drizzle table** (append near the other agent tables, after `agentSuggestions`):

```ts
/** A double-opt-in introduction between two members, suggested by an agent and
 *  approved by the community organizer. `pairKey` (= communityId + sorted user
 *  ids) + a partial unique index prevents a second OPEN intro for the same pair.
 *  responseA/responseB drive the consent state machine (see agents/advisory.ts). */
export const introductions = appSchema.table(
  "introduction",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    communityId: d
      .varchar("community_id", { length: 255 })
      .notNull()
      .references(() => communities.id),
    suggestedByAgentId: d
      .varchar("suggested_by_agent_id", { length: 255 })
      .references(() => agentProfiles.id),
    organizerId: d
      .varchar("organizer_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    userIdA: d
      .varchar("user_id_a", { length: 255 })
      .notNull()
      .references(() => user.id),
    userIdB: d
      .varchar("user_id_b", { length: 255 })
      .notNull()
      .references(() => user.id),
    pairKey: d.varchar("pair_key", { length: 600 }).notNull(),
    sharedInterests: d.json("shared_interests").$type<string[]>().notNull().default([]),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("pending_consent")
      .$type<"pending_consent" | "connected" | "declined">(),
    responseA: d
      .varchar("response_a", { length: 10 })
      .notNull()
      .default("pending")
      .$type<"pending" | "accepted" | "declined">(),
    responseB: d
      .varchar("response_b", { length: 10 })
      .notNull()
      .default("pending")
      .$type<"pending" | "accepted" | "declined">(),
    conversationId: d
      .varchar("conversation_id", { length: 255 })
      .references(() => conversations.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("introduction_user_a_idx").on(t.userIdA),
    index("introduction_user_b_idx").on(t.userIdB),
    index("introduction_community_idx").on(t.communityId),
    // at most one OPEN intro per (community, pair)
    uniqueIndex("introduction_open_pair_uidx")
      .on(t.communityId, t.pairKey)
      .where(sql`${t.status} = 'pending_consent'`),
  ],
);
```

> Confirm `conversations`, `agentProfiles`, `communities`, `user`, `index`, `uniqueIndex`, `sql` are in scope at that point in `schema.ts` (all are — referenced elsewhere). `conversations` is defined later in the file; Drizzle's `.references(() => conversations.id)` arrow is lazy so forward refs are fine.

- [ ] **Step 2: Migration** — `src/migrations/20260531c_agent_introductions.ts`:

```ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."introduction" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "suggested_by_agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "organizer_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "user_id_a" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "user_id_b" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "pair_key" varchar(600) NOT NULL,
      "shared_interests" json DEFAULT '[]'::json NOT NULL,
      "status" varchar(20) DEFAULT 'pending_consent' NOT NULL,
      "response_a" varchar(10) DEFAULT 'pending' NOT NULL,
      "response_b" varchar(10) DEFAULT 'pending' NOT NULL,
      "conversation_id" varchar(255) REFERENCES "app"."conversation"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "introduction_user_a_idx" ON "app"."introduction" USING btree ("user_id_a");
    CREATE INDEX IF NOT EXISTS "introduction_user_b_idx" ON "app"."introduction" USING btree ("user_id_b");
    CREATE INDEX IF NOT EXISTS "introduction_community_idx" ON "app"."introduction" USING btree ("community_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "introduction_open_pair_uidx"
      ON "app"."introduction" ("community_id", "pair_key") WHERE "status" = 'pending_consent';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."introduction";`);
}
```

> Confirm the agent-profile table's real name. Drizzle export `agentProfiles` → check its `appSchema.table("…")` name in `schema.ts` and use that exact name in the FK (`"app"."agent_profile"` assumed — VERIFY and correct if different). Register the migration in `index.ts` (import + last entry, name `"20260531c_agent_introductions"`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260531c_agent_introductions.ts src/migrations/index.ts
git commit -m "feat(advisory): introductions table + migration (T4 / #56)"
```

---

## Task 5: ADR-0015 enforcement — community-surface posts always draft

**Files:** Modify `src/server/api/routers/agent.ts` (sites ~1067, ~1236, ~1930, ~2069); Modify `src/server/api/routers/agent-feed.ts` (sites ~223, ~323)

Each site currently looks like (shape):
```ts
if (agent.visibilityMode === "ghost") {
  await ctx.db.insert(agentDrafts).values({ /* … draft … */ });
  return { mode: "ghost" as const, drafted: true /* … */ };
}
// …direct post to Payload / feed…
return { mode: "visible" as const, posted: true /* … */ };
```

- [ ] **Step 1: At each of the six sites, make the draft path unconditional.** Remove the `if (agent.visibilityMode === "ghost")` guard so the draft insert ALWAYS runs, and delete the subsequent direct-post branch for these human community surfaces. Concretely, for each site: keep the draft-insert block, drop the `if (…=== "ghost")` wrapper, and remove the code from after that block down to the `return { mode: "visible", posted: true }` (delete the direct-post + its return). The procedure now always returns the drafted result.

Worked example — `agent-feed.ts` `postToFeed` (~223):
```ts
// BEFORE
if (agent.visibilityMode === "ghost") {
  await ctx.db.insert(agentDrafts).values({ agentId: agent.id, ownerId, type: "feed_post", targetType: "community", targetId: communityId, content, metadata: {/*…*/} });
  return { mode: "ghost" as const, drafted: true };
}
// …create feed post directly in Payload/db…
return { mode: "visible" as const, posted: true };

// AFTER (ADR-0015: human community surfaces are never agent-authored)
await ctx.db.insert(agentDrafts).values({ agentId: agent.id, ownerId, type: "feed_post", targetType: "community", targetId: communityId, content, metadata: {/*…*/} });
return { mode: "ghost" as const, drafted: true };
```

Apply the equivalent edit at all six sites. If a site still needs the agent's `visibilityMode` selected for other reasons, leave the select; just remove the branch. **Do NOT touch** agent-native paths (agent feed/profile, likes — e.g. `agent-feed.ts:372` like/unlike is explicitly fine to execute directly).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean. Fix any now-unused variable (e.g. a removed `posted` path) within these procedures only.

- [ ] **Step 3: Verify behavior**

Run: `pnpm dev`. With an agent in **visible** mode and a valid API key, call `agent.replyToThread` / `feed.postToFeed` — confirm the response is now `{ mode: "ghost", drafted: true }` and a row landed in `agent_draft` (NOT a published forum reply / feed post). The agent-native like path still executes directly.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/agent.ts src/server/api/routers/agent-feed.ts
git commit -m "fix(advisory): agents never auto-post to human community surfaces (ADR-0015) (T5 / #56)"
```

---

## Task 6: `advisory` router — gated read endpoints

**Files:** Create `src/server/api/routers/advisory.ts`; Modify `src/server/api/root.ts`

- [ ] **Step 1: Write the router with its gate helper + read endpoints**

```ts
// src/server/api/routers/advisory.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, ne } from "drizzle-orm";

import { agentProcedure, requireScope, requireOwner } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  memberProfiles,
  activityEvents,
  introductions,
} from "@/server/db/schema";
import { createTRPCRouter } from "@/server/api/trpc";
import { canAdvise } from "@/server/agents/advisory";
import { pairKey, scoreIntroductions, type MemberProfile } from "@/server/agents/matching";
import {
  CONTRIBUTION_ACTIONS,
  selectAtRisk,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";

const WINDOW_DAYS = 14;
const PRIOR_WINDOW_DAYS = 45;
const AT_RISK_CAP = 50;
const INTRO_CANDIDATE_CAP = 20;

/** Resolve the community for an advisory call and assert the agent's owner is an
 *  active admin/owner AND the community autonomy level is "suggest". */
async function requireAdvisoryAccess(
  db: typeof import("@/server/db")["db"],
  slug: string,
  ownerId: string,
) {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
  });
  if (!community) throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, ownerId),
      eq(communityMemberships.status, "active"),
    ),
  });
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requires admin/owner of this community" });
  }
  if (!canAdvise(community.autonomyLevel)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agent advisory is off for this community" });
  }
  return community;
}

export const advisoryRouter = createTRPCRouter({
  /** At-risk members the agent can draft revival nudges for. */
  atRiskMembers: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);

      const now = new Date();
      const since = windowStart(now, PRIOR_WINDOW_DAYS);
      const [memberships, events] = await Promise.all([
        ctx.db
          .select({ userId: communityMemberships.userId, role: communityMemberships.role, status: communityMemberships.status, joinedAt: communityMemberships.joinedAt })
          .from(communityMemberships)
          .where(eq(communityMemberships.communityId, community.id)),
        ctx.db
          .select({ actorId: activityEvents.actorId, action: activityEvents.action, createdAt: activityEvents.createdAt })
          .from(activityEvents)
          .where(and(
            eq(activityEvents.communityId, community.id),
            gte(activityEvents.createdAt, since),
            inArray(activityEvents.action, CONTRIBUTION_ACTIONS as unknown as string[]),
          )),
      ]);
      return selectAtRisk({
        memberships: memberships as MembershipRow[],
        contributions: events as ActivityRow[],
        now,
        windowDays: WINDOW_DAYS,
        priorWindowDays: PRIOR_WINDOW_DAYS,
        cap: AT_RISK_CAP,
      });
    }),

  /** Ranked candidate member pairs to introduce, with shared interests/skills. */
  introCandidates: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);

      const rows = await ctx.db
        .select({ userId: communityMemberships.userId, interests: memberProfiles.interests, skills: memberProfiles.skills })
        .from(communityMemberships)
        .innerJoin(memberProfiles, eq(memberProfiles.userId, communityMemberships.userId))
        .where(and(eq(communityMemberships.communityId, community.id), eq(communityMemberships.status, "active")));

      const members: MemberProfile[] = rows.map((r) => ({
        userId: r.userId,
        interests: r.interests ?? [],
        skills: r.skills ?? [],
      }));

      // Exclude pairs that already have an open or connected introduction.
      const existing = await ctx.db
        .select({ pairKey: introductions.pairKey })
        .from(introductions)
        .where(and(eq(introductions.communityId, community.id), ne(introductions.status, "declined")));
      const excludePairs = new Set(existing.map((e) => e.pairKey));

      return scoreIntroductions({ members, excludePairs, cap: INTRO_CANDIDATE_CAP });
    }),
});
```

> Verify `selectAtRisk`/`windowStart`/`CONTRIBUTION_ACTIONS`/`ActivityRow`/`MembershipRow` are exported from `@/server/communities/insights` (they are — used by `insights.ts` router). Verify `activityEvents` export name. The `pairKey` import is used by later tasks too; if unused here, drop it (matching returns the candidates; the exclude set uses the stored `pair_key`).

- [ ] **Step 2: Register the router** in `src/server/api/root.ts` (`import { advisoryRouter } …` + `advisory: advisoryRouter,`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/advisory.ts src/server/api/root.ts
git commit -m "feat(advisory): gated agent read endpoints (at-risk + intro candidates) (T6 / #56)"
```

---

## Task 7: `advisory` write endpoints — `suggestIntroduction`, `suggestRevival`

**Files:** Modify `src/server/api/routers/advisory.ts`

- [ ] **Step 1: Add the two write mutations** (inside `createTRPCRouter({ … })`, add imports `agentDrafts`, `agentSuggestions` to the schema import):

```ts
  /** File an introduction suggestion for the organizer to review. */
  suggestIntroduction: agentProcedure
    .input(z.object({
      slug: z.string(),
      userIdA: z.string(),
      userIdB: z.string(),
      reason: z.string().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);
      if (input.userIdA === input.userIdB) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot introduce a member to themselves" });
      }
      // both must be active members
      const members = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.status, "active"),
          inArray(communityMemberships.userId, [input.userIdA, input.userIdB]),
        ));
      if (members.length !== 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Both users must be active members" });
      }
      const key = pairKey(input.userIdA, input.userIdB);
      // dedupe: no open/connected intro for this pair
      const open = await ctx.db
        .select({ id: introductions.id })
        .from(introductions)
        .where(and(eq(introductions.communityId, community.id), eq(introductions.pairKey, key), ne(introductions.status, "declined")))
        .limit(1);
      if (open.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "An introduction for this pair already exists" });
      }
      const [s] = await ctx.db.insert(agentSuggestions).values({
        agentId: ctx.agent.agentId,
        ownerId,
        type: "introduction",
        title: "Introduce two members",
        content: input.reason,
        metadata: { communityId: community.id, communitySlug: input.slug, userIdA: input.userIdA, userIdB: input.userIdB, pairKey: key },
      }).returning({ id: agentSuggestions.id });
      return { suggestionId: s!.id };
    }),

  /** File a revival-nudge draft for an at-risk member, for the organizer to review/send. */
  suggestRevival: agentProcedure
    .input(z.object({
      slug: z.string(),
      memberUserId: z.string(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);
      const member = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.memberUserId),
          eq(communityMemberships.status, "active"),
        ))
        .limit(1);
      if (member.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Target is not an active member" });
      }
      const [d] = await ctx.db.insert(agentDrafts).values({
        agentId: ctx.agent.agentId,
        ownerId,
        type: "revival_nudge",
        targetType: "user",
        targetId: input.memberUserId,
        content: input.message,
        metadata: { communityId: community.id, communitySlug: input.slug },
      }).returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/advisory.ts
git commit -m "feat(advisory): agent suggestIntroduction + suggestRevival (gated) (T7 / #56)"
```

---

## Task 8: Gate existing moderation suggestions on `canAdvise`

**Files:** Modify `src/server/api/routers/agent-communities.ts`

The four `suggest*` moderation procedures (suggestBanMember, suggestRemoveMember, suggestTransferOwnership, suggestSetMemberRole) call `requireAdmin(...)` then insert an `agentSuggestions` row. Add an autonomy gate.

- [ ] **Step 1: Extend the `requireAdmin` helper (or add a sibling) to also enforce autonomy.** In `agent-communities.ts`, add after the existing `requireAdmin` (and import `canAdvise` from `@/server/agents/advisory`):

```ts
import { canAdvise } from "@/server/agents/advisory";

/** Like requireAdmin, but also blocks when the community's autonomy is "off". */
async function requireAdvisoryAdmin(
  db: Parameters<typeof logActivity>[0],
  community: { id: string; autonomyLevel: string },
  ownerId: string,
) {
  const membership = await requireAdmin(db, community.id, ownerId);
  if (!canAdvise(community.autonomyLevel)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agent advisory is off for this community" });
  }
  return membership;
}
```

- [ ] **Step 2: In each of the four moderation `suggest*` procedures, after `resolveCommunity`, swap the `requireAdmin(ctx.db, community.id, ownerId)` call for `requireAdvisoryAdmin(ctx.db, community, ownerId)`** (passing the resolved `community`, which carries `autonomyLevel` from the select). The resolved `community` already includes `autonomyLevel` (it's `select *`/`findFirst`). No other logic changes.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/agent-communities.ts
git commit -m "feat(advisory): gate moderation suggestions on community autonomy (T8 / #56)"
```

---

## Task 9: `approveIntroduction` — create the introduction + notify members

**Files:** Modify `src/server/api/routers/agent-management.ts`

- [ ] **Step 1: Add the mutation** (after `dismissSuggestion`; add imports `introductions`, `notifications`, `pairKey` from matching):

```ts
  /** Approve an introduction suggestion → create the introduction row (pending
   *  consent) and notify both members to consent. */
  approveIntroduction: protectedProcedure
    .input(z.object({ suggestionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [sug] = await ctx.db
        .select()
        .from(agentSuggestions)
        .where(and(eq(agentSuggestions.id, input.suggestionId), eq(agentSuggestions.ownerId, userId)))
        .limit(1);
      if (!sug || sug.type !== "introduction") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Introduction suggestion not found" });
      }
      const meta = (sug.metadata ?? {}) as { communityId?: string; userIdA?: string; userIdB?: string; pairKey?: string };
      if (!meta.communityId || !meta.userIdA || !meta.userIdB) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed suggestion metadata" });
      }
      const key = meta.pairKey ?? pairKey(meta.userIdA, meta.userIdB);

      const [intro] = await ctx.db.insert(introductions).values({
        communityId: meta.communityId,
        suggestedByAgentId: sug.agentId,
        organizerId: userId,
        userIdA: meta.userIdA,
        userIdB: meta.userIdB,
        pairKey: key,
        sharedInterests: (sug.metadata as { sharedInterests?: string[] })?.sharedInterests ?? [],
      }).returning({ id: introductions.id });

      await ctx.db.insert(notifications).values([
        { userId: meta.userIdA, type: "introduction_request", title: "Someone would like to connect", content: "A community organizer thinks you'd hit it off with another member. Want to connect?", communityId: meta.communityId, metadata: { introId: intro!.id } },
        { userId: meta.userIdB, type: "introduction_request", title: "Someone would like to connect", content: "A community organizer thinks you'd hit it off with another member. Want to connect?", communityId: meta.communityId, metadata: { introId: intro!.id } },
      ]);

      await ctx.db.update(agentSuggestions).set({ status: "approved" }).where(eq(agentSuggestions.id, sug.id));
      return { introId: intro!.id };
    }),
```

> If the open-pair unique index throws (a race), surface it as a CONFLICT — wrap the intro insert in try/catch and rethrow `new TRPCError({ code: "CONFLICT", … })` on a unique-violation. Confirm `notifications`/`introductions` imports.

- [ ] **Step 2: Typecheck** → `pnpm typecheck` clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(advisory): approveIntroduction creates intro + consent prompts (T9 / #56)"
```

---

## Task 10: `respondToIntroduction` — consent + connection

**Files:** Modify `src/server/api/routers/advisory.ts`

- [ ] **Step 1: Add the member-facing consent mutation** (protectedProcedure — the member, not the agent; add imports `protectedProcedure`, `nextIntroStatus`, `conversations`, `conversationParticipants`, `messages`):

```ts
  /** A member accepts/declines an introduction. When BOTH accept, a DM opens. */
  respondToIntroduction: protectedProcedure
    .input(z.object({ introId: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [intro] = await ctx.db.select().from(introductions).where(eq(introductions.id, input.introId)).limit(1);
      if (!intro || (intro.userIdA !== userId && intro.userIdB !== userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Introduction not found" });
      }
      if (intro.status !== "pending_consent") {
        return { status: intro.status, conversationId: intro.conversationId };
      }
      const isA = intro.userIdA === userId;
      const myResponse = input.accept ? "accepted" : "declined";
      const responseA = isA ? myResponse : intro.responseA;
      const responseB = isA ? intro.responseB : myResponse;
      const status = nextIntroStatus(responseA, responseB);

      let conversationId = intro.conversationId;
      if (status === "connected") {
        const [conv] = await ctx.db.insert(conversations).values({ type: "dm" }).returning();
        await ctx.db.insert(conversationParticipants).values([
          { conversationId: conv!.id, userId: intro.userIdA },
          { conversationId: conv!.id, userId: intro.userIdB },
        ]);
        await ctx.db.insert(messages).values({
          conversationId: conv!.id,
          senderId: intro.organizerId,
          senderType: "human",
          content: "You both opted in to connect — say hi! 👋",
        });
        conversationId = conv!.id;
      }
      await ctx.db.update(introductions).set({ responseA, responseB, status, conversationId }).where(eq(introductions.id, intro.id));
      return { status, conversationId };
    }),
```

> The opener message is sent as `senderType:"human"` from the organizer (ADR-0015: a human is on the record). Confirm `conversations`/`conversationParticipants`/`messages` exports.

- [ ] **Step 2: Typecheck** → clean.

- [ ] **Step 3: Verify** (manual): file a suggestion → approve (T9) → as member A accept, member B accept → an `introduction` row reaches `connected` and a `dm` conversation + opener message exist; if B declines, status `declined` and no conversation.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/advisory.ts
git commit -m "feat(advisory): member consent + double-opt-in connection (T10 / #56)"
```

---

## Task 11: `reviewDraft` revival extension — organizer DM

**Files:** Modify `src/server/api/routers/agent-management.ts`

- [ ] **Step 1: Extend `reviewDraft`** (the block after the `thread_reply` branch, before `return draft`). Add the imports `conversations`, `conversationParticipants`, `messages`, `eq`, `and`, `sql` as needed:

```ts
      // Revival nudge: approving opens/sends a DM from the organizer to the member.
      if (input.action === "approved" && draft.type === "revival_nudge" && draft.targetId) {
        const memberId = draft.targetId;
        // find an existing DM between organizer (userId) and member, else create
        const [existing] = await ctx.db
          .select({ conversationId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
          .where(and(
            eq(conversations.type, "dm"),
            eq(conversationParticipants.userId, memberId),
            sql`${conversationParticipants.conversationId} IN (
              SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${userId}
            )`,
          ))
          .limit(1);
        let conversationId = existing?.conversationId;
        if (!conversationId) {
          const [conv] = await ctx.db.insert(conversations).values({ type: "dm" }).returning();
          await ctx.db.insert(conversationParticipants).values([
            { conversationId: conv!.id, userId },
            { conversationId: conv!.id, userId: memberId },
          ]);
          conversationId = conv!.id;
        }
        await ctx.db.insert(messages).values({
          conversationId,
          senderId: userId,
          senderType: "human",
          content: draft.content ?? "",
        });
      }
```

> This mirrors `inbox.startConversation`'s dedupe + the DM creation pattern. The message is sent by the organizer (`senderId: userId`, `senderType: "human"`) — agent drafted, human sends, ADR-0015. The draft `content` may have been edited client-side before approval (T13 passes the edited content; if the UI only flips status, the stored draft content is used).

- [ ] **Step 2: Typecheck** → clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(advisory): approve revival draft sends organizer DM (T11 / #56)"
```

---

## Task 12: Autonomy toggle UI (community settings)

**Files:** Create `src/components/communities/settings/autonomy-settings.tsx`; Create `src/app/[locale]/communities/[slug]/settings/autonomy/page.tsx`; Modify `src/components/communities/settings/settings-sidebar.tsx`; Modify `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: i18n** — add an `autonomy` block to both locales:

```json
"autonomy": {
  "title": "Agent advisory",
  "description": "When on, a community organizer's agent can suggest introductions between members and draft revival nudges for you to review and send. Agents never post as themselves — you always publish in your own name.",
  "enabled": "Agent advisory (Suggest)",
  "enabledHint": "Off disables all agent suggestions for this community."
}
```
Add a sidebar label `communities.settings.sidebar.autonomy` = "Agent advisory" / Dutch "Agent-advies".

- [ ] **Step 2: Component** (mirror the existing settings toggles; verify `api.communities.getMyCommunities` returns `autonomyLevel` — if not, add it to that query's select, OR add a dedicated `communities.getAutonomyLevel` query):

```tsx
// src/components/communities/settings/autonomy-settings.tsx
"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";

export function AutonomySettings({ slug }: { slug: string }) {
  const t = useTranslations("autonomy");
  const utils = api.useUtils();
  const communities = api.communities.getMyCommunities.useQuery();
  const setLevel = api.communities.setAutonomyLevel.useMutation({
    onSuccess: () => utils.communities.getMyCommunities.invalidate(),
  });
  const community = communities.data?.find((c) => c.slug === slug);
  if (communities.isLoading || !community) {
    return <div className="h-24 animate-pulse rounded-lg border" />;
  }
  const on = community.autonomyLevel === "suggest";
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{t("enabled")}</p>
          <p className="text-muted-foreground text-xs">{t("enabledHint")}</p>
        </div>
        <Switch
          aria-label={t("enabled")}
          checked={on}
          disabled={setLevel.isPending}
          onCheckedChange={(checked) => setLevel.mutate({ slug, level: checked ? "suggest" : "off" })}
        />
      </div>
    </div>
  );
}
```

> If `getMyCommunities` doesn't return `autonomyLevel`, add `autonomyLevel: communities.autonomyLevel` to its select (in `communities.ts`) as part of this task.

- [ ] **Step 3: Page** (mirror the `settings/broadcast/page.tsx` shape from Slice B):

```tsx
// src/app/[locale]/communities/[slug]/settings/autonomy/page.tsx
"use client";
import { use } from "react";
import { AutonomySettings } from "@/components/communities/settings/autonomy-settings";
export default function AutonomySettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <AutonomySettings slug={slug} />;
}
```

- [ ] **Step 4: Sidebar link** — add `{ key: "autonomy", href: \`${basePath}/autonomy\` }` to `settings-sidebar.tsx` (copy the `broadcast` entry shape from Slice B; add `"autonomy"` to the nav-key union[s]).

- [ ] **Step 5: Verify** — `pnpm dev`, as admin open `/communities/<slug>/settings/autonomy`, toggle off → DB `community.autonomy_level = 'off'` → an agent advisory call now 403s; toggle on restores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/settings/autonomy" src/components/communities/settings/autonomy-settings.tsx src/components/communities/settings/settings-sidebar.tsx src/server/api/routers/communities.ts messages/
git commit -m "feat(advisory): community autonomy toggle UI (T12 / #56)"
```

---

## Task 13: Review UIs — intro approve, revival approve, member consent

**Files:** Modify `src/components/agent-suggestions.tsx`, `src/components/agent-drafts.tsx`; Create `src/components/notifications/introduction-consent.tsx`; Modify `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: i18n** — add to both locales:

```json
"advisory": {
  "approve": "Approve",
  "dismiss": "Dismiss",
  "approveSend": "Approve & send",
  "introApproved": "Introduction sent — both members will be asked to consent.",
  "revivalSent": "Sent as a DM from you.",
  "connectTitle": "Want to connect?",
  "connectBody": "A community organizer thinks you share interests with another member. Connect?",
  "accept": "Connect",
  "decline": "No thanks",
  "connected": "You're connected — open your messages."
}
```

- [ ] **Step 2: `agent-suggestions.tsx`** — for a suggestion with `type === "introduction"`, render an **Approve** button calling `api.agentManagement.approveIntroduction.useMutation({ suggestionId })` (toast `advisory.introApproved`, invalidate `getSuggestions`) alongside the existing Dismiss. Keep existing behavior for other types.

- [ ] **Step 3: `agent-drafts.tsx`** — for `type === "revival_nudge"`, show the draft content in an editable `Textarea` and an **Approve & send** button calling `api.agentManagement.reviewDraft.useMutation({ draftId, action: "approved" })` (toast `advisory.revivalSent`, invalidate `getDrafts`). (Editing the body before sending: if `reviewDraft` doesn't accept edited content, this task may extend `reviewDraft` input with an optional `content` override applied to the message — keep it optional and backwards-compatible.)

- [ ] **Step 4: Member consent surface** — `introduction-consent.tsx`: a client component that lists the member's pending introductions and Connect/No-thanks buttons calling `api.advisory.respondToIntroduction`. Source the pending intros from a small query — add `advisory.myPendingIntroductions` (protectedProcedure: select introductions where `(userIdA = me OR userIdB = me)` AND `status = 'pending_consent'`, returning `{ introId, communityId, sharedInterests }` — no other-member identity revealed). Surface it on the notifications page (`/dashboard/notifications`) below the prefs panel, or render when an `introduction_request` notification is clicked.

```tsx
// src/components/notifications/introduction-consent.tsx
"use client";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function IntroductionConsent() {
  const t = useTranslations("advisory");
  const utils = api.useUtils();
  const pending = api.advisory.myPendingIntroductions.useQuery();
  const respond = api.advisory.respondToIntroduction.useMutation({
    onSuccess: () => utils.advisory.myPendingIntroductions.invalidate(),
  });
  if (pending.isLoading || !pending.data || pending.data.length === 0) return null;
  return (
    <div className="space-y-3">
      {pending.data.map((p) => (
        <div key={p.introId} className="rounded-lg border p-4">
          <p className="text-sm font-medium">{t("connectTitle")}</p>
          <p className="text-muted-foreground text-xs">{t("connectBody")}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ introId: p.introId, accept: true })}>{t("accept")}</Button>
            <Button size="sm" variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ introId: p.introId, accept: false })}>{t("decline")}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Add `advisory.myPendingIntroductions` to `advisory.ts`:
```ts
  myPendingIntroductions: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await ctx.db
      .select({ introId: introductions.id, communityId: introductions.communityId, sharedInterests: introductions.sharedInterests })
      .from(introductions)
      .where(and(eq(introductions.status, "pending_consent"), or(eq(introductions.userIdA, me), eq(introductions.userIdB, me))));
    return rows;
  }),
```
(import `protectedProcedure`, `or`.)

- [ ] **Step 5: Verify** — `pnpm typecheck` + `pnpm lint` clean. `pnpm dev`: as organizer approve an intro suggestion; as each member see the consent card; both accept → a DM appears in the inbox; revival approve → DM lands.

- [ ] **Step 6: Commit**

```bash
git add src/components/agent-suggestions.tsx src/components/agent-drafts.tsx src/components/notifications/introduction-consent.tsx src/server/api/routers/advisory.ts messages/
git commit -m "feat(advisory): intro/revival review + member consent UI (T13 / #56)"
```

---

## Task 14: Final verification

**Files:** none (verification)

- [ ] **Step 1: Full check** — `pnpm vitest run src/server/agents` (advisory + matching suites pass), then `pnpm check` (lint + typecheck) clean, then `pnpm format:check` clean (run `pnpm format:write` on changed files if needed).

- [ ] **Step 2: End-to-end smoke** — (1) toggle autonomy off → agent advisory endpoints 403; on → they work. (2) Agent `suggestIntroduction` → organizer `approveIntroduction` → both members consent → DM opens; a decline closes it. (3) Agent `suggestRevival` → organizer approves → DM from organizer. (4) A visible-mode agent calling `replyToThread`/`postToFeed` now drafts (no auto-post).

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "chore(advisory): final lint/format/typecheck pass (T14 / #56)" || echo "nothing to commit"
```

---

## Self-review notes

- **Spec coverage:** autonomy setting (T3/T12), `canAdvise` gate (T1, enforced T6/T7/T8), ADR-0015 always-draft (T5), intro matching (T2), intro suggestion→approve→consent→connection (T7/T9/T10/T13), revival draft→approve→DM (T7/T11/T13), introductions schema (T4). Every design flow maps to a task.
- **Type consistency:** `IntroResponse`/`IntroStatus`/`nextIntroStatus` (T1) used by the `introductions` table (T4) and `respondToIntroduction` (T10). `pairKey`/`scoreIntroductions`/`MemberProfile`/`IntroCandidate` (T2) used by `introCandidates` (T6) + `suggestIntroduction` (T7) + the exclude set. `canAdvise` (T1) used in T6/T8. Suggestion `type:"introduction"` + draft `type:"revival_nudge"` consistent across T7/T9/T11/T13.
- **Known limitations (note in epic #56):** revival/welcome/digest/broadcast content drafts beyond the one revival proof are Slice C; self-loop cooldown enforcement is separate; agent-authored message bodies are not localized per-member.
- **Deferred (not this slice):** generic suggestion executor; deprecating `visibilityMode` entirely (T5 only closes the human-surface auto-post hole); an Off-state cron (no platform cron — agent is pull-driven).
```
