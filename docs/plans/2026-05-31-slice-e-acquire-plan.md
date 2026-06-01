# Slice E — Acquire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow each community by converting warm Hub members (liveness-ranked discovery + a digest line), rewarding referrals (credit-on-activation, Hub-global XP), and drawing outsiders in (public-page enrichment + agent intro suggestions) — without minting a second reputation currency (ADR-0012/0018).

**Architecture:** Mirrors Slices A–D: **pure-logic cores** (vitest, injected values, no DB) + **thin tRPC** + **thin cron/MCP** + **reuse existing infra**. Two pure cores (`discovery.ts`, `referral.ts`), two new `app` tables (`community_acquire_config`, `referral_credit`), three routers, one reconcile cron + a digest-line extension, one MCP read tool, and UI on existing surfaces. Referral attribution reuses the existing `community_invite` + `community_membership.invitedBy`; crediting is a self-healing idempotent reconciliation (activation is a *derived* state).

**Tech Stack:** Next.js App Router, tRPC, Drizzle (`drizzle-orm/neon-http` — **NO interactive transactions**), Payload migrations (`pnpm payload migrate`), vitest, NextIntl.

**Design + ADR:** `docs/plans/2026-05-31-slice-e-acquire-design.md`, `docs/adr/0018-referral-attribution-honours-global-xp.md`. Epic **#59**.

**Conventions (don't relearn):**
- CI = `pnpm check` (lint + tsc, exits 0 with two known pre-existing warnings) + Format Check (`pnpm format:check`). ALWAYS `prettier --write` changed files before committing.
- One pre-existing non-blocking test failure on `main`: `src/components/agent-suggestions.test.tsx` (NextIntl context). "No new failures" = that one only.
- App tables in the **`app`** Postgres schema; migrations are Payload migrations (`src/migrations/<key>.ts` + register **last** in `src/migrations/index.ts`); self-contained (`CREATE … IF NOT EXISTS`).
- Run a focused vitest file: `pnpm vitest run <path>`. Run typecheck/lint: `pnpm check`.
- Agent write scope is `"contribute"` (NOT `"write"`).

---

## File structure

**Pure cores (new):**
- `src/server/communities/discovery.ts` (+ `.test.ts`) — `rankCommunitiesForMember`, `livenessScore`, types.
- `src/server/communities/referral.ts` (+ `.test.ts`) — `decideReferralCredit`, types.

**Query helpers (new):**
- `src/server/communities/discovery-queries.ts` — `loadDiscoveryCandidates`, `loadMemberCommunityIds`.
- `src/server/communities/referral-queries.ts` — `loadReferralCandidates`, `loadReferralLeaderboard`.

**Schema / migration:**
- `src/server/db/schema.ts` — add `communityAcquireConfig`, `referralCredits` tables (+ relations).
- `src/migrations/20260531f_acquire.ts` (+ register last in `src/migrations/index.ts`).
- `src/lib/gamification.ts` — add `REFERRAL_ACTIVATED: 50` to `XP_AMOUNTS`.

**Routers (new + register in `src/server/api/root.ts`):**
- `src/server/api/routers/acquireConfig.ts` — `acquireConfigRouter` (get/set).
- `src/server/api/routers/discovery.ts` — `discoveryRouter` (recommendedForMe).
- `src/server/api/routers/referral.ts` — `referralRouter` (myLink, leaderboard).
- `src/server/api/routers/advisory.ts` (modify) — add `newJoinerIntroCandidates`.

**Cron:**
- `src/app/api/cron/referral-reconcile/route.ts` (new) + register in `vercel.json`.
- `src/app/api/cron/hub-digest/route.ts` (modify) + `src/server/notifications/digest.ts` (modify) + `src/server/notifications/render.ts` (modify) — discovery line.

**MCP:**
- `src/app/api/mcp/advisory-tools.ts` (modify) — `new-joiner-intro-candidates` tool.

**Public surface:**
- `src/server/api/routers/communities.ts` (modify `getBySlug`) — public-safe liveness preview.
- `src/app/[locale]/communities/[slug]/page.tsx` (+ components) — liveness preview, join CTA, OG metadata.

**UI:**
- `src/components/communities/discovery/recommended-communities.tsx` + wire into `/communities` directory page.
- `src/components/communities/referral/referral-panel.tsx`, `referral-leaderboard.tsx`.
- `src/components/communities/acquire/acquire-settings.tsx` + settings route.
- `messages/en.json` (+ other locales) — new strings.

---

## Task 1: Discovery pure logic

**Files:**
- Create: `src/server/communities/discovery.ts`
- Test: `src/server/communities/discovery.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/communities/discovery.test.ts
import { describe, it, expect } from "vitest";
import {
  livenessScore,
  rankCommunitiesForMember,
  type CommunityCandidate,
} from "./discovery";

function candidate(
  over: Partial<CommunityCandidate> & { communityId: string },
): CommunityCandidate {
  return {
    communityId: over.communityId,
    slug: over.slug ?? over.communityId,
    name: over.name ?? over.communityId,
    description: over.description ?? null,
    logoUrl: over.logoUrl ?? null,
    memberCount: over.memberCount ?? 0,
    activeNow: over.activeNow ?? 0,
    contributionCount: over.contributionCount ?? 0,
    contributionPrev: over.contributionPrev ?? 0,
    newJoins: over.newJoins ?? 0,
  };
}

describe("livenessScore", () => {
  it("weights active contributors, positive momentum, and new joins", () => {
    // activeNow*3 + (contributionCount - contributionPrev) + newJoins
    expect(
      livenessScore(
        candidate({
          communityId: "a",
          activeNow: 5,
          contributionCount: 20,
          contributionPrev: 8,
          newJoins: 2,
        }),
      ),
    ).toBe(5 * 3 + (20 - 8) + 2); // 29
  });

  it("lets declining momentum lower the score (negative delta counts)", () => {
    expect(
      livenessScore(
        candidate({
          communityId: "b",
          activeNow: 2,
          contributionCount: 3,
          contributionPrev: 10,
          newJoins: 0,
        }),
      ),
    ).toBe(2 * 3 + (3 - 10)); // -1
  });
});

describe("rankCommunitiesForMember", () => {
  it("excludes communities the member already belongs to", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "a", activeNow: 10 }),
        candidate({ communityId: "b", activeNow: 1 }),
      ],
      memberCommunityIds: new Set(["a"]),
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["b"]);
  });

  it("sorts by score descending", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "low", activeNow: 1 }),
        candidate({ communityId: "high", activeNow: 10 }),
        candidate({ communityId: "mid", activeNow: 5 }),
      ],
      memberCommunityIds: new Set(),
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["high", "mid", "low"]);
  });

  it("breaks ties by activeNow, then memberCount, then communityId", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "z", activeNow: 0, memberCount: 0 }),
        candidate({ communityId: "a", activeNow: 0, memberCount: 0 }),
        candidate({ communityId: "m", activeNow: 0, memberCount: 50 }),
      ],
      memberCommunityIds: new Set(),
    });
    // all score 0 → memberCount desc puts "m" first, then communityId asc a<z
    expect(ranked.map((r) => r.communityId)).toEqual(["m", "a", "z"]);
  });

  it("applies the limit", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "a", activeNow: 3 }),
        candidate({ communityId: "b", activeNow: 2 }),
        candidate({ communityId: "c", activeNow: 1 }),
      ],
      memberCommunityIds: new Set(),
      limit: 2,
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["a", "b"]);
  });

  it("returns [] for empty candidates", () => {
    expect(
      rankCommunitiesForMember({ candidates: [], memberCommunityIds: new Set() }),
    ).toEqual([]);
  });

  it("attaches the computed score", () => {
    const [r] = rankCommunitiesForMember({
      candidates: [candidate({ communityId: "a", activeNow: 4 })],
      memberCommunityIds: new Set(),
    });
    expect(r.score).toBe(12);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run src/server/communities/discovery.test.ts`
Expected: FAIL — `Cannot find module './discovery'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/communities/discovery.ts
/** Pure community-discovery ranking. No DB. Signals are pre-windowed by the caller. */

export type CommunityCandidate = {
  communityId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  /** Distinct contributors in the current window. */
  activeNow: number;
  /** Contribution-action count in the current window. */
  contributionCount: number;
  /** Contribution-action count in the prior window (for momentum). */
  contributionPrev: number;
  /** community.joined count in the current window. */
  newJoins: number;
};

export type RankedCommunity = CommunityCandidate & { score: number };

/** Liveness score: active contributors dominate, momentum and fresh joins adjust. */
export function livenessScore(c: CommunityCandidate): number {
  return c.activeNow * 3 + (c.contributionCount - c.contributionPrev) + c.newJoins;
}

/** Rank discovery candidates for one member, excluding their current communities. */
export function rankCommunitiesForMember(opts: {
  candidates: CommunityCandidate[];
  memberCommunityIds: Set<string>;
  limit?: number;
}): RankedCommunity[] {
  const limit = opts.limit ?? 10;
  const ranked = opts.candidates
    .filter((c) => !opts.memberCommunityIds.has(c.communityId))
    .map((c) => ({ ...c, score: livenessScore(c) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.activeNow - a.activeNow ||
        b.memberCount - a.memberCount ||
        (a.communityId < b.communityId ? -1 : a.communityId > b.communityId ? 1 : 0),
    );
  return ranked.slice(0, limit);
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm vitest run src/server/communities/discovery.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Format + commit**

```bash
pnpm prettier --write src/server/communities/discovery.ts src/server/communities/discovery.test.ts
git add src/server/communities/discovery.ts src/server/communities/discovery.test.ts
git commit -m "feat(acquire): discovery ranking pure logic (#59)"
```

---

## Task 2: Discovery queries + tRPC

**Files:**
- Create: `src/server/communities/discovery-queries.ts`
- Create: `src/server/api/routers/discovery.ts`
- Modify: `src/server/api/root.ts` (register `discovery`)

This task has no pure-logic test of its own (it is thin glue over the Task 1 core + Drizzle). Verify with `pnpm check`.

- [ ] **Step 1: Write the query helper**

Note: `summarizeHealth`, `CONTRIBUTION_ACTIONS`, `windowStart` are exported from `@/server/communities/insights`. `communityAcquireConfig` lands in Task 4 — but to avoid a task-ordering dependency, this helper reads acquire config defensively (LEFT JOIN; treats a missing row as `crossPromote = true`). Because the table doesn't exist until Task 4's migration runs, **Task 2 and Task 4 both land before this query is exercised at runtime**; the code compiles against the schema symbol added in Task 4. If implementing strictly in order, do Task 4's schema edit (Step 1 only) before Task 2 compiles. See Task 4.

```typescript
// src/server/communities/discovery-queries.ts
/** Loads discovery candidates with windowed liveness signals. Thin DB glue. */

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  communities,
  communityMemberships,
  activityEvents,
  communityAcquireConfig,
} from "@/server/db/schema";
import {
  CONTRIBUTION_ACTIONS,
  summarizeHealth,
  windowStart,
  type ActivityRow,
} from "@/server/communities/insights";
import type { CommunityCandidate } from "@/server/communities/discovery";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

export const DISCOVERY_WINDOW_DAYS = 14;
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

/** Listed communities (optionally only those opted into cross-promotion) with
 *  liveness signals computed over the standard window. */
export async function loadDiscoveryCandidates(
  db: DB,
  now: Date,
  opts: { crossPromoteOnly?: boolean } = {},
): Promise<CommunityCandidate[]> {
  // Listed, non-deleted communities + their acquire config (default crossPromote=true).
  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      logoUrl: communities.logoUrl,
      crossPromote: communityAcquireConfig.crossPromote,
    })
    .from(communities)
    .leftJoin(
      communityAcquireConfig,
      eq(communityAcquireConfig.communityId, communities.id),
    )
    .where(
      and(
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
      ),
    );

  const eligible = rows.filter((r) =>
    opts.crossPromoteOnly ? (r.crossPromote ?? true) : true,
  );
  if (eligible.length === 0) return [];
  const ids = eligible.map((r) => r.id);

  const since = windowStart(now, DISCOVERY_WINDOW_DAYS * 2);

  // Member counts (active) per community.
  const memberCounts = await db
    .select({
      communityId: communityMemberships.communityId,
      n: sql<number>`count(*)::int`,
    })
    .from(communityMemberships)
    .where(
      and(
        inArray(communityMemberships.communityId, ids),
        eq(communityMemberships.status, "active"),
      ),
    )
    .groupBy(communityMemberships.communityId);
  const memberCountMap = new Map(memberCounts.map((m) => [m.communityId, m.n]));

  // Contribution + join events across both windows (raw rows → summarizeHealth).
  const events = await db
    .select({
      communityId: activityEvents.communityId,
      actorId: activityEvents.actorId,
      action: activityEvents.action,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.communityId, ids),
        gte(activityEvents.createdAt, since),
        inArray(activityEvents.action, [...CONTRIBUTION_LIST, "community.joined"]),
      ),
    );

  const contribByCommunity = new Map<string, ActivityRow[]>();
  const joinByCommunity = new Map<string, ActivityRow[]>();
  for (const e of events) {
    if (!e.communityId) continue;
    const row: ActivityRow = {
      actorId: e.actorId,
      action: e.action,
      createdAt: e.createdAt,
    };
    if (e.action === "community.joined") {
      const list = joinByCommunity.get(e.communityId) ?? [];
      list.push(row);
      joinByCommunity.set(e.communityId, list);
    } else {
      const list = contribByCommunity.get(e.communityId) ?? [];
      list.push(row);
      contribByCommunity.set(e.communityId, list);
    }
  }

  return eligible.map((r) => {
    const health = summarizeHealth({
      contributions: contribByCommunity.get(r.id) ?? [],
      joins: joinByCommunity.get(r.id) ?? [],
      departures: [],
      now,
      windowDays: DISCOVERY_WINDOW_DAYS,
    });
    return {
      communityId: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      logoUrl: r.logoUrl,
      memberCount: memberCountMap.get(r.id) ?? 0,
      activeNow: health.activeNow,
      contributionCount: health.contributionCount,
      contributionPrev: health.contributionPrev,
      newJoins: health.newJoins,
    };
  });
}

/** The set of community ids the user is an active member of. */
export async function loadMemberCommunityIds(
  db: DB,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ communityId: communityMemberships.communityId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
    );
  return new Set(rows.map((r) => r.communityId));
}
```

- [ ] **Step 2: Write the router**

```typescript
// src/server/api/routers/discovery.ts
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { rankCommunitiesForMember } from "@/server/communities/discovery";
import {
  loadDiscoveryCandidates,
  loadMemberCommunityIds,
} from "@/server/communities/discovery-queries";

export const discoveryRouter = createTRPCRouter({
  /** Liveness-ranked communities the caller is not yet in. */
  recommendedForMe: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(6) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const [candidates, memberCommunityIds] = await Promise.all([
        loadDiscoveryCandidates(ctx.db, now),
        loadMemberCommunityIds(ctx.db, ctx.session.user.id),
      ]);
      return rankCommunitiesForMember({
        candidates,
        memberCommunityIds,
        limit: input.limit,
      });
    }),
});
```

- [ ] **Step 3: Register the router**

In `src/server/api/root.ts`, add the import alongside the others and add `discovery: discoveryRouter,` to the `createTRPCRouter({ ... })` map (place it after `insights:`):

```typescript
import { discoveryRouter } from "@/server/api/routers/discovery";
// ...
  insights: insightsRouter,
  discovery: discoveryRouter,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: passes (only the two known pre-existing warnings). If `communityAcquireConfig` is unresolved, apply Task 4 Step 1 (the schema table) first — see the note in Step 1.

- [ ] **Step 5: Format + commit**

```bash
pnpm prettier --write src/server/communities/discovery-queries.ts src/server/api/routers/discovery.ts src/server/api/root.ts
git add src/server/communities/discovery-queries.ts src/server/api/routers/discovery.ts src/server/api/root.ts
git commit -m "feat(acquire): discovery queries + recommendedForMe tRPC (#59)"
```

---

## Task 3: "Recommended for you" UI + digest discovery line

**Files:**
- Create: `src/components/communities/discovery/recommended-communities.tsx`
- Modify: the `/communities` directory page (`src/app/[locale]/communities/page.tsx`) to render it
- Modify: `src/server/notifications/digest.ts` (discovery field), `src/server/notifications/render.ts` (render line), `src/app/api/cron/hub-digest/route.ts` (compute per-recipient pick)
- Modify: `messages/en.json` (strings)

- [ ] **Step 1: Add the discovery field to the digest core (test-first)**

Add to `src/server/notifications/digest.ts` — extend `HubDigest` + `buildHubDigest`:

In `digest.ts`, change the `HubDigest` type and `buildHubDigest` to carry an optional discovery pick:

```typescript
export type DiscoveryPick = { name: string; slug: string } | null;

export type HubDigest = {
  userId: string;
  sections: CommunitySection[];
  discovery: DiscoveryPick;
};

export function buildHubDigest(opts: {
  userId: string;
  sections: CommunitySection[];
  optedOutCommunityIds: Set<string>;
  discovery?: DiscoveryPick;
}): HubDigest | null {
  const visible = opts.sections.filter(
    (s) => !s.isEmpty && !opts.optedOutCommunityIds.has(s.communityId),
  );
  const discovery = opts.discovery ?? null;
  if (visible.length === 0 && !discovery) return null;
  return { userId: opts.userId, sections: visible, discovery };
}
```

Add a test in `src/server/notifications/digest.test.ts` (append to the existing describe, or create the file if absent):

```typescript
import { describe, it, expect } from "vitest";
import { buildHubDigest, summarizeCommunitySection } from "./digest";

describe("buildHubDigest discovery", () => {
  it("returns a digest with only a discovery pick when all sections are empty", () => {
    const d = buildHubDigest({
      userId: "u1",
      sections: [
        summarizeCommunitySection({
          communityId: "c1",
          communityName: "C1",
          newThreads: 0,
          newEvents: 0,
          newMembers: 0,
          ritualItems: [],
        }),
      ],
      optedOutCommunityIds: new Set(),
      discovery: { name: "Robotics", slug: "robotics" },
    });
    expect(d).not.toBeNull();
    expect(d!.sections).toHaveLength(0);
    expect(d!.discovery).toEqual({ name: "Robotics", slug: "robotics" });
  });

  it("returns null when sections empty and no discovery", () => {
    expect(
      buildHubDigest({
        userId: "u1",
        sections: [],
        optedOutCommunityIds: new Set(),
      }),
    ).toBeNull();
  });
});
```

Run: `pnpm vitest run src/server/notifications/digest.test.ts`
Expected: PASS. (Adjust any existing call sites/tests that destructure `HubDigest` to include `discovery` — `pnpm check` will flag them.)

- [ ] **Step 2: Render the discovery line**

In `src/server/notifications/render.ts` (`renderHubDigestHtml`), after the sections are rendered and before the closing markup, add (only when present):

```typescript
// inside renderHubDigestHtml(digest: HubDigest)
const discoveryHtml = digest.discovery
  ? `<p style="margin-top:16px;font-size:14px;color:#555;">Discover another community you might like: <a href="${baseUrl}/communities/${digest.discovery.slug}">${escapeHtml(digest.discovery.name)}</a></p>`
  : "";
```

Append `discoveryHtml` into the returned HTML body. Reuse the file's existing `baseUrl`/`escapeHtml` helpers; if `escapeHtml` doesn't exist, use the existing escaping approach already in the file (match the pattern used for community names).

- [ ] **Step 3: Compute the per-recipient discovery pick in the cron**

In `src/app/api/cron/hub-digest/route.ts`:

Add imports:
```typescript
import { rankCommunitiesForMember } from "@/server/communities/discovery";
import { loadDiscoveryCandidates } from "@/server/communities/discovery-queries";
```

After the existing per-community engage data is loaded (once, before the user loop), load candidates once:
```typescript
// Discovery candidates (cross-promote opt-in only), computed once.
const discoveryCandidates = await loadDiscoveryCandidates(db, now, {
  crossPromoteOnly: true,
});
```

Inside the `for (const [userId, { email, name, rows }] of byUser)` loop, after `const prefs = resolvePrefs(...)` and the `globalDigestOptOut` continue, compute the pick from the user's own membership rows:
```typescript
const memberIds = new Set(rows.map((r) => r.communityId));
const topPick = rankCommunitiesForMember({
  candidates: discoveryCandidates,
  memberCommunityIds: memberIds,
  limit: 1,
})[0];
const discovery = topPick ? { name: topPick.name, slug: topPick.slug } : null;
```

Pass it into `buildHubDigest`:
```typescript
const digest = buildHubDigest({
  userId,
  sections,
  optedOutCommunityIds: prefs.digestOptOutCommunityIds,
  discovery,
});
```

(The discovery line rides the existing `digest` opt-out: `globalDigestOptOut` already `continue`s above, so opted-out users never reach this code.)

- [ ] **Step 4: Build the recommended-communities component**

```tsx
// src/components/communities/discovery/recommended-communities.tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { api } from "@/trpc/react";

export function RecommendedCommunities() {
  const t = useTranslations("discovery");
  const { data } = api.discovery.recommendedForMe.useQuery({ limit: 6 });
  if (!data || data.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{t("recommendedTitle")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((c) => (
          <Link
            key={c.communityId}
            href={`/communities/${c.slug}`}
            className="rounded-lg border p-4 transition hover:border-foreground/30"
          >
            <div className="font-medium">{c.name}</div>
            {c.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {c.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("memberCount", { count: c.memberCount })}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

Render `<RecommendedCommunities />` near the top of the `/communities` directory page (above the full directory list). Match the page's existing server/client boundary — if the page is a server component, the `"use client"` child is fine to drop in directly.

- [ ] **Step 5: Add i18n strings**

In `messages/en.json`, add a `discovery` namespace:
```json
"discovery": {
  "recommendedTitle": "Recommended for you",
  "memberCount": "{count, plural, one {# member} other {# members}}"
}
```
Mirror minimally in the other `messages/*.json` files (English copy is acceptable as a placeholder — i18n completeness is tracked separately).

- [ ] **Step 6: Verify + format + commit**

```bash
pnpm vitest run src/server/notifications/digest.test.ts
pnpm check
pnpm prettier --write src/server/notifications/digest.ts src/server/notifications/render.ts src/app/api/cron/hub-digest/route.ts src/components/communities/discovery/recommended-communities.tsx messages/en.json
git add -A
git commit -m "feat(acquire): recommended-for-you UI + digest discovery line (#59)"
```

---

## Task 4: Acquire config (table + migration + router + settings UI)

**Files:**
- Modify: `src/server/db/schema.ts` (add `communityAcquireConfig`)
- Create: `src/migrations/20260531f_acquire.ts` (config table; the `referral_credit` table is added in the same migration in Task 5 — see note)
- Modify: `src/migrations/index.ts` (register last)
- Create: `src/server/api/routers/acquireConfig.ts` + register in `root.ts`
- Create: `src/components/communities/acquire/acquire-settings.tsx` + a settings route

> **Migration note:** To keep a single self-contained Acquire migration, create `20260531f_acquire.ts` here with the `community_acquire_config` table, and **extend the same file** in Task 5 to add `referral_credit`. Register it once (in this task). If Task 5 runs before this lands, fold both `CREATE TABLE`s in whichever task runs first.

- [ ] **Step 1: Add the schema table**

In `src/server/db/schema.ts`, after `communityActivationConfig` (around line 845), add:

```typescript
export const communityAcquireConfig = appSchema.table(
  "community_acquire_config",
  (d) => ({
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => communities.id),
    crossPromote: d.boolean().notNull().default(true),
    referralsEnabled: d.boolean().notNull().default(true),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);
```

- [ ] **Step 2: Write the migration**

```typescript
// src/migrations/20260531f_acquire.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."community_acquire_config" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."community"("id"),
      "cross_promote" boolean DEFAULT true NOT NULL,
      "referrals_enabled" boolean DEFAULT true NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "app"."referral_credit" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "referrer_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "referred_user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "xp_awarded" integer NOT NULL,
      "credited_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "referral_credit_referred_uidx" ON "app"."referral_credit" ("referred_user_id");
    CREATE INDEX IF NOT EXISTS "referral_credit_referrer_idx" ON "app"."referral_credit" USING btree ("referrer_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."referral_credit";
    DROP TABLE IF EXISTS "app"."community_acquire_config";
  `);
}
```

(The `referral_credit` schema symbol is added in Task 5 Step 1; including its DDL here keeps one migration. Run the migration only after Task 5's schema edit so the code and DB agree — or run `pnpm payload migrate` after both Task 4 and Task 5 schema edits are in.)

- [ ] **Step 3: Register the migration (last)**

In `src/migrations/index.ts`, import the new migration and add it as the **last** entry of the exported array, exactly mirroring how `20260531e_activation` is registered.

- [ ] **Step 4: Write the config router**

```typescript
// src/server/api/routers/acquireConfig.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityAcquireConfig } from "@/server/db/schema";

const DEFAULTS = {
  crossPromote: true,
  referralsEnabled: true,
};

function requireConfigAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const acquireConfigRouter = createTRPCRouter({
  get: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      const [row] = await ctx.db
        .select()
        .from(communityAcquireConfig)
        .where(eq(communityAcquireConfig.communityId, ctx.community.id))
        .limit(1);
      return row
        ? {
            crossPromote: row.crossPromote,
            referralsEnabled: row.referralsEnabled,
          }
        : DEFAULTS;
    }),

  set: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        crossPromote: z.boolean(),
        referralsEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const values = {
        crossPromote: input.crossPromote,
        referralsEnabled: input.referralsEnabled,
        updatedAt: new Date(),
      };
      await ctx.db
        .insert(communityAcquireConfig)
        .values({ communityId: ctx.community.id, ...values })
        .onConflictDoUpdate({
          target: communityAcquireConfig.communityId,
          set: values,
        });
      return { ok: true };
    }),
});
```

Register in `src/server/api/root.ts`: `import { acquireConfigRouter } from "@/server/api/routers/acquireConfig";` and add `acquireConfig: acquireConfigRouter,` to the map.

- [ ] **Step 5: Settings UI**

Create `src/components/communities/acquire/acquire-settings.tsx` mirroring the existing activation/engage settings panels (a `"use client"` form with two toggles bound to `api.acquireConfig.get`/`set`, owner/admin gated by the router). Wire it into the community settings area following the existing settings-route convention (e.g. a new `src/app/[locale]/communities/[slug]/settings/acquire/page.tsx` mirroring `settings/autonomy/page.tsx`). Reuse the existing settings layout + toggle components — do not invent new primitives.

- [ ] **Step 6: Run the migration locally + verify**

```bash
pnpm payload migrate:status   # shows 20260531f_acquire pending
pnpm payload migrate          # applies it
pnpm check
```
Expected: migration applies cleanly; `pnpm check` passes.

- [ ] **Step 7: Format + commit**

```bash
pnpm prettier --write src/server/db/schema.ts src/migrations/20260531f_acquire.ts src/migrations/index.ts src/server/api/routers/acquireConfig.ts src/server/api/root.ts src/components/communities/acquire/acquire-settings.tsx
git add -A
git commit -m "feat(acquire): community_acquire_config + referral_credit tables, acquireConfig router + settings (#59)"
```

---

## Task 5: Referral schema symbol + personal link

**Files:**
- Modify: `src/server/db/schema.ts` (add `referralCredits` table symbol + relations — DDL already in Task 4's migration)
- Create: `src/server/api/routers/referral.ts` (`myLink`) + register in `root.ts`

- [ ] **Step 1: Add the `referralCredits` schema symbol**

In `src/server/db/schema.ts`, after `communityAcquireConfig`, add:

```typescript
export const referralCredits = appSchema.table(
  "referral_credit",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    referrerId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    referredUserId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    xpAwarded: d.integer().notNull(),
    creditedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("referral_credit_referred_uidx").on(t.referredUserId),
    index("referral_credit_referrer_idx").on(t.referrerId),
  ],
);
```

(`uniqueIndex` and `index` are already imported in `schema.ts`.)

- [ ] **Step 2: Write the referral router (`myLink`)**

A member's personal referral link is a `community_invite` row they created. `myLink` is get-or-create, scoped to (community, member). Any active member may call it (gated only by active membership, not admin).

```typescript
// src/server/api/routers/referral.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityInvites } from "@/server/db/schema";

export const referralRouter = createTRPCRouter({
  /** Get-or-create the caller's personal referral invite for this community. */
  myLink: communityProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx }) => {
      if (!ctx.communityRole) {
        // Only active members can refer into a community they belong to.
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = await ctx.db
        .select({ code: communityInvites.code })
        .from(communityInvites)
        .where(
          and(
            eq(communityInvites.communityId, ctx.community.id),
            eq(communityInvites.createdBy, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (existing[0]) return { code: existing[0].code };

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      await ctx.db.insert(communityInvites).values({
        communityId: ctx.community.id,
        code,
        createdBy: ctx.session.user.id,
        maxUses: null,
        expiresAt: null,
      });
      return { code };
    }),
});
```

Register in `src/server/api/root.ts`: `import { referralRouter } from "@/server/api/routers/referral";` and add `referral: referralRouter,`.

- [ ] **Step 3: Typecheck + migrate**

```bash
pnpm check
pnpm payload migrate:status   # 20260531f_acquire should now be applied (from Task 4) — referral_credit exists
```
If the migration was not yet applied (Task 4 ran without `pnpm payload migrate`), run `pnpm payload migrate` now.

- [ ] **Step 4: Format + commit**

```bash
pnpm prettier --write src/server/db/schema.ts src/server/api/routers/referral.ts src/server/api/root.ts
git add src/server/db/schema.ts src/server/api/routers/referral.ts src/server/api/root.ts
git commit -m "feat(acquire): referral_credit schema + personal referral link (#59)"
```

---

## Task 6: Referral credit decision logic

**Files:**
- Create: `src/server/communities/referral.ts`
- Test: `src/server/communities/referral.test.ts`
- Modify: `src/lib/gamification.ts` (`REFERRAL_ACTIVATED` constant)

- [ ] **Step 1: Add the XP constant**

In `src/lib/gamification.ts`, add to the `XP_AMOUNTS` object (after `FEED_RECEIVE_COMMENT: 3,`):
```typescript
  REFERRAL_ACTIVATED: 50,
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/server/communities/referral.test.ts
import { describe, it, expect } from "vitest";
import { decideReferralCredit } from "./referral";
import type { ActivationStage } from "@/server/communities/activation";

const base = {
  referrerId: "ref",
  referredUserId: "newbie",
  activationStage: "activated" as ActivationStage,
  alreadyCredited: false,
};

describe("decideReferralCredit", () => {
  it("credits an activated, uncredited, non-self referral", () => {
    expect(decideReferralCredit(base)).toEqual({ credit: true, reason: "ok" });
  });

  it("does not credit when already credited (short-circuits first)", () => {
    expect(
      decideReferralCredit({ ...base, alreadyCredited: true }),
    ).toEqual({ credit: false, reason: "already_credited" });
  });

  it("does not credit with no referrer", () => {
    expect(
      decideReferralCredit({ ...base, referrerId: null }),
    ).toEqual({ credit: false, reason: "no_referrer" });
  });

  it("blocks self-referral", () => {
    expect(
      decideReferralCredit({ ...base, referrerId: "newbie" }),
    ).toEqual({ credit: false, reason: "self_referral" });
  });

  it("does not credit before activation", () => {
    for (const stage of [
      "unactivated",
      "awaiting_response",
      "awaiting_profile",
      "stalled",
    ] as ActivationStage[]) {
      expect(
        decideReferralCredit({ ...base, activationStage: stage }),
      ).toEqual({ credit: false, reason: "not_activated" });
    }
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `pnpm vitest run src/server/communities/referral.test.ts`
Expected: FAIL — `Cannot find module './referral'`.

- [ ] **Step 4: Write the implementation**

```typescript
// src/server/communities/referral.ts
/** Pure referral-credit decision. No DB. ADR-0018: credit only on activation. */

import type { ActivationStage } from "@/server/communities/activation";

export type ReferralCreditReason =
  | "ok"
  | "already_credited"
  | "no_referrer"
  | "self_referral"
  | "not_activated";

/** Decide whether a referrer earns credit for a referred member. */
export function decideReferralCredit(opts: {
  referrerId: string | null;
  referredUserId: string;
  activationStage: ActivationStage;
  alreadyCredited: boolean;
}): { credit: boolean; reason: ReferralCreditReason } {
  if (opts.alreadyCredited) return { credit: false, reason: "already_credited" };
  if (!opts.referrerId) return { credit: false, reason: "no_referrer" };
  if (opts.referrerId === opts.referredUserId)
    return { credit: false, reason: "self_referral" };
  if (opts.activationStage !== "activated")
    return { credit: false, reason: "not_activated" };
  return { credit: true, reason: "ok" };
}
```

- [ ] **Step 5: Run it and verify it passes**

Run: `pnpm vitest run src/server/communities/referral.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Format + commit**

```bash
pnpm prettier --write src/server/communities/referral.ts src/server/communities/referral.test.ts src/lib/gamification.ts
git add src/server/communities/referral.ts src/server/communities/referral.test.ts src/lib/gamification.ts
git commit -m "feat(acquire): referral credit decision logic + REFERRAL_ACTIVATED (#59)"
```

---

## Task 7: Referral reconcile cron

**Files:**
- Create: `src/server/communities/referral-queries.ts` (`loadReferralCandidates`)
- Create: `src/app/api/cron/referral-reconcile/route.ts`
- Modify: `vercel.json` (register the cron)

The query helper assembles, for every referred-but-uncredited member, the signals `computeActivationStage` needs. It follows the proven raw-fetch + reduce pattern from `activation-queries.ts`. Profile-complete uses the Slice D definition: `onboardingCompleted === true AND interests.length >= 1 AND experienceLevel set`.

- [ ] **Step 1: Write `loadReferralCandidates`**

```typescript
// src/server/communities/referral-queries.ts
/** Assembles activation signals for referred-but-uncredited members so the
 *  reconcile cron can decide referral credit. Raw-fetch + reduce (neon-http). */

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
  communityMemberships,
  communityActivationConfig,
  activityEvents,
  memberProfiles,
  referralCredits,
} from "@/server/db/schema";
import { RESPONSE_ACTIONS } from "@/server/communities/activation";
import type { ActivationConfig } from "@/server/communities/activation";
import { CONTRIBUTION_ACTIONS } from "@/server/communities/insights";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

// RESPONSE_ACTIONS lives in activation.ts; CONTRIBUTION_ACTIONS lives in insights.ts.
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];
const RESPONSE_LIST: string[] = [...RESPONSE_ACTIONS];

export const ACTIVATION_DEFAULTS: ActivationConfig = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};

export type ReferralCandidate = {
  referredUserId: string;
  referrerId: string;
  communityId: string;
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null;
  profileComplete: boolean;
  config: ActivationConfig;
};

export async function loadReferralCandidates(
  db: DB,
): Promise<ReferralCandidate[]> {
  // Referred, active memberships (invitedBy set).
  const memberships = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      invitedBy: communityMemberships.invitedBy,
    })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.status, "active"),
        isNotNull(communityMemberships.invitedBy),
      ),
    );
  if (memberships.length === 0) return [];

  const userIds = [...new Set(memberships.map((m) => m.userId))];
  const communityIds = [...new Set(memberships.map((m) => m.communityId))];

  // Exclude users who already have ANY referral credit (one credit per member, global).
  const credited = await db
    .select({ referredUserId: referralCredits.referredUserId })
    .from(referralCredits)
    .where(inArray(referralCredits.referredUserId, userIds));
  const creditedSet = new Set(credited.map((c) => c.referredUserId));

  const pending = memberships.filter(
    (m) => m.invitedBy !== null && !creditedSet.has(m.userId),
  );
  if (pending.length === 0) return [];

  // First contribution per (community, user).
  const contribRows = await db
    .select({
      communityId: activityEvents.communityId,
      actorId: activityEvents.actorId,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.communityId, communityIds),
        inArray(activityEvents.actorId, userIds),
        inArray(activityEvents.action, CONTRIBUTION_LIST),
      ),
    );
  const firstContribution = new Map<string, Date>();
  for (const r of contribRows) {
    if (!r.communityId) continue;
    const key = `${r.communityId}:${r.actorId}`;
    const cur = firstContribution.get(key);
    if (!cur || r.createdAt < cur) firstContribution.set(key, r.createdAt);
  }

  // First response received per (community, user) — recipientId=user, actor≠user.
  const responseRows = await db
    .select({
      communityId: activityEvents.communityId,
      recipientId: activityEvents.recipientId,
      actorId: activityEvents.actorId,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.communityId, communityIds),
        inArray(activityEvents.recipientId, userIds),
        inArray(activityEvents.action, RESPONSE_LIST),
      ),
    );
  const firstResponse = new Map<string, Date>();
  for (const r of responseRows) {
    if (!r.communityId || !r.recipientId || r.recipientId === r.actorId) continue;
    const key = `${r.communityId}:${r.recipientId}`;
    const cur = firstResponse.get(key);
    if (!cur || r.createdAt < cur) firstResponse.set(key, r.createdAt);
  }

  // Profile-complete flags.
  const profiles = await db
    .select({
      userId: memberProfiles.userId,
      onboardingCompleted: memberProfiles.onboardingCompleted,
      interests: memberProfiles.interests,
      experienceLevel: memberProfiles.experienceLevel,
    })
    .from(memberProfiles)
    .where(inArray(memberProfiles.userId, userIds));
  const profileComplete = new Map<string, boolean>();
  for (const p of profiles) {
    profileComplete.set(
      p.userId,
      p.onboardingCompleted &&
        (p.interests?.length ?? 0) >= 1 &&
        !!p.experienceLevel,
    );
  }

  // Activation config per community.
  const cfgRows = await db
    .select()
    .from(communityActivationConfig)
    .where(inArray(communityActivationConfig.communityId, communityIds));
  const cfgMap = new Map(cfgRows.map((c) => [c.communityId, c]));

  return pending.map((m) => {
    const key = `${m.communityId}:${m.userId}`;
    const cfg = cfgMap.get(m.communityId);
    return {
      referredUserId: m.userId,
      referrerId: m.invitedBy as string,
      communityId: m.communityId,
      firstContributionAt: firstContribution.get(key) ?? null,
      firstResponseReceivedAt: firstResponse.get(key) ?? null,
      profileComplete: profileComplete.get(m.userId) ?? false,
      config: cfg
        ? {
            requireResponse: cfg.requireResponse,
            requireProfileComplete: cfg.requireProfileComplete,
            windowDays: cfg.windowDays,
          }
        : ACTIVATION_DEFAULTS,
    };
  });
}
```

- [ ] **Step 2: Write the cron**

Claim-before-award: insert the ledger row first (`onConflictDoNothing`, unique on `referredUserId`); award XP + notify only if the claim won. Self-healing + idempotent.

```typescript
// src/app/api/cron/referral-reconcile/route.ts
import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { referralCredits, notifications, activityEvents } from "@/server/db/schema";
import { loadReferralCandidates } from "@/server/communities/referral-queries";
import { decideReferralCredit } from "@/server/communities/referral";
import { computeActivationStage } from "@/server/communities/activation";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const candidates = await loadReferralCandidates(db);
  let credited = 0;

  for (const c of candidates) {
    const stage = computeActivationStage({
      firstContributionAt: c.firstContributionAt,
      firstResponseReceivedAt: c.firstResponseReceivedAt,
      profileComplete: c.profileComplete,
      config: c.config,
      now,
    });
    const decision = decideReferralCredit({
      referrerId: c.referrerId,
      referredUserId: c.referredUserId,
      activationStage: stage,
      alreadyCredited: false, // candidates are already pre-filtered to uncredited
    });
    if (!decision.credit) continue;

    // Claim the credit (unique on referred_user_id). Only the winner awards.
    const claimed = await db
      .insert(referralCredits)
      .values({
        referrerId: c.referrerId,
        referredUserId: c.referredUserId,
        communityId: c.communityId,
        xpAwarded: XP_AMOUNTS.REFERRAL_ACTIVATED,
      })
      .onConflictDoNothing({ target: referralCredits.referredUserId })
      .returning({ id: referralCredits.id });
    if (claimed.length === 0) continue; // someone/another community already credited

    await awardXp(db, c.referrerId, XP_AMOUNTS.REFERRAL_ACTIVATED);

    // Audit event — recipientId deliberately NULL (stay off the privacy filter).
    await db.insert(activityEvents).values({
      actorId: c.referredUserId,
      actorType: "system",
      action: "referral.credited",
      targetType: "user",
      targetId: c.referrerId,
      communityId: c.communityId,
      metadata: { xp: XP_AMOUNTS.REFERRAL_ACTIVATED },
    });

    // Notify the referrer.
    await db.insert(notifications).values({
      userId: c.referrerId,
      type: "referral_credited",
      title: "Your referral activated 🎉",
      content: `A member you referred just became active. You earned ${XP_AMOUNTS.REFERRAL_ACTIVATED} XP.`,
      communityId: c.communityId,
      metadata: { referredUserId: c.referredUserId, xp: XP_AMOUNTS.REFERRAL_ACTIVATED },
    });
    credited++;
  }

  return NextResponse.json({ success: true, credited });
}
```

- [ ] **Step 3: Register the cron**

In `vercel.json`, add to the `crons` array (after `activation-newcomer-churn`):
```json
    {
      "path": "/api/cron/referral-reconcile",
      "schedule": "0 4 * * *"
    }
```

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: passes. Manually smoke-test (optional, local): `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/referral-reconcile` → `{"success":true,"credited":N}`; a second call returns `credited:0` (idempotency).

- [ ] **Step 5: Format + commit**

```bash
pnpm prettier --write src/server/communities/referral-queries.ts src/app/api/cron/referral-reconcile/route.ts vercel.json
git add src/server/communities/referral-queries.ts src/app/api/cron/referral-reconcile/route.ts vercel.json
git commit -m "feat(acquire): referral reconcile cron — credit on activation (#59)"
```

---

## Task 8: Referral leaderboard + UI panel

**Files:**
- Modify: `src/server/communities/referral-queries.ts` (`loadReferralLeaderboard`)
- Modify: `src/server/api/routers/referral.ts` (`leaderboard` query)
- Create: `src/components/communities/referral/referral-panel.tsx`, `referral-leaderboard.tsx`

The leaderboard is a **view** over `referral_credit` (ADR-0012/0018 — never a new reputation store).

- [ ] **Step 1: Add the leaderboard query**

Append to `src/server/communities/referral-queries.ts`:

```typescript
import { desc, sql } from "drizzle-orm";
import { user } from "@/server/db/schema";

export type LeaderboardRow = {
  userId: string;
  name: string | null;
  referralCount: number;
};

/** Hub-global referral counts (a view over the credit ledger). */
export async function loadReferralLeaderboard(
  db: DB,
  limit: number,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: referralCredits.referrerId,
      name: user.name,
      referralCount: sql<number>`count(*)::int`,
    })
    .from(referralCredits)
    .innerJoin(user, eq(user.id, referralCredits.referrerId))
    .groupBy(referralCredits.referrerId, user.name)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows;
}
```

(Add `desc`, `sql` to the existing drizzle import; add `user` to the schema import. `eq` is already imported.)

- [ ] **Step 2: Add the router procedure**

In `src/server/api/routers/referral.ts`, add to the router (and import `protectedProcedure`, `loadReferralLeaderboard`):

```typescript
  leaderboard: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return loadReferralLeaderboard(ctx.db, input.limit);
    }),
```

- [ ] **Step 3: Build the UI**

- `referral-panel.tsx` (`"use client"`): a "Refer a friend" panel that calls `api.referral.myLink.useMutation()` on mount/click to get the member's code, then shows the shareable URL `${origin}/join?code=${code}` with a copy button. Render it on the community page or member dashboard following the existing card/button components.
- `referral-leaderboard.tsx` (`"use client"`): calls `api.referral.leaderboard.useQuery({ limit: 20 })` and renders a ranked list (name + referralCount). Label it clearly as a recognition view (not XP).

Add i18n strings under a `referral` namespace in `messages/en.json` (`title`, `shareCta`, `copied`, `leaderboardTitle`, `referralCount`).

- [ ] **Step 4: Verify + format + commit**

```bash
pnpm check
pnpm prettier --write src/server/communities/referral-queries.ts src/server/api/routers/referral.ts src/components/communities/referral/referral-panel.tsx src/components/communities/referral/referral-leaderboard.tsx messages/en.json
git add -A
git commit -m "feat(acquire): referral leaderboard view + share/leaderboard UI (#59)"
```

---

## Task 9: Public-page enrichment (liveness preview + OG metadata + join CTA)

**Files:**
- Modify: `src/server/communities/discovery-queries.ts` (`loadPublicLiveness`)
- Modify: `src/server/api/routers/communities.ts` (`getBySlug` returns liveness)
- Modify: `src/app/[locale]/communities/[slug]/page.tsx` (render preview + CTA + `generateMetadata`)

Public-safe **only**: active-contributor count + recent public-thread count over the window. Never at-risk/insight data.

- [ ] **Step 1: Add the public liveness query**

Append to `src/server/communities/discovery-queries.ts`:

```typescript
export type PublicLiveness = {
  activeContributors: number;
  recentThreads: number;
};

/** Public-safe liveness for a single community: distinct contributors + new
 *  threads over the discovery window. No private/insight data. */
export async function loadPublicLiveness(
  db: DB,
  communityId: string,
  now: Date,
): Promise<PublicLiveness> {
  const since = windowStart(now, DISCOVERY_WINDOW_DAYS);
  const rows = await db
    .select({
      actorId: activityEvents.actorId,
      action: activityEvents.action,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.communityId, communityId),
        gte(activityEvents.createdAt, since),
        inArray(activityEvents.action, CONTRIBUTION_LIST),
      ),
    );
  const contributors = new Set(rows.map((r) => r.actorId));
  const recentThreads = rows.filter((r) => r.action === "thread.create").length;
  return { activeContributors: contributors.size, recentThreads };
}
```

- [ ] **Step 2: Surface it from `getBySlug`**

In `src/server/api/routers/communities.ts` `getBySlug`, after computing `memberCount`, load liveness and include it. Add the import `import { loadPublicLiveness } from "@/server/communities/discovery-queries";` and:

```typescript
    const liveness = await loadPublicLiveness(ctx.db, community.id, new Date());

    return {
      ...community,
      memberCount: memberCountResult?.count ?? 0,
      liveness,
    };
```

- [ ] **Step 3: Render the preview + prominent join CTA + OG metadata**

In `src/app/[locale]/communities/[slug]/page.tsx`:
- Render a small liveness preview block (e.g. "`{activeContributors}` people active this week · `{recentThreads}` new discussions") using `community.liveness`.
- Ensure a prominent **Join** CTA is visible for non-members (reuse the existing join button/flow — `communities.join` for open, `requestToJoin` for approval-required; if a CTA already exists, make it visually prominent above the fold).
- Add `generateMetadata` for OG/share tags:

```typescript
import type { Metadata } from "next";
import { api } from "@/trpc/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await api.communities.getBySlug({ slug });
    const title = `${c.name} · AI Tech Community`;
    const description = c.description ?? `Join ${c.name} on the AI Tech Community Hub.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: c.logoUrl ? [{ url: c.logoUrl }] : undefined,
        type: "website",
      },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: "Community · AI Tech Community" };
  }
}
```

(Match the file's actual `params`/`api` server-caller imports — if the page already has a `generateMetadata`, extend it rather than duplicating. `@/trpc/server` is the server-side caller used elsewhere in the app.)

- [ ] **Step 4: Verify + format + commit**

```bash
pnpm check
pnpm prettier --write src/server/communities/discovery-queries.ts src/server/api/routers/communities.ts "src/app/[locale]/communities/[slug]/page.tsx"
git add -A
git commit -m "feat(acquire): public-page liveness preview + OG metadata + join CTA (#59)"
```

---

## Task 10: Acquire intro suggestions (read proc + MCP tool)

**Files:**
- Modify: `src/server/api/routers/advisory.ts` (`newJoinerIntroCandidates`)
- Modify: `src/app/api/mcp/advisory-tools.ts` (`new-joiner-intro-candidates` tool)

The agent reads new-joiner candidates, then calls the **existing** `suggest-introduction` (which writes an `agentSuggestions` row). No new write path or draft type.

- [ ] **Step 1: Add the read procedure**

In `src/server/api/routers/advisory.ts`, add (mirrors `atRiskMembers` — `requireScope "read"`, `requireOwner`, `requireAdvisoryAccess`). Note `windowStart`, `memberProfiles`, `communityMemberships` are already imported:

```typescript
  newJoinerIntroCandidates: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        days: z.number().int().min(1).max(30).default(14),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);

      const since = windowStart(new Date(), input.days);
      const joiners = await ctx.db
        .select({
          userId: communityMemberships.userId,
          joinedAt: communityMemberships.joinedAt,
          displayName: memberProfiles.displayName,
          interests: memberProfiles.interests,
          skills: memberProfiles.skills,
        })
        .from(communityMemberships)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, communityMemberships.userId),
        )
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
            gte(communityMemberships.joinedAt, since),
          ),
        );
      return joiners;
    }),
```

- [ ] **Step 2: Add the MCP tool**

In `src/app/api/mcp/advisory-tools.ts`, add inside `registerAdvisoryTools` (mirrors `get-at-risk-members`):

```typescript
  server.registerTool(
    "new-joiner-intro-candidates",
    {
      description:
        "List members who joined a community you organize in the last N days, with their interests/skills, so you can pick pairs to introduce. Pair them via suggest-introduction (the organizer approves; both members must consent). Requires agent advisory enabled.",
      inputSchema: {
        slug: z.string().describe("Slug of a community you organize."),
        days: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("How many days back to look (default 14)."),
      },
    },
    async ({ slug, days }) => {
      const result = await caller.advisory.newJoinerIntroCandidates({
        slug,
        days: days ?? 14,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
```

- [ ] **Step 3: Verify + format + commit**

```bash
pnpm check
pnpm prettier --write src/server/api/routers/advisory.ts src/app/api/mcp/advisory-tools.ts
git add src/server/api/routers/advisory.ts src/app/api/mcp/advisory-tools.ts
git commit -m "feat(acquire): new-joiner intro candidates read proc + MCP tool (#59)"
```

---

## Task 11: ADR + CONTEXT.md + integration verification

**Files:**
- `docs/adr/0018-referral-attribution-honours-global-xp.md` (already written at design time — verify it is committed)
- Modify: `CONTEXT.md` (glossary + acquire section)

> **CONTEXT.md caution:** the working tree may carry an **unrelated** uncommitted `CONTEXT.md` change (Hub-operator / agent-manifest prep, likely epic #85). Before editing `CONTEXT.md` for this slice, **stash it aside** (`git stash push -- CONTEXT.md`), make the Slice-E edits, commit them, then `git stash pop` to restore the unrelated change. Do not commit the unrelated change into this slice.

- [ ] **Step 1: Confirm the ADR is present**

Run: `git log --oneline -- docs/adr/0018-referral-attribution-honours-global-xp.md`
Expected: shows the design-time commit. If absent, the file exists in the working tree — commit it now.

- [ ] **Step 2: Update CONTEXT.md**

Stash the unrelated change first:
```bash
git stash push -m "context-md-85-prep" -- CONTEXT.md
```
Then add to `CONTEXT.md`: a short **Acquire** section + glossary entries for **Community discovery** (liveness-ranked recommendation of communities a member isn't in), **Referral credit** (Hub-global XP to the referrer, only on the referred member's activation; one credit per member; ADR-0018), and **Cross-promotion** (the digest discovery line, gated by `crossPromote` + the `digest` opt-out). Cross-link `[[Active member]]`, `[[Contribution action]]`, `[[activation]]`. Match the existing CONTEXT.md glossary format.

Commit, then restore:
```bash
pnpm prettier --write CONTEXT.md  # only if CONTEXT.md is covered by format check (.md is not in the mdx glob — skip if so)
git add CONTEXT.md
git commit -m "docs(acquire): CONTEXT.md — discovery, referral, cross-promotion glossary (#59)"
git stash pop
```

- [ ] **Step 3: Full integration verification**

```bash
pnpm check
pnpm vitest run src/server/communities/discovery.test.ts src/server/communities/referral.test.ts src/server/notifications/digest.test.ts
pnpm format:check
```
Expected: `pnpm check` passes (two known warnings only); all listed vitest files pass; `format:check` clean. The only acceptable failing test across the suite is the pre-existing `src/components/agent-suggestions.test.tsx`.

- [ ] **Step 4: Manual smoke (optional, local dev server)**
- `/communities` shows a "Recommended for you" row (when candidates exist and you're not in them).
- A community settings → Acquire panel toggles `crossPromote`/`referralsEnabled`.
- `referral.myLink` returns a code; visiting `/join?code=<code>` and joining sets `invitedBy`.
- `referral-reconcile` cron credits an activated referred member exactly once.
- `/communities/[slug]` shows the liveness preview + OG tags (view-source `og:title`).

- [ ] **Step 5: Commit any remaining glue (if not already committed per task)**

```bash
git add -A
git commit -m "chore(acquire): integration verification + remaining glue (#59)" || echo "nothing to commit"
```

---

## Self-Review (completed by plan author)

**Spec coverage** — every design decision maps to a task:
1. Scope = all three sub-areas, one PR → Tasks 1–11. ✓
2. Discovery ranking = liveness/health → Tasks 1–2. ✓
3. Cross-promotion surface = directory + digest line → Task 3. ✓
4. Referral mechanism = reuse `community_invite` + `invitedBy` → Task 5 (`myLink`); attribution already in `acceptInvite`. ✓
5. Referral credit on activation, Hub XP, reconciled → Tasks 6–7. ✓
6. Anti-abuse: self-referral block, one-credit-per-member, activation-gated → `decideReferralCredit` (Task 6) + unique `referred_user_id` + claim-before-award (Task 7). No window cap (correctly omitted). ✓
7. Referral XP = fixed Hub constant `REFERRAL_ACTIVATED = 50` → Task 6. ✓
8. Agent role = intro suggestions only → Task 10 (read proc + MCP feeding existing `suggest-introduction`). ✓
9. Public-page enrichment = liveness preview + share meta + join CTA → Task 9. ✓
10. Credit delivery = notification + audit event, `recipientId` null → Task 7. ✓
11. Admin config = `community_acquire_config` → Task 4. ✓
12. ADR-0018 + CONTEXT.md → Task 11. ✓

**Placeholder scan:** No "TBD"/"implement later". UI tasks (3,4,8,9) describe components concretely and point at existing patterns to mirror; the pure cores, queries, routers, cron, and MCP carry full code. Acceptable — UI exactness is bounded by the existing component library, which the plan tells the engineer to reuse.

**Type consistency:** `CommunityCandidate` (Task 1) is produced by `loadDiscoveryCandidates` (Task 2) and consumed by `rankCommunitiesForMember` (Tasks 2,3) — fields aligned. `ActivationConfig`/`ActivationStage`/`computeActivationStage` (existing) reused by `referral-queries` (Task 7) + `referral.ts` (Task 6). `decideReferralCredit` signature identical in Tasks 6 and 7. `referralCredits` columns (Task 5 schema) match the Task 4 migration DDL and the Task 7 insert. `HubDigest.discovery` added in Task 3 used consistently in render + cron.

**Known cross-task ordering:** `communityAcquireConfig` (Task 4 schema) and `referralCredits` (Task 5 schema) are referenced by Task 2's query and Task 7's cron respectively — the plan flags this in Task 2's Step-1 note and Task 4's migration note. If executing strictly in order, the schema symbols compile before their consumers because Task 4/5 precede Task 7; Task 2 is the only forward reference and is called out explicitly.

