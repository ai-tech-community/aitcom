# Community Member Stack Implementation Plan

> **⚠️ Superseded — historical record.** This plan was implemented, then the
> design changed during live review. The **shipped** behaviour differs from the
> constants/shape below; trust the code + [CONTEXT.md](../../../CONTEXT.md) over
> this document. Key deltas:
> - `MEMBER_STACK_MAX_FACES = 5` (not 4); new `MEMBER_STACK_FACES_WITH_OVERFLOW = 4`.
> - `MEMBER_STACK_MIN_TOTAL = 2` (not 5) — stacks show on small communities.
> - `overflowCount()` replaced by `presentStack()`; the "+N" circle appears
>   **only when total > 5** (below that it's plain faces, no number).
> - Cards drop the standalone "N members" text when the stack renders, falling
>   back to it only below the threshold; faces carry a **name tooltip**; all
>   strings are localized (`communities.stack.*`).
> See ADR-0021 and the `member-stack` glossary term for the authoritative spec.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Luma-style stacked member-avatar component (overlapping circular avatars + "+N" overflow) to community cards and the community header, as social proof.

**Architecture:** A small pure module owns the policy (leadership-first ordering, `isPublic` face-filter, threshold gate, overflow math) and is fully unit-tested. A thin DB-glue layer fetches faces (windowed, no N+1 on the directory) and reuses that pure policy. A presentational `MemberStackView` renders the avatars; the directory card feeds it from the existing `list` query, and the header uses a self-fetching `MemberStack` connected to a new `getMemberStack` tRPC procedure. The stack is never more permissive than `communities.getMembers`, and the root Hub (`ait`) never renders one.

**Tech Stack:** Next.js App Router, tRPC v11, Drizzle ORM (Postgres), React + Radix Avatar, Vitest + @testing-library/react, next-intl.

**Design references:** [docs/adr/0021-profile-visibility-governs-member-stack-faces.md](../../adr/0021-profile-visibility-governs-member-stack-faces.md) and the `profile-visibility` / `member-stack` terms in [CONTEXT.md](../../../CONTEXT.md).

---

## Resolved policy (from grilling)

- **Faces:** public profiles only (`member_profile.isPublic = true`), **leadership-first** (`owner > admin > moderator > member`), tie-break earliest `joinedAt` (founders first), capped at 4.
- **Count:** mirrors the existing **active**-member total (includes private members); overflow `+N = total − shown faces`.
- **Threshold gate:** render the stack only at **≥ 5** active members and **≥ 1** showable face; otherwise render nothing (the card/header keep their existing plain member-count text).
- **Hub guard:** the root `ait` community never renders a stack.
- **Access:** never more permissive than `getMembers` — on an unlisted community a non-member gets no faces.

---

## File Structure

**Create:**
- `src/server/communities/member-stack.ts` — pure policy: constants, `selectStackFaces`, `shouldRenderStack`, `overflowCount`. No DB, no React.
- `src/server/communities/member-stack.test.ts` — unit tests for the pure policy.
- `src/server/communities/member-stack-queries.ts` — thin DB glue: `loadStackFacesForCommunities`, `loadMemberStack`.
- `src/components/communities/member-stack.tsx` — `MemberStackView` (presentational) + `MemberStack` (connected, client).
- `src/components/communities/member-stack.test.tsx` — component tests for `MemberStackView`.

**Modify:**
- `src/server/api/routers/communities.ts` — add faces to the `list` query output; add a `getMemberStack` procedure.
- `src/components/communities/community-card.tsx` — accept `faces` + render `MemberStackView`.
- `src/components/communities/communities-directory.tsx` — pass `faces` through to `CommunityCard`.
- `src/components/communities/community-header.tsx` — render `<MemberStack slug={…} />`.

---

### Task 1: Pure member-stack policy module

**Files:**
- Create: `src/server/communities/member-stack.ts`
- Test: `src/server/communities/member-stack.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/communities/member-stack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectStackFaces,
  shouldRenderStack,
  overflowCount,
  MEMBER_STACK_MAX_FACES,
  MEMBER_STACK_MIN_TOTAL,
  type StackCandidate,
} from "./member-stack";

function candidate(over: Partial<StackCandidate>): StackCandidate {
  return {
    userId: "u",
    role: "member",
    displayName: "Name",
    image: null,
    isPublic: true,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("selectStackFaces", () => {
  it("orders leadership-first, then earliest joined", () => {
    const faces = selectStackFaces([
      candidate({ userId: "m", role: "member", joinedAt: new Date("2026-01-01") }),
      candidate({ userId: "owner", role: "owner", joinedAt: new Date("2026-03-01") }),
      candidate({ userId: "mod", role: "moderator", joinedAt: new Date("2026-02-01") }),
      candidate({ userId: "admin-late", role: "admin", joinedAt: new Date("2026-04-01") }),
      candidate({ userId: "admin-early", role: "admin", joinedAt: new Date("2026-01-15") }),
    ]);
    expect(faces.map((f) => f.userId)).toEqual([
      "owner",
      "admin-early",
      "admin-late",
      "mod",
    ]);
  });

  it("excludes private profiles from faces", () => {
    const faces = selectStackFaces([
      candidate({ userId: "pub", isPublic: true }),
      candidate({ userId: "priv", role: "owner", isPublic: false }),
    ]);
    expect(faces.map((f) => f.userId)).toEqual(["pub"]);
  });

  it("caps at MEMBER_STACK_MAX_FACES", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ userId: `u${i}` }),
    );
    expect(selectStackFaces(many)).toHaveLength(MEMBER_STACK_MAX_FACES);
  });

  it("maps to bare face shape", () => {
    const [face] = selectStackFaces([
      candidate({ userId: "u1", displayName: "Ada", image: "x.png" }),
    ]);
    expect(face).toEqual({ userId: "u1", displayName: "Ada", image: "x.png" });
  });
});

describe("shouldRenderStack", () => {
  it("is false below the minimum total", () => {
    expect(shouldRenderStack(MEMBER_STACK_MIN_TOTAL - 1)).toBe(false);
  });
  it("is true at the minimum total", () => {
    expect(shouldRenderStack(MEMBER_STACK_MIN_TOTAL)).toBe(true);
  });
});

describe("overflowCount", () => {
  it("returns total minus shown faces", () => {
    expect(overflowCount(398, 4)).toBe(394);
  });
  it("never goes negative", () => {
    expect(overflowCount(3, 4)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/server/communities/member-stack.test.ts`
Expected: FAIL — `Cannot find module './member-stack'`.

- [ ] **Step 3: Write the implementation**

Create `src/server/communities/member-stack.ts`:

```ts
import { ROLE_HIERARCHY, type CommunityRole } from "./role-utils";

/** Max avatar faces shown in a stack (Luma-style: a few faces + overflow). */
export const MEMBER_STACK_MAX_FACES = 4;

/** Below this active-member total the stack is suppressed (a lonely stack
 *  advertises deadness — the card/header keep their plain count text). */
export const MEMBER_STACK_MIN_TOTAL = 5;

/** A member considered for a face slot. */
export interface StackCandidate {
  userId: string;
  role: CommunityRole;
  displayName: string | null;
  image: string | null;
  isPublic: boolean;
  joinedAt: Date;
}

/** The minimal data a rendered avatar needs. */
export interface StackFace {
  userId: string;
  displayName: string | null;
  image: string | null;
}

/** Leadership-first (higher role rank first), then earliest joined. */
export function compareStackCandidates(
  a: StackCandidate,
  b: StackCandidate,
): number {
  const byRole = ROLE_HIERARCHY[b.role] - ROLE_HIERARCHY[a.role];
  if (byRole !== 0) return byRole;
  return a.joinedAt.getTime() - b.joinedAt.getTime();
}

/** Public faces only, leadership-first, capped at `maxFaces`. Honours the
 *  profile-visibility opt-out: private members are never shown as faces
 *  (but remain in the count — see overflowCount). */
export function selectStackFaces(
  candidates: StackCandidate[],
  maxFaces = MEMBER_STACK_MAX_FACES,
): StackFace[] {
  return candidates
    .filter((c) => c.isPublic)
    .sort(compareStackCandidates)
    .slice(0, maxFaces)
    .map(({ userId, displayName, image }) => ({ userId, displayName, image }));
}

/** Whether a community has enough active members to show a stack at all. */
export function shouldRenderStack(totalActiveCount: number): boolean {
  return totalActiveCount >= MEMBER_STACK_MIN_TOTAL;
}

/** The "+N" overflow: everyone active beyond the shown faces, private members
 *  included (they are counted, never shown). Clamped at zero. */
export function overflowCount(
  totalActiveCount: number,
  shownFaces: number,
): number {
  return Math.max(0, totalActiveCount - shownFaces);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/server/communities/member-stack.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/member-stack.ts src/server/communities/member-stack.test.ts
git commit -m "feat(communities): pure member-stack policy (ordering, visibility, overflow)"
```

---

### Task 2: MemberStackView presentational component

**Files:**
- Create: `src/components/communities/member-stack.tsx` (this task adds `MemberStackView` only; `MemberStack` is added in Task 6)
- Test: `src/components/communities/member-stack.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/communities/member-stack.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberStackView } from "./member-stack";

const faces = [
  { userId: "a", displayName: "Ada Lovelace", image: null },
  { userId: "b", displayName: "Bob", image: null },
];

describe("MemberStackView", () => {
  it("renders nothing below the threshold total", () => {
    const { container } = render(<MemberStackView faces={faces} total={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no showable faces", () => {
    const { container } = render(<MemberStackView faces={[]} total={50} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an avatar per face and the overflow count", () => {
    render(<MemberStackView faces={faces} total={396} />);
    // Initials fallbacks render for image-less faces.
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    // total(396) - shownFaces(2) = 394
    expect(screen.getByText("+394")).toBeInTheDocument();
  });
});
```

> Three cases only. A "+0" (no-overflow) case is intentionally omitted: because the threshold (`MEMBER_STACK_MIN_TOTAL` = 5) always exceeds the face cap (`MEMBER_STACK_MAX_FACES` = 4), any stack that renders always has overflow ≥ 1, so the overflow bubble is always present when visible. There is no reachable "+0" state to test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/communities/member-stack.test.tsx`
Expected: FAIL — `MemberStackView` is not exported / module missing.

- [ ] **Step 3: Write the implementation**

Create `src/components/communities/member-stack.tsx`:

```tsx
"use client";

import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import {
  shouldRenderStack,
  overflowCount,
  type StackFace,
} from "@/server/communities/member-stack";

function initial(displayName: string | null): string {
  return (displayName ?? "?").trim()[0]?.toUpperCase() ?? "?";
}

export interface MemberStackViewProps {
  faces: StackFace[];
  /** Active-member total (includes private members). */
  total: number;
  className?: string;
}

/** Presentational stacked-avatar row. Renders nothing unless the community
 *  clears the threshold AND has at least one showable face. */
export function MemberStackView({ faces, total, className }: MemberStackViewProps) {
  if (!shouldRenderStack(total) || faces.length === 0) return null;

  const overflow = overflowCount(total, faces.length);

  return (
    <AvatarGroup
      className={className}
      aria-label={`${total} members`}
      data-slot="member-stack"
    >
      {faces.map((face) => (
        <Avatar key={face.userId} size="sm">
          {face.image ? (
            <AvatarImage src={face.image} alt={face.displayName ?? ""} />
          ) : null}
          <AvatarFallback className="text-[10px]">
            {initial(face.displayName)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 ? (
        <AvatarGroupCount className="text-[10px]">+{overflow}</AvatarGroupCount>
      ) : null}
    </AvatarGroup>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/components/communities/member-stack.test.tsx`
Expected: PASS (cases 1–3).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/member-stack.tsx src/components/communities/member-stack.test.tsx
git commit -m "feat(communities): MemberStackView presentational stacked-avatar component"
```

---

### Task 3: DB glue — face-fetching helpers

**Files:**
- Create: `src/server/communities/member-stack-queries.ts`

This layer follows the repo's "thin DB glue" pattern (see `discovery-queries.ts`): no unit test of its own; correctness is verified by typecheck + the integration wiring in later tasks. The tested policy lives in Task 1.

- [ ] **Step 1: Write the implementation**

Create `src/server/communities/member-stack-queries.ts`:

```ts
/** Thin DB glue for the member stack. Fetches public, active face candidates
 *  (leadership-first) without an N+1 across the directory, and the active
 *  total. Policy (ordering/visibility/overflow) lives in ./member-stack. */

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  communityMemberships,
  memberProfiles,
  user,
} from "@/server/db/schema";
import {
  selectStackFaces,
  MEMBER_STACK_MAX_FACES,
  type StackCandidate,
  type StackFace,
} from "@/server/communities/member-stack";
import type { CommunityRole } from "@/server/communities/role-utils";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

/** SQL leadership rank mirroring ROLE_HIERARCHY (higher = more senior). */
const roleRankSql = sql<number>`(case ${communityMemberships.role}
  when 'owner' then 4
  when 'admin' then 3
  when 'moderator' then 2
  else 1 end)`;

/** Top public+active face candidates per community, grouped by communityId.
 *  One query for the whole page (no N+1). Returns leadership-first faces. */
export async function loadStackFacesForCommunities(
  db: DB,
  communityIds: string[],
): Promise<Map<string, StackFace[]>> {
  const result = new Map<string, StackFace[]>();
  if (communityIds.length === 0) return result;

  // Rank public active members within each community; keep the top N.
  const ranked = db
    .select({
      communityId: communityMemberships.communityId,
      userId: communityMemberships.userId,
      role: communityMemberships.role,
      displayName: memberProfiles.displayName,
      image: user.image,
      isPublic: memberProfiles.isPublic,
      joinedAt: communityMemberships.joinedAt,
      rnk: sql<number>`row_number() over (
        partition by ${communityMemberships.communityId}
        order by ${roleRankSql} desc, ${communityMemberships.joinedAt} asc,
                 ${communityMemberships.userId} asc
      )`.as("rnk"),
    })
    .from(communityMemberships)
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .innerJoin(
      memberProfiles,
      eq(communityMemberships.userId, memberProfiles.userId),
    )
    .where(
      and(
        inArray(communityMemberships.communityId, communityIds),
        eq(communityMemberships.status, "active"),
        eq(memberProfiles.isPublic, true),
      ),
    )
    .as("ranked");

  const rows = await db
    .select({
      communityId: ranked.communityId,
      userId: ranked.userId,
      role: ranked.role,
      displayName: ranked.displayName,
      image: ranked.image,
      isPublic: ranked.isPublic,
      joinedAt: ranked.joinedAt,
    })
    .from(ranked)
    .where(sql`${ranked.rnk} <= ${MEMBER_STACK_MAX_FACES}`);

  // Group, then run the tested policy so ordering/visibility is single-sourced.
  const byCommunity = new Map<string, StackCandidate[]>();
  for (const r of rows) {
    const list = byCommunity.get(r.communityId) ?? [];
    list.push({
      userId: r.userId,
      role: r.role as CommunityRole,
      displayName: r.displayName,
      image: r.image,
      isPublic: r.isPublic,
      joinedAt: r.joinedAt,
    });
    byCommunity.set(r.communityId, list);
  }
  for (const [communityId, candidates] of byCommunity) {
    result.set(communityId, selectStackFaces(candidates));
  }
  return result;
}

/** Faces for a single community (header use). Total is fetched by the caller
 *  (the procedure already has the active count). */
export async function loadStackFaces(
  db: DB,
  communityId: string,
): Promise<StackFace[]> {
  const map = await loadStackFacesForCommunities(db, [communityId]);
  return map.get(communityId) ?? [];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add src/server/communities/member-stack-queries.ts
git commit -m "feat(communities): DB glue to fetch leadership-first stack faces (no N+1)"
```

---

### Task 4: Add `getMemberStack` procedure + faces on `list`

**Files:**
- Modify: `src/server/api/routers/communities.ts`

- [ ] **Step 1: Add imports**

At the top of `src/server/api/routers/communities.ts`, add the glue import and the Hub slug. Add to the existing import block (after the `loadPublicLiveness` import at line 30):

```ts
import {
  loadStackFaces,
  loadStackFacesForCommunities,
} from "@/server/communities/member-stack-queries";
import { HUB_SLUG } from "@/server/api/trpc";
```

- [ ] **Step 2: Attach faces to the `list` query output**

In the `list` procedure, after the `items` query and before computing `nextCursor` (currently around line 95), add a single faces fetch for the page and merge it in. Replace the `return { items, nextCursor };` block at the end of `list` with:

```ts
      let nextCursor: typeof input.cursor | undefined;
      if (items.length > input.limit) {
        const next = items.pop()!;
        nextCursor = { createdAt: next.createdAt.toISOString(), id: next.id };
      }

      // One extra query for the whole page (no N+1): leadership-first faces.
      const facesByCommunity = await loadStackFacesForCommunities(
        ctx.db,
        items.map((c) => c.id),
      );
      const itemsWithFaces = items.map((c) => ({
        ...c,
        faces: facesByCommunity.get(c.id) ?? [],
      }));

      return { items: itemsWithFaces, nextCursor };
```

> Note: the existing `nextCursor` block already exists below the `items` query — replace from that block through the final `return`. Do not duplicate the pop logic.

- [ ] **Step 3: Add the `getMemberStack` procedure**

Add a new procedure immediately after the `getMembers` procedure (after its closing `}),` around line 229):

```ts
  /** Stack faces + active total for a single community (header use). Never
   *  more permissive than getMembers; the root Hub never has a stack. */
  getMemberStack: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      // The Hub root is an anchor, not a tenant — no stack (ADR-0019).
      if (input.slug === HUB_SLUG) {
        return { faces: [], total: 0 };
      }

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Same access rule as getMembers: unlisted communities are members-only.
      if (!community.isListedInDirectory) {
        const userId = ctx.session?.user?.id;
        if (!userId) {
          return { faces: [], total: 0 };
        }
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.userId, userId),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (!membership) {
          return { faces: [], total: 0 };
        }
      }

      const [memberCountResult] = await ctx.db
        .select({ count: count() })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
          ),
        );

      const faces = await loadStackFaces(ctx.db, community.id);
      return { faces, total: memberCountResult?.count ?? 0 };
    }),
```

> Access note: for an unlisted community a non-member receives `{ faces: [], total: 0 }` (returning empty rather than throwing keeps the header render clean — `MemberStackView` shows nothing). The header's pre-existing plain member-count text comes from `getBySlug` and is out of scope for this change.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (Confirms the `list` output type now carries `faces` and `getMemberStack` is well-typed.)

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no existing tests broken by the router changes.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(communities): getMemberStack procedure + faces on directory list"
```

---

### Task 5: Render the stack on community cards

**Files:**
- Modify: `src/components/communities/community-card.tsx`
- Modify: `src/components/communities/communities-directory.tsx`

- [ ] **Step 1: Extend `CommunityCard` to accept and render faces**

In `src/components/communities/community-card.tsx`:

Add the imports at the top:

```tsx
import { MemberStackView } from "./member-stack";
import type { StackFace } from "@/server/communities/member-stack";
```

Add `faces` to `CommunityCardProps`:

```tsx
interface CommunityCardProps {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  joinPolicy: string;
  faces: StackFace[];
}
```

Add `faces` to the destructured props:

```tsx
export function CommunityCard({
  slug,
  name,
  description,
  logoUrl,
  memberCount,
  joinPolicy,
  faces,
}: CommunityCardProps) {
```

Replace the member-count `<span>` (currently lines 68-70) with the count text plus the stack:

```tsx
        <div className="mt-1 flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {memberCount} {t("profile.members").toLowerCase()}
          </span>
          <MemberStackView faces={faces} total={memberCount} />
        </div>
```

- [ ] **Step 2: Pass `faces` from the directory**

In `src/components/communities/communities-directory.tsx`, in the `communities.map(...)` block (around lines 87-97), add the `faces` prop:

```tsx
            <CommunityCard
              key={community.id}
              slug={community.slug}
              name={community.name}
              description={community.description}
              logoUrl={community.logoUrl}
              memberCount={community.memberCount}
              joinPolicy={community.joinPolicy}
              faces={community.faces}
            />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `community.faces` is now part of the `list` output type from Task 4.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: PASS (no unused imports / a11y warnings on the changed files).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/community-card.tsx src/components/communities/communities-directory.tsx
git commit -m "feat(communities): show member stack on directory cards"
```

---

### Task 6: Render the stack on the community header

**Files:**
- Modify: `src/components/communities/member-stack.tsx` (add the connected `MemberStack`)
- Modify: `src/components/communities/community-header.tsx`

- [ ] **Step 1: Add the connected `MemberStack` component**

Append to `src/components/communities/member-stack.tsx`:

```tsx
import { api } from "@/trpc/react";

export interface MemberStackProps {
  slug: string;
  className?: string;
}

/** Self-fetching member stack for the community header. Renders nothing while
 *  loading or when policy/access hides it. */
export function MemberStack({ slug, className }: MemberStackProps) {
  const { data } = api.communities.getMemberStack.useQuery({ slug });
  if (!data) return null;
  return (
    <MemberStackView faces={data.faces} total={data.total} className={className} />
  );
}
```

> The `import { api }` line may sit at the top of the file with the other imports instead of mid-file; place all imports at the top to satisfy lint. Move it up next to the avatar imports.

- [ ] **Step 2: Render it in the header**

In `src/components/communities/community-header.tsx`:

Add the import at the top:

```tsx
import { MemberStack } from "./member-stack";
```

Insert the stack just below the member-count row (after the closing `</div>` of the `flex items-center gap-1.5` block at line 56). Replace lines 51-57:

```tsx
              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Users className="size-4" />
                <span>
                  {community.memberCount} {t("members")}
                </span>
              </div>

              <MemberStack slug={community.slug} className="mt-1" />
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Re-run the component tests (ensure no regression)**

Run: `pnpm test src/components/communities/member-stack.test.tsx`
Expected: PASS — `MemberStackView` tests still green; `MemberStack` is exercised manually in Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/member-stack.tsx src/components/communities/community-header.tsx
git commit -m "feat(communities): show member stack on community header"
```

---

### Task 7: Manual verification & final checks

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 2: Start the app and verify visually**

Run: `pnpm dev:db` then `pnpm dev` (per the repo's Docker local-dev setup).

Verify in the browser:
- `/communities` — cards for communities with **≥ 5 active members** show overlapping avatars + a "+N" bubble; smaller communities show only the plain "N members" text (no avatars).
- A community whose senior members are **private** (`isPublic = false`) shows their juniors' faces but the private seniors are folded into the "+N" (never shown as a face), and the total still counts them.
- A community **header** (`/communities/<slug>`) shows the same stack below the member count.
- Visiting the Hub root header (`/communities/ait`, if reachable) shows **no** stack.
- As a logged-out user, an **unlisted** community header shows no faces.

- [ ] **Step 3: Confirm no N+1 on the directory**

With the dev DB query log on (or via the network tab), confirm loading `/communities` issues a constant number of queries regardless of how many cards render (the list query + one `loadStackFacesForCommunities` query), not one per card.

- [ ] **Step 4: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(communities): member-stack verification tweaks"
```

---

## Self-Review notes

- **Spec coverage:** faces/visibility (Task 1 + 3 + 4), leadership ordering (Task 1 `compareStackCandidates` + Task 3 SQL rank), count mirrors active total (Task 4 reuses the existing active count), threshold gate (Task 1 `shouldRenderStack` + Task 2), Hub guard (Task 4 `HUB_SLUG` early return; directory excludes `ait` already), access never-more-permissive (Task 4 mirrors `getMembers` gate), no N+1 (Task 4 single `loadStackFacesForCommunities`). All covered.
- **Naming consistency:** `selectStackFaces`, `shouldRenderStack`, `overflowCount`, `compareStackCandidates`, `StackCandidate`, `StackFace`, `loadStackFacesForCommunities`, `loadStackFaces`, `MemberStackView`, `MemberStack`, `getMemberStack`, `MEMBER_STACK_MAX_FACES`, `MEMBER_STACK_MIN_TOTAL` — used identically across all tasks.
- **Known boundary:** the header's plain "N members" text (from `getBySlug`) is pre-existing and unchanged; this plan only governs the *stack*. The ADR's "no count for unlisted non-members" refers to the stack's overflow bubble, which won't render.
- **Tunables:** `MEMBER_STACK_MAX_FACES` (4) and `MEMBER_STACK_MIN_TOTAL` (5) are single-sourced in `member-stack.ts`.
