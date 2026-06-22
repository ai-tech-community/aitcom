# ASCII Discover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the public `/communities` directory into a "Discover" surface that browses communities AND their public spaces, in a bespoke "Town Square" ASCII narrative.

**Architecture:** Reuse-first. The communities section reuses `communities.list` (keyset) with a new `sort` for **Newest/Largest**; **Trending** is a ranked top-N shelf reusing `loadDiscoveryCandidates` + the pure `livenessScore`. A new public `spaces.discoverPublic` lists cross-community public rooms with a grouped active-member count. The page is recomposed into a Town Square hero (original ASCII art, `aria-hidden`) + facet tabs + two ruled-row sections, reusing `SpaceAvatar`, `SectionLabel`, and existing primitives.

**Tech Stack:** Next.js App Router (RSC shell + client sections), tRPC v11, Drizzle ORM (Postgres `app` schema), next-intl (en/nl), Tailwind + `@/components/ui/*`, Vitest (pure + DB-gated integration).

**Spec:** `docs/superpowers/specs/2026-06-22-ascii-discover-design.md`

---

## Prerequisite (read first)

This plan **depends on Plan 2b** for two things that live on the `feat/community-spaces-plan-2b` branch, not yet on `main`:
- `src/components/communities/rooms/space-avatar.tsx` (`SpaceAvatar`).
- The **grouped active-member-count pattern** (the Plan 2b fix: never an inline `${column}`-interpolated correlated subquery — Drizzle emits the outer column unqualified and it mis-correlates to 0).

**Build this plan on a branch that includes Plan 2b** — i.e. after Plan 2b merges to `main`, branch `feat/ascii-discover` off `main`; or, if building sooner, branch off `feat/community-spaces-plan-2b`. Do NOT duplicate `SpaceAvatar`.

**v1 refinements (decided during planning, consistent with the spec's intent):**
- **Trending** is a ranked top-N shelf (no keyset — a liveness score isn't a stable cursor). **Newest/Largest** are keyset-paginated with "load more".
- **Search overrides facets:** when the search box is non-empty, both sections switch to filtered results (communities by name, spaces by name/purpose); facet tabs apply only when search is empty.
- **Space rows show member count only** (no face stack) to avoid an N+1; community rows keep their faces (free from `communities.list`).

**Conventions for every task:** branch off the prerequisite branch; never `git checkout`/`switch` in subagents; run `pnpm typecheck` + `pnpm lint` before each commit; DB-gated tests run with `RUN_DB_TESTS=1` + local Postgres (they `skipIf` out otherwise); commit per task with the message shown.

---

## File Structure

**Create:**
- `src/components/communities/discover/town-square-hero.tsx` — ASCII hero + terminal search input (controlled).
- `src/components/communities/discover/discover-facets.tsx` — Trending/Newest/Largest tabs.
- `src/components/communities/discover/discover-communities.tsx` — communities section (rows + load-more / trending shelf).
- `src/components/communities/discover/discover-spaces.tsx` — public-spaces section (rows + load-more).
- `src/components/communities/discover/community-row.tsx` — one community row (avatar/logo, name, desc, faces, count, View).
- `src/components/communities/discover/space-row.tsx` — one space row (`SpaceAvatar`, `#name`, `in {community}`, count, Open).
- `src/components/communities/discover/ascii-art.ts` — original ASCII art strings (hero, townsfolk, empty-state figure).
- `src/app/[locale]/discover/page.tsx` — redirect to `/communities`.

**Modify:**
- `src/server/api/routers/communities.ts` — add `sort` to `list`; add `trending` procedure.
- `src/server/api/routers/spaces.ts` — add `discoverPublic` procedure.
- `src/components/communities/communities-directory.tsx` — recompose into Discover (hero + facets + sections).
- `src/app/[locale]/communities/page.tsx` — Discover metadata.
- `messages/en.json` + `messages/nl.json` — `communities.discover.*` keys.
- `src/server/api/routers/communities.integration.test.ts` (create if absent) and `spaces.integration.test.ts` — DB-gated tests.

---

## Task 1: `communities.list` gains a `sort` (Newest | Largest)

**Files:**
- Modify: `src/server/api/routers/communities.ts:44-120`
- Test: `src/server/api/routers/communities.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/api/routers/communities.integration.test.ts` (mirror the DB-gating header from `spaces.integration.test.ts`):

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
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(dbUrl);
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("communities discover [DB integration]", () => {
  let db: typeof import("@/server/db").db;
  let schema: typeof import("@/server/db/schema");
  const ids: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    [{ db }, schema] = await Promise.all([import("@/server/db"), import("@/server/db/schema")]);
  });

  beforeEach(async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const owner = `disc-owner-${sfx}`;
    userIds.push(owner);
    await db.insert(schema.user).values({ id: owner, email: `${owner}@example.test`, name: "Owner" });
    // small community (1 member) and large community (3 members), both listed.
    const [small] = await db.insert(schema.communities).values({
      name: `Small ${sfx}`, slug: `small-${sfx}`, createdBy: owner, isListedInDirectory: true,
    }).returning();
    const [large] = await db.insert(schema.communities).values({
      name: `Large ${sfx}`, slug: `large-${sfx}`, createdBy: owner, isListedInDirectory: true,
    }).returning();
    ids.push(small!.id, large!.id);
    for (let i = 0; i < 1; i++) {
      const u = `m-s-${sfx}-${i}`; userIds.push(u);
      await db.insert(schema.user).values({ id: u, email: `${u}@e.test`, name: u });
      await db.insert(schema.communityMemberships).values({ communityId: small!.id, userId: u, status: "active", role: "member" });
    }
    for (let i = 0; i < 3; i++) {
      const u = `m-l-${sfx}-${i}`; userIds.push(u);
      await db.insert(schema.user).values({ id: u, email: `${u}@e.test`, name: u });
      await db.insert(schema.communityMemberships).values({ communityId: large!.id, userId: u, status: "active", role: "member" });
    }
  });

  afterEach(async () => {
    const { inArray } = await import("drizzle-orm");
    if (ids.length) {
      await db.delete(schema.communityMemberships).where(inArray(schema.communityMemberships.communityId, ids));
      await db.delete(schema.communities).where(inArray(schema.communities.id, ids));
    }
    if (userIds.length) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
    ids.length = 0; userIds.length = 0;
  });

  it("sort=largest orders by active member count desc", async () => {
    const { and, desc, eq, isNull, sql, count } = await import("drizzle-orm");
    // Inline the production 'largest' ordering to assert it ranks Large before Small.
    const mc = db.select({ communityId: schema.communityMemberships.communityId, count: count().as("member_count") })
      .from(schema.communityMemberships).where(eq(schema.communityMemberships.status, "active"))
      .groupBy(schema.communityMemberships.communityId).as("mc");
    const rows = await db.select({ id: schema.communities.id, memberCount: sql<number>`coalesce(${mc.count},0)` })
      .from(schema.communities).leftJoin(mc, eq(schema.communities.id, mc.communityId))
      .where(and(eq(schema.communities.isListedInDirectory, true), isNull(schema.communities.deletedAt)))
      .orderBy(desc(sql`coalesce(${mc.count},0)`), desc(schema.communities.id));
    const our = rows.filter((r) => ids.includes(r.id));
    expect(our[0]!.memberCount).toBeGreaterThanOrEqual(our[our.length - 1]!.memberCount);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/communities.integration.test.ts`
Expected: with local DB, FAIL initially only if the production code is wired wrong; this test inlines the ordering so it mainly guards the SQL shape. Without local DB it SKIPS. (If it passes immediately, that confirms the ordering SQL is valid — proceed.)

- [ ] **Step 3: Add `sort` to the procedure**

In `communities.ts` `list`, extend the input and ordering. Change the input object (line ~47) to add:

```ts
        sort: z.enum(["newest", "largest"]).default("newest"),
```

And change the cursor to carry the sort key. Replace the keyset block (lines ~79-101) with:

```ts
      // Keyset pagination. Newest: (createdAt, id) desc. Largest: (memberCount, id) desc.
      const memberCountExpr = sql<number>`coalesce(${memberCountSq.count}, 0)`;
      if (input.cursor) {
        if (input.sort === "largest" && input.cursor.memberCount != null) {
          conditions.push(
            sql`(${memberCountExpr}, ${communities.id}) < (${input.cursor.memberCount}, ${input.cursor.id})`,
          );
        } else {
          conditions.push(
            sql`(${communities.createdAt}, ${communities.id}) < (${input.cursor.createdAt}, ${input.cursor.id})`,
          );
        }
      }

      const orderBy =
        input.sort === "largest"
          ? [desc(memberCountExpr), desc(communities.id)]
          : [desc(communities.createdAt), desc(communities.id)];

      const items = await ctx.db
        .select({
          id: communities.id,
          name: communities.name,
          slug: communities.slug,
          description: communities.description,
          logoUrl: communities.logoUrl,
          joinPolicy: communities.joinPolicy,
          memberCount: memberCountExpr,
          createdAt: communities.createdAt,
        })
        .from(communities)
        .leftJoin(memberCountSq, eq(communities.id, memberCountSq.communityId))
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(input.limit + 1);
```

Update the cursor input type (line ~51) to include the optional member count:

```ts
        cursor: z
          .object({
            createdAt: z.string().datetime(),
            id: z.string(),
            memberCount: z.number().nullish(),
          })
          .nullish(),
```

And update `nextCursor` construction (line ~103) to carry `memberCount`:

```ts
      let nextCursor: typeof input.cursor | undefined;
      if (items.length > input.limit) {
        const next = items.pop()!;
        nextCursor = {
          createdAt: next.createdAt.toISOString(),
          id: next.id,
          memberCount: next.memberCount,
        };
      }
```

- [ ] **Step 4: Run the test**

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/communities.integration.test.ts` → PASS (or skip without DB).
Run: `pnpm typecheck` → passes.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/communities.ts src/server/api/routers/communities.integration.test.ts
git commit -m "feat(discover): communities.list sort=newest|largest with keyset"
```

---

## Task 2: `communities.trending` ranked shelf

**Files:**
- Modify: `src/server/api/routers/communities.ts` (add procedure)

- [ ] **Step 1: Add the procedure**

`loadDiscoveryCandidates` + the pure `livenessScore` already exist. Add a public `trending` procedure that ranks all listed candidates by liveness, slices to a limit, and attaches faces (reusing `loadStackFacesForCommunities`). Place it right after `list`:

```ts
  /** Top communities by liveness score (anonymous trending shelf). No pagination. */
  trending: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(48).default(24) }))
    .query(async ({ ctx, input }) => {
      const candidates = await loadDiscoveryCandidates(ctx.db, new Date());
      const ranked = candidates
        .map((c) => ({ ...c, score: livenessScore(c) }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.activeNow - a.activeNow ||
            b.memberCount - a.memberCount ||
            (a.communityId < b.communityId ? -1 : a.communityId > b.communityId ? 1 : 0),
        )
        .slice(0, input.limit);
      const faces = await loadStackFacesForCommunities(
        ctx.db,
        ranked.map((c) => c.communityId),
      );
      return {
        items: ranked.map((c) => ({
          id: c.communityId,
          name: c.name,
          slug: c.slug,
          description: c.description,
          logoUrl: c.logoUrl,
          joinPolicy: "open" as const, // display-only; Join uses the real policy on the community page
          memberCount: c.memberCount,
          faces: faces.get(c.communityId) ?? [],
        })),
      };
    }),
```

Add the imports at the top of `communities.ts`:

```ts
import { loadDiscoveryCandidates } from "@/server/communities/discovery-queries";
import { livenessScore } from "@/server/communities/discovery";
```

(`loadStackFacesForCommunities` is already imported — it's used by `list`.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck` → passes. (`livenessScore` is pure and already unit-covered; the ranking here reuses it, so no new unit test is needed. A DB-gated smoke test is added in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(discover): communities.trending liveness-ranked shelf"
```

---

## Task 3: `spaces.discoverPublic` cross-community public rooms

**Files:**
- Modify: `src/server/api/routers/spaces.ts`
- Test: `src/server/api/routers/spaces.integration.test.ts`

- [ ] **Step 1: Write the failing test**

In `spaces.integration.test.ts`, inside the `rooms [DB integration]` describe, add a test asserting a public room in a LISTED community is discoverable, a private room is not, and a room in an UNLISTED community is not. Use the grouped-count expectation:

```ts
  it("discoverPublic surfaces only public rooms in listed communities, with active count", async () => {
    const { db, schema } = m;
    const { and, eq, inArray, isNull, sql } = await import("drizzle-orm");
    // Mark the test community listed and add a private room + an active member.
    await db.update(schema.communities).set({ isListedInDirectory: true }).where(eq(schema.communities.id, communityId));
    const [priv] = await db.insert(schema.spaces).values({
      communityId, kind: "room", visibility: "private", name: "secret",
      slug: `secret-${Date.now()}`, position: 101, createdBy: userId,
    }).returning();
    await db.insert(schema.spaceMemberships).values({ spaceId: roomSpaceId, userId, status: "active" });

    // Replicate discoverPublic's core query shape.
    const rooms = await db.select({ id: schema.spaces.id, visibility: schema.spaces.visibility })
      .from(schema.spaces)
      .innerJoin(schema.communities, eq(schema.communities.id, schema.spaces.communityId))
      .where(and(
        eq(schema.spaces.kind, "room"),
        eq(schema.spaces.visibility, "public"),
        isNull(schema.spaces.archivedAt),
        eq(schema.communities.isListedInDirectory, true),
        isNull(schema.communities.deletedAt),
      ));
    const roomIds = rooms.map((r) => r.id);
    expect(roomIds).toContain(roomSpaceId);
    expect(roomIds).not.toContain(priv!.id);

    const counts = await db.select({ spaceId: schema.spaceMemberships.spaceId, count: sql<number>`COUNT(*)::int` })
      .from(schema.spaceMemberships)
      .where(and(inArray(schema.spaceMemberships.spaceId, roomIds), eq(schema.spaceMemberships.status, "active")))
      .groupBy(schema.spaceMemberships.spaceId);
    const byId = new Map(counts.map((c) => [c.spaceId, c.count]));
    expect(byId.get(roomSpaceId) ?? 0).toBe(1);

    await db.delete(schema.spaceMemberships).where(eq(schema.spaceMemberships.spaceId, roomSpaceId));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, priv!.id));
  });
```

- [ ] **Step 2: Run it to verify it fails / skips**

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts` → PASS shape if DB up (it inlines the query), else SKIP.

- [ ] **Step 3: Add the procedure**

In `spaces.ts`, add a public `discoverPublic` procedure (use the existing imports; add `desc`, `lt`, `or`, `ilike` to the drizzle import if missing, and `publicProcedure` is already imported). Place it after `listRooms`:

```ts
  /** Cross-community public rooms for Discover. Public; grouped active count; keyset (createdAt,id). */
  discoverPublic: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string().datetime(), id: z.string() }).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(spaces.kind, "room"),
        eq(spaces.visibility, "public"),
        isNull(spaces.archivedAt),
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
      ];
      if (input.search) {
        const esc = input.search.replace(/[%_\\]/g, "\\$&");
        conditions.push(
          or(ilike(spaces.name, `%${esc}%`), ilike(spaces.purpose, `%${esc}%`))!,
        );
      }
      if (input.cursor) {
        conditions.push(
          sql`(${spaces.createdAt}, ${spaces.id}) < (${input.cursor.createdAt}, ${input.cursor.id})`,
        );
      }
      const rows = await ctx.db
        .select({
          spaceId: spaces.id,
          spaceName: spaces.name,
          spaceSlug: spaces.slug,
          purpose: spaces.purpose,
          createdAt: spaces.createdAt,
          communityName: communities.name,
          communitySlug: communities.slug,
        })
        .from(spaces)
        .innerJoin(communities, eq(communities.id, spaces.communityId))
        .where(and(...conditions))
        .orderBy(desc(spaces.createdAt), desc(spaces.id))
        .limit(input.limit + 1);

      let nextCursor: typeof input.cursor | undefined;
      if (rows.length > input.limit) {
        const next = rows.pop()!;
        nextCursor = { createdAt: next.createdAt.toISOString(), id: next.spaceId };
      }

      // Grouped active-member count (NOT an inline correlated subquery — that
      // mis-correlates under Drizzle; see Plan 2b fix).
      const spaceIds = rows.map((r) => r.spaceId);
      const counts = spaceIds.length
        ? await ctx.db
            .select({ spaceId: spaceMemberships.spaceId, count: sql<number>`COUNT(*)::int` })
            .from(spaceMemberships)
            .where(and(inArray(spaceMemberships.spaceId, spaceIds), eq(spaceMemberships.status, "active")))
            .groupBy(spaceMemberships.spaceId)
        : [];
      const countById = new Map(counts.map((c) => [c.spaceId, c.count]));

      return {
        items: rows.map((r) => ({
          spaceId: r.spaceId,
          spaceName: r.spaceName,
          spaceSlug: r.spaceSlug,
          purpose: r.purpose,
          communityName: r.communityName,
          communitySlug: r.communitySlug,
          memberCount: countById.get(r.spaceId) ?? 0,
        })),
        nextCursor,
      };
    }),
```

Ensure `spaces.ts` imports include `desc`, `or`, `ilike`, `inArray`, `lt` as needed (add any missing to the `drizzle-orm` import line).

- [ ] **Step 4: Run + typecheck**

Run: `RUN_DB_TESTS=1 pnpm test src/server/api/routers/spaces.integration.test.ts` → PASS (or skip). `pnpm typecheck` → passes.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/spaces.ts src/server/api/routers/spaces.integration.test.ts
git commit -m "feat(discover): spaces.discoverPublic cross-community public rooms"
```

---

## Task 4: Original ASCII art assets

**Files:**
- Create: `src/components/communities/discover/ascii-art.ts`

- [ ] **Step 1: Create the art module**

```ts
/**
 * Original AIT "Town Square" ASCII art (no third-party IP). All art is decorative
 * and rendered aria-hidden; real headings/labels carry the accessible structure.
 */

export const TOWN_SQUARE_BANNER = String.raw`
   /\    /\    /\
  /  \  /  \  /  \
 /____\/____\/____\
 |[]||  | A. |  ||[]|
 |__||__|____|__||__|
    o     o    o:   o`;

/** A small "quiet square" figure for empty states. */
export const QUIET_SQUARE = String.raw`
    .--.
   ( -- )    the square's quiet here
    >--<
   /    \`;
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → passes.

```bash
git add src/components/communities/discover/ascii-art.ts
git commit -m "feat(discover): original Town Square ASCII art assets"
```

---

## Task 5: i18n keys

**Files:**
- Modify: `messages/en.json`, `messages/nl.json` (under `communities.discover`)

- [ ] **Step 1: Add English keys**

Add a `discover` object under `communities` in `messages/en.json`:

```json
      "discover": {
        "title": "Discover",
        "tagline": "where engineers and agents build together",
        "searchPlaceholder": "search the square",
        "facetTrending": "Trending",
        "facetNewest": "Newest",
        "facetLargest": "Largest",
        "communities": "Communities",
        "spaces": "Spaces",
        "spacesSub": "public rooms across communities",
        "membersCount": "{count} · members",
        "view": "View",
        "open": "Open",
        "inCommunity": "in {community}",
        "loadMore": "load more",
        "emptyCommunities": "the square's quiet here — try another search",
        "emptySpaces": "no public rooms match — try another search"
      }
```

- [ ] **Step 2: Add Dutch keys**

Matching keys in `messages/nl.json`:

```json
      "discover": {
        "title": "Ontdek",
        "tagline": "waar engineers en agents samen bouwen",
        "searchPlaceholder": "doorzoek het plein",
        "facetTrending": "Trending",
        "facetNewest": "Nieuwste",
        "facetLargest": "Grootste",
        "communities": "Communities",
        "spaces": "Ruimtes",
        "spacesSub": "openbare ruimtes in alle communities",
        "membersCount": "{count} · leden",
        "view": "Bekijk",
        "open": "Openen",
        "inCommunity": "in {community}",
        "loadMore": "meer laden",
        "emptyCommunities": "het is rustig op het plein — probeer een andere zoekopdracht",
        "emptySpaces": "geen openbare ruimtes gevonden — probeer iets anders"
      }
```

- [ ] **Step 3: Validate + commit**

Run: `node -e "require('./messages/en.json');require('./messages/nl.json');console.log('ok')"` → `ok`. `pnpm typecheck` → passes.

```bash
git add messages/en.json messages/nl.json
git commit -m "i18n(discover): Town Square Discover keys (en/nl)"
```

---

## Task 6: `community-row` + `space-row` presentational components

**Files:**
- Create: `src/components/communities/discover/community-row.tsx`
- Create: `src/components/communities/discover/space-row.tsx`

- [ ] **Step 1: community-row**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";

type Face = { userId: string; displayName: string | null; avatarUrl: string | null };

export function CommunityRow({
  slug, name, description, logoUrl, memberCount, faces,
}: {
  slug: string; name: string; description: string | null;
  logoUrl: string | null; memberCount: number; faces: Face[];
}) {
  const t = useTranslations("communities.discover");
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      {logoUrl ? (
        <Avatar size="sm" className="rounded-md">
          <AvatarImage src={logoUrl} alt="" />
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
      ) : (
        <SpaceAvatar name={name} />
      )}
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold">{name}</span>
        {description ? (
          <p className="text-muted-foreground truncate text-sm">{description}</p>
        ) : null}
      </div>
      <span className="text-muted-foreground hidden shrink-0 font-mono text-xs sm:inline">
        {t("membersCount", { count: memberCount })}
      </span>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href={`/communities/${slug}`}>{t("view")}</Link>
      </Button>
    </li>
  );
}
```

- [ ] **Step 2: space-row**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";

export function SpaceRow({
  spaceName, spaceSlug, communityName, communitySlug, memberCount,
}: {
  spaceName: string | null; spaceSlug: string;
  communityName: string; communitySlug: string; memberCount: number;
}) {
  const t = useTranslations("communities.discover");
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <SpaceAvatar name={spaceName} />
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold">#{spaceName ?? "room"}</span>
        <p className="text-muted-foreground truncate text-sm">
          {t("inCommunity", { community: communityName })}
        </p>
      </div>
      <span
        className="text-muted-foreground hidden shrink-0 items-center gap-1 font-mono text-xs sm:inline-flex"
        aria-label={t("membersCount", { count: memberCount })}
      >
        <Users aria-hidden="true" className="size-3.5" />
        {memberCount}
      </span>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href={`/communities/${communitySlug}/spaces/${spaceSlug}`}>{t("open")}</Link>
      </Button>
    </li>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck` → passes. (Verify `Avatar` accepts `size="sm"` and `getInitials` exists in `@/lib/avatar`; both are used by the room members panel.)

```bash
git add src/components/communities/discover/community-row.tsx src/components/communities/discover/space-row.tsx
git commit -m "feat(discover): community-row + space-row presentational components"
```

---

## Task 7: `discover-spaces` section (query + load-more)

**Files:**
- Create: `src/components/communities/discover/discover-spaces.tsx`

- [ ] **Step 1: Create the section**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { SpaceRow } from "./space-row";

export function DiscoverSpaces({ search }: { search: string }) {
  const t = useTranslations("communities.discover");
  const q = api.spaces.discoverPublic.useInfiniteQuery(
    { search: search || undefined, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  if (q.isLoading) {
    return (
      <section className="mt-10">
        <SectionLabel as="h2">{t("spaces")}</SectionLabel>
        <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (q.isError) return <div className="mt-10"><ErrorState onRetry={() => void q.refetch()} /></div>;

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <section className="mt-10">
        <SectionLabel as="h2">{t("spaces")}</SectionLabel>
        <p className="text-muted-foreground mt-3 text-sm">{t("emptySpaces")}</p>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <SectionLabel as="h2">{t("spaces")} · {items.length}</SectionLabel>
      <p className="text-muted-foreground mt-1 font-mono text-xs">{t("spacesSub")}</p>
      <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
        {items.map((s) => (
          <SpaceRow key={s.spaceId} spaceName={s.spaceName} spaceSlug={s.spaceSlug}
            communityName={s.communityName} communitySlug={s.communitySlug} memberCount={s.memberCount} />
        ))}
      </ul>
      {q.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → passes. (Confirm `api.spaces.discoverPublic.useInfiniteQuery` is available — tRPC exposes `useInfiniteQuery` for procedures whose input has a `cursor`.)

```bash
git add src/components/communities/discover/discover-spaces.tsx
git commit -m "feat(discover): public spaces section with infinite load"
```

---

## Task 8: `discover-communities` section (facets-aware)

**Files:**
- Create: `src/components/communities/discover/discover-communities.tsx`

- [ ] **Step 1: Create the section**

It renders Trending (shelf, no pagination) or Newest/Largest (infinite). Search overrides to Newest results.

```tsx
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Button } from "@/components/ui/button";
import { CommunityRow } from "./community-row";

export type Facet = "trending" | "newest" | "largest";

function RowsSkeleton() {
  return (
    <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  );
}

export function DiscoverCommunities({ facet, search }: { facet: Facet; search: string }) {
  const t = useTranslations("communities.discover");
  const searching = search.trim().length > 0;
  // Trending shelf only when not searching and facet is trending.
  const useTrending = !searching && facet === "trending";

  const trendingQ = api.communities.trending.useQuery(
    { limit: 24 },
    { enabled: useTrending },
  );
  const listQ = api.communities.list.useInfiniteQuery(
    {
      search: search || undefined,
      limit: 20,
      sort: facet === "largest" && !searching ? "largest" : "newest",
    },
    { enabled: !useTrending, getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const Header = (
    <SectionLabel as="h2">{t("communities")}</SectionLabel>
  );

  if (useTrending) {
    if (trendingQ.isLoading) return <section>{Header}<RowsSkeleton /></section>;
    if (trendingQ.isError) return <section>{Header}<div className="mt-3"><ErrorState onRetry={() => void trendingQ.refetch()} /></div></section>;
    const items = trendingQ.data?.items ?? [];
    return (
      <section>
        {Header}
        {items.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">{t("emptyCommunities")}</p>
        ) : (
          <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
            {items.map((c) => (
              <CommunityRow key={c.id} slug={c.slug} name={c.name} description={c.description}
                logoUrl={c.logoUrl} memberCount={c.memberCount} faces={c.faces} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (listQ.isLoading) return <section>{Header}<RowsSkeleton /></section>;
  if (listQ.isError) return <section>{Header}<div className="mt-3"><ErrorState onRetry={() => void listQ.refetch()} /></div></section>;
  const items = listQ.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section>
      <SectionLabel as="h2">{t("communities")} · {items.length}</SectionLabel>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">{t("emptyCommunities")}</p>
      ) : (
        <ul className="border-border divide-border/60 mt-3 divide-y overflow-hidden rounded-lg border">
          {items.map((c) => (
            <CommunityRow key={c.id} slug={c.slug} name={c.name} description={c.description}
              logoUrl={c.logoUrl} memberCount={c.memberCount} faces={c.faces} />
          ))}
        </ul>
      )}
      {listQ.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" disabled={listQ.isFetchingNextPage} onClick={() => void listQ.fetchNextPage()}>
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → passes.

```bash
git add src/components/communities/discover/discover-communities.tsx
git commit -m "feat(discover): communities section (trending shelf + newest/largest infinite)"
```

---

## Task 9: `discover-facets` tabs

**Files:**
- Create: `src/components/communities/discover/discover-facets.tsx`

- [ ] **Step 1: Create the tabs**

Active facet is the single Signal-Orange accent (One Voice). Disabled when searching.

```tsx
"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Facet } from "./discover-communities";

const FACETS: Facet[] = ["trending", "newest", "largest"];

export function DiscoverFacets({
  value, onChange, disabled,
}: {
  value: Facet; onChange: (f: Facet) => void; disabled?: boolean;
}) {
  const t = useTranslations("communities.discover");
  const label: Record<Facet, string> = {
    trending: t("facetTrending"), newest: t("facetNewest"), largest: t("facetLargest"),
  };
  return (
    <div role="tablist" aria-label={t("communities")} className="flex items-center gap-4">
      {FACETS.map((f) => {
        const active = value === f;
        return (
          <button
            key={f}
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(f)}
            className={cn(
              "font-mono text-xs tracking-wider uppercase transition-colors disabled:opacity-50",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? "[ " : ""}{label[f]}{active ? " ]" : ""}
          </button>
        );
      })}
    </div>
  );
}
```

(`text-primary` is Signal Orange in this system. Confirm against `globals.css`; if the token differs, use the project's accent class.)

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → passes.

```bash
git add src/components/communities/discover/discover-facets.tsx
git commit -m "feat(discover): facet tabs (active = one orange accent)"
```

---

## Task 10: `town-square-hero` (ASCII banner + terminal search)

**Files:**
- Create: `src/components/communities/discover/town-square-hero.tsx`

- [ ] **Step 1: Create the hero**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { TOWN_SQUARE_BANNER } from "./ascii-art";

export function TownSquareHero({
  search, onSearchChange,
}: {
  search: string; onSearchChange: (v: string) => void;
}) {
  const t = useTranslations("communities.discover");
  return (
    <div className="border-border border-b pb-6">
      <SectionLabel as="h1" bordered={false}>{t("title")}</SectionLabel>
      <pre
        aria-hidden="true"
        className="text-muted-foreground mt-3 overflow-x-auto font-mono text-[10px] leading-tight sm:text-xs"
      >
        {TOWN_SQUARE_BANNER}
      </pre>
      <p className="text-muted-foreground mt-2 text-sm">{t("tagline")}</p>
      <div className="mt-4 flex items-center gap-2 font-mono">
        <span aria-hidden="true" className="text-muted-foreground">&gt;</span>
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="font-mono text-sm tracking-wider"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → passes.

```bash
git add src/components/communities/discover/town-square-hero.tsx
git commit -m "feat(discover): Town Square ASCII hero + terminal search"
```

---

## Task 11: Recompose the page into Discover

**Files:**
- Modify: `src/components/communities/communities-directory.tsx`
- Modify: `src/app/[locale]/communities/page.tsx`
- Create: `src/app/[locale]/discover/page.tsx`

- [ ] **Step 1: Recompose `communities-directory.tsx`**

Replace the file body with the Discover composition (hero + facets + the two sections), preserving the 300ms search debounce and `CreateCommunityDialog`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TownSquareHero } from "./discover/town-square-hero";
import { DiscoverFacets } from "./discover/discover-facets";
import { DiscoverCommunities, type Facet } from "./discover/discover-communities";
import { DiscoverSpaces } from "./discover/discover-spaces";
import { CreateCommunityDialog } from "./create-community-dialog";

const DEBOUNCE_MS = 300;

export function CommunitiesDirectory() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [facet, setFacet] = useState<Facet>("trending");
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearchChange = useCallback((v: string) => {
    setSearch(v);
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => setDebounced(v), DEBOUNCE_MS);
  }, []);
  useEffect(() => () => { if (ref.current) clearTimeout(ref.current); }, []);

  const searching = debounced.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-12">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TownSquareHero search={search} onSearchChange={onSearchChange} />
        </div>
        <div className="shrink-0 pt-1"><CreateCommunityDialog /></div>
      </div>

      <div className="mt-6">
        <DiscoverFacets value={facet} onChange={setFacet} disabled={searching} />
      </div>

      <div className="mt-6">
        <DiscoverCommunities facet={facet} search={debounced} />
      </div>

      <DiscoverSpaces search={debounced} />
    </div>
  );
}
```

- [ ] **Step 2: Discover metadata on the route**

In `src/app/[locale]/communities/page.tsx`, update `metadata` title/description to "Discover":

```ts
export const metadata: Metadata = {
  title: "Discover",
  description: "Discover communities and public spaces where engineers and AI agents build together.",
  ...buildOgMeta(
    "Discover",
    "Discover communities and public spaces where engineers and AI agents build together.",
    "Discover",
  ),
  alternates: buildAlternates("/communities"),
};
```

- [ ] **Step 3: `/discover` redirect**

Create `src/app/[locale]/discover/page.tsx`:

```tsx
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function DiscoverRedirect() {
  const locale = await getLocale();
  redirect({ href: "/communities", locale });
}
```

(If `@/i18n/navigation` doesn't export a server `redirect`, use `next/navigation`'s `redirect("/communities")` — check how other locale redirects are done in the repo and match that pattern.)

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint` → pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/communities-directory.tsx "src/app/[locale]/communities/page.tsx" "src/app/[locale]/discover/page.tsx"
git commit -m "feat(discover): recompose /communities into Town Square Discover + /discover redirect"
```

---

## Task 12: DB-gated smoke test for trending + whole-branch verification

**Files:**
- Modify: `src/server/api/routers/communities.integration.test.ts`

- [ ] **Step 1: Add a trending smoke assertion**

Add to the discover describe block — asserts `livenessScore` ordering is wired (more active community ranks first). Reuse the per-test fixtures by emitting activity events for the "large" community:

```ts
  it("livenessScore ranks a more-active community above a quiet one", async () => {
    const { livenessScore } = await import("@/server/communities/discovery");
    const quiet = { communityId: "q", slug: "q", name: "q", description: null, logoUrl: null, memberCount: 1, activeNow: 0, contributionCount: 0, contributionPrev: 0, newJoins: 0 };
    const lively = { ...quiet, communityId: "l", activeNow: 5, contributionCount: 10, contributionPrev: 2, newJoins: 3 };
    expect(livenessScore(lively)).toBeGreaterThan(livenessScore(quiet));
  });
```

- [ ] **Step 2: Run + whole-branch checks**

Run: `pnpm typecheck && pnpm lint` → pass.
Run: `pnpm test` → all pure tests pass; DB-gated suites skip cleanly without a local DB.
Run (if local DB): `RUN_DB_TESTS=1 pnpm test src/server/api/routers/communities.integration.test.ts src/server/api/routers/spaces.integration.test.ts` → pass.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/communities.integration.test.ts
git commit -m "test(discover): livenessScore ordering smoke test"
```

---

## Task 13: Impeccable polish pass

**Files:** the `discover/` components.

- [ ] **Step 1: Visual pass**

Invoke the `impeccable` skill (polish) on the Discover surface (`town-square-hero`, the two sections, the rows) against PRODUCT.md / DESIGN.md. Hold the named rules: One Voice (orange only on the active facet), No-Cream (white/true-dark canvas), House Kicker (`/ LABEL` is the only section marker — the ASCII banner is decoration beside it, never a competing eyebrow), Mono-Is-Machine (counts/stats mono; names/taglines sans), Flat-By-Default (ruled rows, hover = bg shift). Verify the ASCII `<pre>` scrolls/collapses gracefully on mobile and is `aria-hidden`; verify EN/NL render without overflow; verify a `prefers-reduced-motion` path for any cursor blink added.

- [ ] **Step 2: Run the app + verify**

Load `/communities` (and `/discover` → redirect) as logged-out and logged-in: Trending shelf renders; switching facets re-queries; typing search disables facets and filters both sections; community View and space Open links resolve; empty search states show the quiet-square copy. Capture as a verification note.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "polish(discover): impeccable pass on the Town Square surface"
```

---

## Self-Review Notes (author)

- **Spec coverage:** evolve `/communities` (T11) + `/discover` redirect (T11); communities section with liveness facets — Trending (T2/T8), Newest/Largest (T1/T8); public spaces section (T3/T7); Town Square ASCII narrative + a11y (T4/T10/T13); reuse `SpaceAvatar`/`SectionLabel` (T6); grouped member count, not the broken subquery (T3); funnel via View/Open links (T6); i18n (T5); tests (T1/T3/T12). All spec §-mapped.
- **v1 deviations from spec, flagged:** Trending is a non-paginated shelf; search overrides facets; space rows omit faces. All noted in the prerequisite block.
- **Type consistency:** `Facet` defined once (discover-communities) and imported by facets/page; `communities.trending` and `communities.list` both return `{ items: [{id,name,slug,description,logoUrl,joinPolicy,memberCount,faces}] }`-shaped rows so `CommunityRow` props match either source; `spaces.discoverPublic` item shape matches `SpaceRow` props.
- **Dependency:** requires Plan 2b's `SpaceAvatar` + grouped-count pattern (stated up top).
