# Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AIT Community platform into a multi-tenant hub where external AI communities can create online presences and onboard their members.

**Architecture:** Hybrid approach — community infrastructure (tables, memberships, roles) in Drizzle's `app` schema; content scoping via `communityId` text fields in Payload CMS collections bridging to Drizzle. Existing `community` tRPC router renamed to `forum`; new `communities` router for all multi-tenancy logic.

**Tech Stack:** Next.js 15, Drizzle ORM (PostgreSQL), Payload CMS 3, better-auth, tRPC 11, next-intl, Tailwind CSS, Radix UI, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-multi-tenancy-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/server/db/communities-schema.ts` | Drizzle schema: `communities`, `communityMemberships`, `communityInvites` tables + relations |
| `src/server/api/routers/communities.ts` | tRPC router: all community CRUD, membership, invite procedures |
| `src/server/communities/role-utils.ts` | Role hierarchy helpers: `canManageRole`, `ROLE_HIERARCHY` |
| `src/server/communities/role-utils.test.ts` | Tests for role hierarchy logic |
| `src/server/communities/slug-utils.ts` | Slug generation/validation helper |
| `src/server/communities/slug-utils.test.ts` | Tests for slug utils |
| `src/components/communities/communities-directory.tsx` | Directory page client component with search |
| `src/components/communities/community-card.tsx` | Card component for directory listing |
| `src/components/communities/community-header.tsx` | Community profile page header (name, logo, description, join button) |
| `src/components/communities/community-nav.tsx` | Sub-navigation tabs for community pages |
| `src/components/communities/join-button.tsx` | Join/request/pending button with policy logic |
| `src/components/communities/member-list.tsx` | Community member list with role badges |
| `src/components/communities/manage/settings-form.tsx` | Community settings form (admin panel) |
| `src/components/communities/manage/members-table.tsx` | Member management table (admin panel) |
| `src/components/communities/manage/invite-section.tsx` | Invite link generation/management |
| `src/components/communities/community-select-field.tsx` | Payload admin custom field: community dropdown (deferred — see Deferred Work) |
| `src/app/[locale]/explore/page.tsx` | Explore hub page (links to challenges, launchpad, jobs, benchmark) |
| `src/app/[locale]/communities/page.tsx` | Directory page |
| `src/app/[locale]/communities/[slug]/page.tsx` | Community overview page |
| `src/app/[locale]/communities/[slug]/layout.tsx` | Community layout with sub-nav |
| `src/app/[locale]/communities/[slug]/events/page.tsx` | Community events |
| `src/app/[locale]/communities/[slug]/forum/page.tsx` | Community forum |
| `src/app/[locale]/communities/[slug]/ideas/page.tsx` | Community ideas |
| `src/app/[locale]/communities/[slug]/members/page.tsx` | Community members |
| `src/app/[locale]/communities/[slug]/challenges/page.tsx` | Community challenges |
| `src/app/[locale]/communities/[slug]/launchpad/page.tsx` | Community launchpad |
| `src/app/[locale]/communities/[slug]/jobs/page.tsx` | Community jobs |
| `src/app/[locale]/dashboard/communities/page.tsx` | Dashboard: my communities |
| `src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx` | Dashboard: community admin |
| `src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx` | Dashboard: member management |
| `src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx` | Dashboard: community settings |
| `src/app/[locale]/join/[code]/page.tsx` | Invite link handler page |
| `drizzle/migrations/XXXX_add_communities.sql` | Generated migration (via `drizzle-kit generate`) |

### Modified files
| File | Changes |
|------|---------|
| `src/server/db/schema.ts` | Import and re-export from `communities-schema.ts`; add `communityId` column to `activityEvents`, `notifications`, `challengeChannels`, `benchmarkQuestions` |
| `src/server/api/root.ts` | Rename `community` → `forum`, add `communities` router |
| `src/server/api/routers/community.ts` | Rename file to `forum.ts`, update export name |
| `src/server/api/trpc.ts` | Add `communityProcedure` middleware |
| `src/server/agent/activity.ts` | Add optional `communityId` to `logActivity` params |
| `src/collections/Events.ts` | Add `communityId` text field |
| `src/collections/ForumThreads.ts` | Add `communityId` text field |
| `src/collections/ForumReplies.ts` | Add `communityId` text field |
| `src/collections/CommunityIdeas.ts` | Add `communityId` text field |
| `src/collections/Comments.ts` | Add `communityId` text field |
| `src/collections/Jobs.ts` | Add `communityId` text field |
| `src/collections/LaunchpadProjects.ts` | Add `communityId` text field |
| `src/collections/Challenges.ts` | Add `communityId` text field |
| `src/collections/IdeaVotes.ts` | Add `communityId` text field |
| `src/components/navbar.tsx` | Reorganize navLinks to new structure |
| `src/components/community/modals/ideas-modal.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/community/modals/rules-modal.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/community/modals/threads-modal.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/community/thread-replies.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/community/thread-reply-form.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/forum/forum-page.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/forum/thread-detail.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/forum/create-thread-form.tsx` | `api.community.*` → `api.forum.*` |
| `src/components/forum/reply-form.tsx` | `api.community.*` → `api.forum.*` |
| `src/middleware.ts` | Add redirect from `/community/*` to `/communities/ait/forum/*` |
| `src/components/dashboard-tabs.tsx` | Add My Communities tab to dashboard sidebar |
| `messages/en.json` | Add `communities` namespace keys, dashboard communities tab key |
| `messages/nl.json` | Add `communities` namespace keys, dashboard communities tab key |

---

## Task 1: Drizzle Schema — Community Tables

**Files:**
- Create: `src/server/db/communities-schema.ts`
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Create communities-schema.ts with the three new tables**

```typescript
// src/server/db/communities-schema.ts
import { relations, sql } from "drizzle-orm";
import { index, uniqueIndex } from "drizzle-orm/pg-core";
import { appSchema, user } from "./schema";

// ── Communities ─────────────────────────────────────────────
export const communities = appSchema.table(
  "community",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: d.text().notNull().unique(),
    slug: d.text().notNull().unique(),
    description: d.text(),
    logoUrl: d.text(),
    joinPolicy: d
      .varchar({ length: 30 })
      .notNull()
      .default("open")
      .$type<"open" | "invite_only" | "approval_required">(),
    isListedInDirectory: d.boolean().notNull().default(false),
    createdBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    deletedAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("community_slug_idx").on(t.slug),
    index("community_listed_idx").on(t.isListedInDirectory),
  ],
);

// ── Memberships ─────────────────────────────────────────────
export const communityMemberships = appSchema.table(
  "community_membership",
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
    role: d
      .varchar({ length: 20 })
      .notNull()
      .default("member")
      .$type<"owner" | "admin" | "moderator" | "member">(),
    status: d
      .varchar({ length: 30 })
      .notNull()
      .default("active")
      .$type<"active" | "pending_approval" | "invited" | "banned">(),
    joinedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
    invitedBy: d.varchar({ length: 255 }).references(() => user.id),
  }),
  (t) => [
    uniqueIndex("membership_community_user_uidx").on(
      t.communityId,
      t.userId,
    ),
    index("membership_user_idx").on(t.userId),
    index("membership_community_status_idx").on(t.communityId, t.status),
    index("membership_community_role_idx").on(t.communityId, t.role),
  ],
);

// ── Invites ─────────────────────────────────────────────────
export const communityInvites = appSchema.table(
  "community_invite",
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
    code: d.text().notNull().unique(),
    createdBy: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    maxUses: d.integer(),
    useCount: d.integer().notNull().default(0),
    expiresAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("invite_community_idx").on(t.communityId),
    uniqueIndex("invite_code_uidx").on(t.code),
  ],
);

// ── Relations ───────────────────────────────────────────────
export const communityRelations = relations(communities, ({ many, one }) => ({
  memberships: many(communityMemberships),
  invites: many(communityInvites),
  creator: one(user, {
    fields: [communities.createdBy],
    references: [user.id],
  }),
}));

export const communityMembershipRelations = relations(
  communityMemberships,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityMemberships.communityId],
      references: [communities.id],
    }),
    user: one(user, {
      fields: [communityMemberships.userId],
      references: [user.id],
      relationName: "membershipUser",
    }),
    inviter: one(user, {
      fields: [communityMemberships.invitedBy],
      references: [user.id],
      relationName: "membershipInviter",
    }),
  }),
);

export const communityInviteRelations = relations(
  communityInvites,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityInvites.communityId],
      references: [communities.id],
    }),
  }),
);
```

- [ ] **Step 2: Re-export from schema.ts**

In `src/server/db/schema.ts`, add at the end of the file:

```typescript
// ── Communities (multi-tenancy) ─────────────────────────────
export {
  communities,
  communityMemberships,
  communityInvites,
  communityRelations,
  communityMembershipRelations,
  communityInviteRelations,
} from "./communities-schema";
```

- [ ] **Step 3: Add communityId column to activityEvents table**

In `src/server/db/schema.ts`, add to the `activityEvents` table definition (after `recipientId` field, around line 572):

```typescript
    communityId: d.varchar("community_id", { length: 255 }),
```

- [ ] **Step 4: Add communityId column to notifications table**

In `src/server/db/schema.ts`, add to the `notifications` table definition (after `readAt` field, around line 399):

```typescript
    communityId: d.varchar("community_id", { length: 255 }),
```

- [ ] **Step 5: Add communityId column to challengeChannels table**

In `src/server/db/schema.ts`, add to the `challengeChannels` table definition (after `challengeId` field, around line 763):

```typescript
    communityId: d.varchar("community_id", { length: 255 }),
```

- [ ] **Step 6: Add communityId column to benchmarkQuestions table**

In `src/server/db/schema.ts`, add to the `benchmarkQuestions` table definition (after `updatedAt` field, around line 1057):

```typescript
    communityId: d.varchar("community_id", { length: 255 }),
```

- [ ] **Step 7: Run tsc --noEmit to verify types**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 8: Generate Drizzle migration**

Run: `npx drizzle-kit generate`
Expected: Migration file created in `drizzle/` directory

- [ ] **Step 9: Commit**

```bash
git add src/server/db/communities-schema.ts src/server/db/schema.ts drizzle/
git commit -m "feat(multi-tenancy): add communities, memberships, invites Drizzle schema

Add three new tables: communities, community_memberships, community_invites.
Add nullable communityId columns to activityEvents, notifications,
challengeChannels, and benchmarkQuestions for future scoping."
```

---

## Task 2: Role Hierarchy Utilities

**Files:**
- Create: `src/server/communities/role-utils.ts`
- Create: `src/server/communities/role-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/server/communities/role-utils.test.ts
import { describe, it, expect } from "vitest";
import { canManageRole, ROLE_HIERARCHY, type CommunityRole } from "./role-utils";

describe("ROLE_HIERARCHY", () => {
  it("ranks owner highest", () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.moderator);
    expect(ROLE_HIERARCHY.moderator).toBeGreaterThan(ROLE_HIERARCHY.member);
  });
});

describe("canManageRole", () => {
  it("owner can manage admin", () => {
    expect(canManageRole("owner", "admin")).toBe(true);
  });

  it("owner can manage moderator", () => {
    expect(canManageRole("owner", "moderator")).toBe(true);
  });

  it("owner can manage member", () => {
    expect(canManageRole("owner", "member")).toBe(true);
  });

  it("admin can manage moderator", () => {
    expect(canManageRole("admin", "moderator")).toBe(true);
  });

  it("admin can manage member", () => {
    expect(canManageRole("admin", "member")).toBe(true);
  });

  it("admin cannot manage admin", () => {
    expect(canManageRole("admin", "admin")).toBe(false);
  });

  it("admin cannot manage owner", () => {
    expect(canManageRole("admin", "owner")).toBe(false);
  });

  it("moderator can manage member", () => {
    expect(canManageRole("moderator", "member")).toBe(true);
  });

  it("moderator cannot manage moderator", () => {
    expect(canManageRole("moderator", "moderator")).toBe(false);
  });

  it("member cannot manage anyone", () => {
    expect(canManageRole("member", "member")).toBe(false);
  });

  it("owner cannot manage owner", () => {
    expect(canManageRole("owner", "owner")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/communities/role-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/communities/role-utils.ts
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

export const ROLE_HIERARCHY: Record<CommunityRole, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
} as const;

/**
 * Returns true if `actorRole` can manage (promote/demote/ban/remove) a user with `targetRole`.
 * Rule: you can only manage roles strictly below yours.
 */
export function canManageRole(
  actorRole: CommunityRole,
  targetRole: CommunityRole,
): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/communities/role-utils.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/role-utils.ts src/server/communities/role-utils.test.ts
git commit -m "feat(multi-tenancy): add community role hierarchy utilities

Defines ROLE_HIERARCHY and canManageRole helper for enforcing
owner > admin > moderator > member permission checks."
```

---

## Task 3: Slug Utilities

**Files:**
- Create: `src/server/communities/slug-utils.ts`
- Create: `src/server/communities/slug-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/server/communities/slug-utils.test.ts
import { describe, it, expect } from "vitest";
import { generateSlug } from "./slug-utils";

describe("generateSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(generateSlug("PyTorch Amsterdam")).toBe("pytorch-amsterdam");
  });

  it("strips special characters", () => {
    expect(generateSlug("AI & ML Community!")).toBe("ai-ml-community");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("hello---world")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("--hello--")).toBe("hello");
  });

  it("handles unicode", () => {
    expect(generateSlug("café AI")).toBe("cafe-ai");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/communities/slug-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/communities/slug-utils.ts

/**
 * Generates a URL-friendly slug from a community name.
 */
export function generateSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/communities/slug-utils.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/slug-utils.ts src/server/communities/slug-utils.test.ts
git commit -m "feat(multi-tenancy): add slug generation utility for community URLs"
```

---

## Task 4: Rename community Router to forum

**Files:**
- Rename: `src/server/api/routers/community.ts` → `src/server/api/routers/forum.ts`
- Modify: `src/server/api/root.ts`
- Modify: 9 frontend files that use `api.community.*`

- [ ] **Step 1: Rename the router file and update export**

Rename `src/server/api/routers/community.ts` to `src/server/api/routers/forum.ts`.

In the renamed file, update the export name:
```typescript
// Change:
export const communityRouter = createTRPCRouter({
// To:
export const forumRouter = createTRPCRouter({
```

- [ ] **Step 2: Update root.ts**

In `src/server/api/root.ts`:
```typescript
// Change import:
import { communityRouter } from "@/server/api/routers/community";
// To:
import { forumRouter } from "@/server/api/routers/forum";

// Change registration:
community: communityRouter,
// To:
forum: forumRouter,
```

- [ ] **Step 3: Update all frontend call sites**

In each of these 9 files, find-and-replace `api.community.` with `api.forum.`:

1. `src/components/community/modals/ideas-modal.tsx`
2. `src/components/community/modals/rules-modal.tsx`
3. `src/components/community/modals/threads-modal.tsx`
4. `src/components/community/thread-replies.tsx`
5. `src/components/community/thread-reply-form.tsx`
6. `src/components/forum/forum-page.tsx`
7. `src/components/forum/thread-detail.tsx`
8. `src/components/forum/create-thread-form.tsx`
9. `src/components/forum/reply-form.tsx`

- [ ] **Step 4: Run tsc --noEmit to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors. If any additional files reference `api.community`, fix them.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/forum.ts src/server/api/root.ts src/components/community/ src/components/forum/
git rm src/server/api/routers/community.ts
git commit -m "refactor: rename community tRPC router to forum

Renames community.ts → forum.ts and updates all 9 frontend call sites
from api.community.* to api.forum.* to free the 'community' namespace
for the new multi-tenancy communities router."
```

---

## Task 5: communityProcedure Middleware

**Files:**
- Modify: `src/server/api/trpc.ts`

- [ ] **Step 1: Add the communityProcedure middleware**

At the end of `src/server/api/trpc.ts`, before the closing, add:

```typescript
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { communities, communityMemberships } from "@/server/db/schema";
import type { CommunityRole } from "@/server/communities/role-utils";

/**
 * Community-aware procedure middleware.
 *
 * Resolves a community by `slug` from input, looks up the caller's membership,
 * and injects `{ community, membership, role }` into context.
 *
 * For procedures that require membership, set `requireMembership: true`.
 */
const communityAuth = t.middleware(async ({ ctx, next, rawInput }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const parsed = z.object({ slug: z.string() }).safeParse(rawInput);
  if (!parsed.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Missing or invalid community slug" });
  }
  const input = parsed.data;

  const community = await ctx.db.query.communities.findFirst({
    where: and(
      eq(communities.slug, input.slug),
      isNull(communities.deletedAt),
    ),
  });

  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
  }

  const membership = await ctx.db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, ctx.session.user.id),
    ),
  });

  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
      community,
      membership: membership ?? null,
      communityRole: (membership?.status === "active" ? membership.role : null) as CommunityRole | null,
    },
  });
});

export const communityProcedure = t.procedure
  .use(timingMiddleware)
  .use(communityAuth);

/**
 * Community procedure that requires active membership.
 * Use for procedures where non-members should be rejected outright.
 */
const requireMembership = t.middleware(async ({ ctx, next }) => {
  if (!ctx.communityRole) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Membership required" });
  }
  return next({
    ctx: { ...ctx, communityRole: ctx.communityRole },
  });
});

export const communityMemberProcedure = communityProcedure.use(requireMembership);
```

- [ ] **Step 2: Run tsc --noEmit to verify types**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/trpc.ts
git commit -m "feat(multi-tenancy): add communityProcedure tRPC middleware

Resolves community by slug, looks up membership, and injects
community context into tRPC context for downstream procedures."
```

---

## Task 6: Communities tRPC Router — Public & Protected Procedures

**Files:**
- Create: `src/server/api/routers/communities.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the communities router with public procedures**

```typescript
// src/server/api/routers/communities.ts
import { z } from "zod";
import { and, eq, gt, isNull, ilike, sql, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  communityProcedure,
} from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityInvites,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { generateSlug } from "@/server/communities/slug-utils";
import { canManageRole, type CommunityRole } from "@/server/communities/role-utils";
import { logActivity } from "@/server/agent/activity";

/** Escape SQL LIKE/ILIKE pattern characters */
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export const communitiesRouter = createTRPCRouter({
  /** Browse listed communities */
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({ createdAt: z.string().datetime(), id: z.string() })
          .nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Subquery: active member count per community (avoids hardcoded schema name)
      const memberCountSq = ctx.db
        .select({
          communityId: communityMemberships.communityId,
          count: count().as("member_count"),
        })
        .from(communityMemberships)
        .where(eq(communityMemberships.status, "active"))
        .groupBy(communityMemberships.communityId)
        .as("mc");

      const conditions = [
        eq(communities.isListedInDirectory, true),
        isNull(communities.deletedAt),
      ];

      if (input.search) {
        conditions.push(ilike(communities.name, `%${escapeLike(input.search)}%`));
      }

      // Keyset pagination: (createdAt, id) descending
      if (input.cursor) {
        conditions.push(
          sql`(${communities.createdAt}, ${communities.id}) < (${input.cursor.createdAt}, ${input.cursor.id})`,
        );
      }

      const items = await ctx.db
        .select({
          id: communities.id,
          name: communities.name,
          slug: communities.slug,
          description: communities.description,
          logoUrl: communities.logoUrl,
          joinPolicy: communities.joinPolicy,
          memberCount: sql<number>`coalesce(${memberCountSq.count}, 0)`,
          createdAt: communities.createdAt,
        })
        .from(communities)
        .leftJoin(memberCountSq, eq(communities.id, memberCountSq.communityId))
        .where(and(...conditions))
        .orderBy(desc(communities.createdAt), desc(communities.id))
        .limit(input.limit + 1);

      let nextCursor: typeof input.cursor | undefined;
      if (items.length > input.limit) {
        const next = items.pop()!;
        nextCursor = { createdAt: next.createdAt.toISOString(), id: next.id };
      }

      return { items, nextCursor };
    }),

  /** Get community by slug (public profile) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
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

      return {
        ...community,
        memberCount: memberCountResult?.count ?? 0,
      };
    }),

  /** Public member list */
  getMembers: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({ joinedAt: z.string().datetime(), userId: z.string() })
          .nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Unlisted communities: only members can view the member list
      if (!community.isListedInDirectory) {
        const userId = ctx.session?.user?.id;
        if (!userId) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const membership = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.userId, userId),
            eq(communityMemberships.status, "active"),
          ),
        });
        if (!membership) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
      }

      const conditions = [
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.status, "active"),
      ];

      // Keyset pagination: (joinedAt, userId) descending
      if (input.cursor) {
        conditions.push(
          sql`(${communityMemberships.joinedAt}, ${communityMemberships.userId}) < (${input.cursor.joinedAt}, ${input.cursor.userId})`,
        );
      }

      const items = await ctx.db
        .select({
          userId: communityMemberships.userId,
          role: communityMemberships.role,
          joinedAt: communityMemberships.joinedAt,
          displayName: memberProfiles.displayName,
          bio: memberProfiles.bio,
          image: user.image,
        })
        .from(communityMemberships)
        .innerJoin(user, eq(communityMemberships.userId, user.id))
        .leftJoin(
          memberProfiles,
          eq(communityMemberships.userId, memberProfiles.userId),
        )
        .where(and(...conditions))
        .orderBy(desc(communityMemberships.joinedAt), desc(communityMemberships.userId))
        .limit(input.limit + 1);

      let nextCursor: typeof input.cursor | undefined;
      if (items.length > input.limit) {
        const next = items.pop()!;
        nextCursor = { joinedAt: next.joinedAt.toISOString(), userId: next.userId };
      }

      return { items, nextCursor };
    }),

  /** Create a new community */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
        joinPolicy: z
          .enum(["open", "invite_only", "approval_required"])
          .default("open"),
        isListedInDirectory: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = generateSlug(input.name);

      // Check slug uniqueness
      const existing = await ctx.db.query.communities.findFirst({
        where: eq(communities.slug, slug),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A community with a similar name already exists",
        });
      }

      const [community] = await ctx.db
        .insert(communities)
        .values({
          name: input.name,
          slug,
          description: input.description,
          joinPolicy: input.joinPolicy,
          isListedInDirectory: input.isListedInDirectory,
          createdBy: ctx.session.user.id,
        })
        .returning();

      // Creator becomes owner
      await ctx.db.insert(communityMemberships).values({
        communityId: community!.id,
        userId: ctx.session.user.id,
        role: "owner",
        status: "active",
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.created",
        targetType: "community",
        targetId: community!.id,
        metadata: { name: input.name, slug },
      });

      return community!;
    }),

  /** Join an open community */
  join: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (community.joinPolicy !== "open") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This community is not open for direct joining",
        });
      }

      // Check existing membership
      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this community" });
        }
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
        }
        // Existing invited/pending_approval → activate instead of duplicate insert
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: community.id,
          userId: ctx.session.user.id,
          role: "member",
          status: "active",
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.joined",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  /** Request to join an approval-required community */
  requestToJoin: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (community.joinPolicy !== "approval_required") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This community does not require approval to join",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this community" });
        }
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
        }
        if (existing.status === "pending_approval") {
          throw new TRPCError({ code: "CONFLICT", message: "Request already pending" });
        }
      }

      await ctx.db.insert(communityMemberships).values({
        communityId: community.id,
        userId: ctx.session.user.id,
        role: "member",
        status: "pending_approval",
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.join_requested",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  /** Accept an invite by code */
  acceptInvite: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.query.communityInvites.findFirst({
        where: eq(communityInvites.code, input.code),
        with: { community: true },
      });

      if (!invite || invite.community.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
      }

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }

      // Atomic: increment useCount only if under maxUses (prevents race condition)
      if (invite.maxUses !== null) {
        const [updated] = await ctx.db
          .update(communityInvites)
          .set({ useCount: sql`${communityInvites.useCount} + 1` })
          .where(
            and(
              eq(communityInvites.id, invite.id),
              sql`${communityInvites.useCount} < ${invite.maxUses}`,
            ),
          )
          .returning();

        if (!updated) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has reached max uses" });
        }
      } else {
        // No max — just increment
        await ctx.db
          .update(communityInvites)
          .set({ useCount: sql`${communityInvites.useCount} + 1` })
          .where(eq(communityInvites.id, invite.id));
      }

      // Check existing membership
      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, invite.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
        ),
      });

      if (existing?.status === "banned") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are banned from this community" });
      }

      if (existing?.status === "active") {
        return { success: true, communitySlug: invite.community.slug };
      }

      if (existing) {
        // Update pending/invited to active
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: invite.communityId,
          userId: ctx.session.user.id,
          role: "member",
          status: "active",
          invitedBy: invite.createdBy,
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.joined",
        targetType: "community",
        targetId: invite.communityId,
        metadata: { via: "invite" },
      });

      return { success: true, communitySlug: invite.community.slug };
    }),

  /** Leave a community */
  leave: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not a member" });
      }

      // Prevent last owner from leaving
      if (membership.role === "owner") {
        const [ownerCount] = await ctx.db
          .select({ count: count() })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.role, "owner"),
              eq(communityMemberships.status, "active"),
            ),
          );

        if ((ownerCount?.count ?? 0) <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot leave — you are the last owner. Transfer ownership first.",
          });
        }
      }

      await ctx.db
        .delete(communityMemberships)
        .where(eq(communityMemberships.id, membership.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.left",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  /** List communities the user belongs to */
  getMyCommunities: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        communityId: communityMemberships.communityId,
        role: communityMemberships.role,
        status: communityMemberships.status,
        joinedAt: communityMemberships.joinedAt,
        name: communities.name,
        slug: communities.slug,
        description: communities.description,
        logoUrl: communities.logoUrl,
      })
      .from(communityMemberships)
      .innerJoin(
        communities,
        and(
          eq(communityMemberships.communityId, communities.id),
          isNull(communities.deletedAt),
        ),
      )
      .where(eq(communityMemberships.userId, ctx.session.user.id))
      .orderBy(desc(communityMemberships.joinedAt));

    return memberships;
  }),
});
```

- [ ] **Step 2: Register in root.ts**

In `src/server/api/root.ts`:
```typescript
// Add import:
import { communitiesRouter } from "@/server/api/routers/communities";

// Add to createTRPCRouter:
communities: communitiesRouter,
```

- [ ] **Step 3: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/communities.ts src/server/api/root.ts
git commit -m "feat(multi-tenancy): add communities tRPC router — public & protected procedures

Implements: list, getBySlug, getMembers, create, join, requestToJoin,
acceptInvite, leave, getMyCommunities procedures."
```

---

## Task 7: Communities tRPC Router — Admin Procedures

**Files:**
- Modify: `src/server/api/routers/communities.ts`

- [ ] **Step 1: Add admin procedures to the communities router**

Add these procedures to the `communitiesRouter` in `src/server/api/routers/communities.ts`:

```typescript
  /** Update community settings (admin+) */
  updateSettings: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).optional(),
        logoUrl: z.string().url().optional().nullable(),
        joinPolicy: z.enum(["open", "invite_only", "approval_required"]).optional(),
        isListedInDirectory: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Only owner/admin can change settings
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
      if (input.joinPolicy !== undefined) updates.joinPolicy = input.joinPolicy;
      if (input.isListedInDirectory !== undefined) updates.isListedInDirectory = input.isListedInDirectory;

      // Note: slug is NOT auto-updated on name change to avoid breaking
      // existing URLs and bookmarks. Slug is set once at community creation.

      const [updated] = await ctx.db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, ctx.community.id))
        .returning();

      return updated!;
    }),

  /** Approve a pending membership request */
  approveRequest: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [updated] = await ctx.db
        .update(communityMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.userId, input.userId),
            eq(communityMemberships.status, "pending_approval"),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending request found" });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.member_approved",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Reject a pending membership request */
  rejectRequest: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const deleted = await ctx.db
        .delete(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.userId, input.userId),
            eq(communityMemberships.status, "pending_approval"),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending request found" });
      }

      return { success: true };
    }),

  /** Change a member's role */
  setMemberRole: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "moderator", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Check hierarchy: actor must outrank target's current AND new role
      if (
        !canManageRole(ctx.communityRole, target.role as CommunityRole) ||
        !canManageRole(ctx.communityRole, input.role)
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      await ctx.db
        .update(communityMemberships)
        .set({ role: input.role })
        .where(eq(communityMemberships.id, target.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.role_changed",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
        metadata: { from: target.role, to: input.role },
      });

      return { success: true };
    }),

  /** Transfer ownership to another active member (owner only) */
  transferOwnership: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can transfer ownership" });
      }

      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot transfer to yourself" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user is not an active member" });
      }

      // Promote target to owner, demote self to admin (atomic via transaction)
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(communityMemberships)
          .set({ role: "owner" })
          .where(eq(communityMemberships.id, target.id));

        await tx
          .update(communityMemberships)
          .set({ role: "admin" })
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.userId, ctx.session.user.id),
            ),
          );
      });

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.ownership_transferred",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Ban a member */
  banMember: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!canManageRole(ctx.communityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db
        .update(communityMemberships)
        .set({ status: "banned" })
        .where(eq(communityMemberships.id, target.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.member_banned",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Remove a member */
  removeMember: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!canManageRole(ctx.communityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db
        .delete(communityMemberships)
        .where(eq(communityMemberships.id, target.id));

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.member_removed",
        targetType: "community",
        targetId: ctx.community.id,
        recipientId: input.userId,
      });

      return { success: true };
    }),

  /** Create an invite link */
  createInviteLink: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        maxUses: z.number().int().positive().optional(),
        expiresInDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000)
        : null;

      const [invite] = await ctx.db
        .insert(communityInvites)
        .values({
          communityId: ctx.community.id,
          code,
          createdBy: ctx.session.user.id,
          maxUses: input.maxUses ?? null,
          expiresAt,
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.invite_created",
        targetType: "community",
        targetId: ctx.community.id,
      });

      return invite!;
    }),

  /** Revoke an invite link */
  revokeInviteLink: communityProcedure
    .input(z.object({ slug: z.string(), inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const deleted = await ctx.db
        .delete(communityInvites)
        .where(
          and(
            eq(communityInvites.id, input.inviteId),
            eq(communityInvites.communityId, ctx.community.id),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return { success: true };
    }),

  /** Invite a member directly by userId */
  inviteMember: communityProcedure
    .input(z.object({ slug: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || ctx.communityRole === "member") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Check user exists
      const targetUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, input.userId),
      });
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
        ),
      });

      if (existing?.status === "active") {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }

      if (existing?.status === "banned") {
        throw new TRPCError({ code: "FORBIDDEN", message: "User is banned" });
      }

      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({ status: "invited", invitedBy: ctx.session.user.id })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: ctx.community.id,
          userId: input.userId,
          role: "member",
          status: "invited",
          invitedBy: ctx.session.user.id,
        });
      }

      return { success: true };
    }),
```

- [ ] **Step 2: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(multi-tenancy): add admin procedures to communities router

Implements: updateSettings, approveRequest, rejectRequest, setMemberRole,
transferOwnership, banMember, removeMember, createInviteLink, revokeInviteLink, inviteMember."
```

---

## Task 8: Update logActivity to Accept communityId

**Files:**
- Modify: `src/server/agent/activity.ts`

- [ ] **Step 1: Add communityId to the logActivity function signature**

In `src/server/agent/activity.ts`, update the event parameter type (around line 16):

```typescript
export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent" | "system";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    collabSessionId?: string;
    recipientId?: string;
    communityId?: string;  // ← add this
  },
)
```

And in the insert call, add the field:

```typescript
communityId: event.communityId,
```

- [ ] **Step 2: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(multi-tenancy): add optional communityId to logActivity helper"
```

---

## Task 9: Payload Collection communityId Fields

**Files:**
- Modify: `src/collections/Events.ts`
- Modify: `src/collections/ForumThreads.ts`
- Modify: `src/collections/ForumReplies.ts`
- Modify: `src/collections/CommunityIdeas.ts`
- Modify: `src/collections/Comments.ts`
- Modify: `src/collections/Jobs.ts`
- Modify: `src/collections/LaunchpadProjects.ts`
- Modify: `src/collections/Challenges.ts`

- [ ] **Step 1: Add communityId field to Events.ts**

Add to the `fields` array in `src/collections/Events.ts`:

```typescript
{
  name: "communityId",
  type: "text",
  index: true,
  admin: { position: "sidebar" },
},
```

- [ ] **Step 2: Add communityId field to ForumThreads.ts**

Same field added to `src/collections/ForumThreads.ts` fields array.

- [ ] **Step 3: Add communityId field to ForumReplies.ts**

Same field added to `src/collections/ForumReplies.ts` fields array.

- [ ] **Step 4: Add communityId field to CommunityIdeas.ts**

Same field added to `src/collections/CommunityIdeas.ts` fields array.

- [ ] **Step 5: Add communityId field to Comments.ts**

Same field added to `src/collections/Comments.ts` fields array.

- [ ] **Step 6: Add communityId field to Jobs.ts**

Same field added to `src/collections/Jobs.ts` fields array.

- [ ] **Step 7: Add communityId field to LaunchpadProjects.ts**

Same field added to `src/collections/LaunchpadProjects.ts` fields array.

- [ ] **Step 8: Add communityId field to Challenges.ts**

Same field added to `src/collections/Challenges.ts` fields array.

- [ ] **Step 8.5: Add communityId field to IdeaVotes.ts**

Same field added to `src/collections/IdeaVotes.ts` fields array.

- [ ] **Step 9: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/collections/Events.ts src/collections/ForumThreads.ts src/collections/ForumReplies.ts src/collections/CommunityIdeas.ts src/collections/IdeaVotes.ts src/collections/Comments.ts src/collections/Jobs.ts src/collections/LaunchpadProjects.ts src/collections/Challenges.ts
git commit -m "feat(multi-tenancy): add communityId text field to all relevant Payload collections

Adds nullable communityId to: Events, ForumThreads, ForumReplies,
CommunityIdeas, IdeaVotes, Comments, Jobs, LaunchpadProjects, Challenges."
```

---

## Task 10: AIT Community Seed Migration Script

**Files:**
- Create: `src/server/db/seed-ait-community.ts`

- [ ] **Step 1: Create the seed script**

```typescript
// src/server/db/seed-ait-community.ts
//
// Run with: npx tsx src/server/db/seed-ait-community.ts
//
// Seeds the "AIT Community" as the default community and creates
// memberships for all existing users.

import { db } from "./index";
import { communities, communityMemberships } from "./schema";
import { user } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding AIT Community...");

  const OWNER_EMAIL = process.env.AIT_OWNER_EMAIL;
  if (!OWNER_EMAIL) {
    console.error("Set AIT_OWNER_EMAIL env var to the platform admin's email.");
    process.exit(1);
  }

  // Check if AIT community already exists
  const existing = await db.query.communities.findFirst({
    where: eq(communities.slug, "ait"),
  });
  if (existing) {
    console.log(`AIT Community already exists (${existing.id}), skipping.`);
    return;
  }

  // Get all existing users
  const allUsers = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .orderBy(user.createdAt);

  if (allUsers.length === 0) {
    console.log("No users found. Run this after at least one user exists.");
    return;
  }

  // Find the designated platform admin
  const owner = allUsers.find((u) => u.email === OWNER_EMAIL);
  if (!owner) {
    console.error(`User with email ${OWNER_EMAIL} not found.`);
    process.exit(1);
  }

  console.log(`Found ${allUsers.length} existing users`);
  const ownerId = owner.id;

  // Use a transaction for atomicity
  await db.transaction(async (tx) => {
    // 1. Insert the AIT community
    const [aitCommunity] = await tx
      .insert(communities)
      .values({
        name: "AIT Community",
        slug: "ait",
        description:
          "The AI Tech Community — the founding community of this platform.",
        joinPolicy: "open",
        isListedInDirectory: true,
        createdBy: ownerId,
      })
      .returning();

    console.log(`Created AIT Community: ${aitCommunity!.id}`);

    // 2. Create memberships — designated admin is owner, rest are members
    const membershipValues = allUsers.map((u) => ({
      communityId: aitCommunity!.id,
      userId: u.id,
      role: (u.id === ownerId ? "owner" : "member") as "owner" | "member",
      status: "active" as const,
    }));

    await tx
      .insert(communityMemberships)
      .values(membershipValues)
      .onConflictDoNothing();

    console.log(`Created ${membershipValues.length} memberships`);
  });

  console.log("Done!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/seed-ait-community.ts
git commit -m "feat(multi-tenancy): add AIT community seed migration script

Creates the default AIT Community and enrolls all existing users.
Run with: AIT_OWNER_EMAIL=admin@example.com npx tsx src/server/db/seed-ait-community.ts"
```

---

## Task 11: i18n — Add Community Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add communities namespace to en.json**

Add the `communities` key to `messages/en.json`:

```json
"communities": {
  "directory": {
    "title": "Communities",
    "search": "Search communities...",
    "empty": "No communities found"
  },
  "create": {
    "title": "Create a Community",
    "name": "Community Name",
    "slug": "URL Slug",
    "description": "Description",
    "joinPolicy": "Join Policy",
    "joinPolicyOpen": "Open — anyone can join",
    "joinPolicyInviteOnly": "Invite Only",
    "joinPolicyApprovalRequired": "Approval Required",
    "submit": "Create Community"
  },
  "profile": {
    "members": "Members",
    "events": "Events",
    "forum": "Forum",
    "ideas": "Ideas",
    "challenges": "Challenges",
    "launchpad": "Launchpad",
    "jobs": "Jobs",
    "join": "Join Community",
    "requestToJoin": "Request to Join",
    "pending": "Request Pending",
    "leave": "Leave Community",
    "overview": "Overview"
  },
  "manage": {
    "settings": "Settings",
    "members": "Members",
    "invites": "Invites",
    "approvals": "Pending Approvals",
    "title": "Manage Community"
  },
  "roles": {
    "owner": "Owner",
    "admin": "Admin",
    "moderator": "Moderator",
    "member": "Member"
  },
  "notifications": {
    "joinRequest": "{name} requested to join {community}",
    "approved": "Your request to join {community} was approved",
    "rejected": "Your request to join {community} was rejected",
    "roleChanged": "Your role in {community} was changed to {role}",
    "removed": "You were removed from {community}"
  },
  "nav": {
    "myCommunities": "My Communities",
    "explore": "Explore"
  }
}
```

- [ ] **Step 2: Add communities namespace to nl.json**

Add the equivalent Dutch translations to `messages/nl.json`:

```json
"communities": {
  "directory": {
    "title": "Communities",
    "search": "Zoek communities...",
    "empty": "Geen communities gevonden"
  },
  "create": {
    "title": "Community aanmaken",
    "name": "Community naam",
    "slug": "URL Slug",
    "description": "Beschrijving",
    "joinPolicy": "Toelatingsbeleid",
    "joinPolicyOpen": "Open — iedereen kan deelnemen",
    "joinPolicyInviteOnly": "Alleen op uitnodiging",
    "joinPolicyApprovalRequired": "Goedkeuring vereist",
    "submit": "Community aanmaken"
  },
  "profile": {
    "members": "Leden",
    "events": "Evenementen",
    "forum": "Forum",
    "ideas": "Ideeën",
    "challenges": "Uitdagingen",
    "launchpad": "Launchpad",
    "jobs": "Vacatures",
    "join": "Word lid",
    "requestToJoin": "Lidmaatschap aanvragen",
    "pending": "Aanvraag in behandeling",
    "leave": "Community verlaten",
    "overview": "Overzicht"
  },
  "manage": {
    "settings": "Instellingen",
    "members": "Leden",
    "invites": "Uitnodigingen",
    "approvals": "Openstaande aanvragen",
    "title": "Community beheren"
  },
  "roles": {
    "owner": "Eigenaar",
    "admin": "Beheerder",
    "moderator": "Moderator",
    "member": "Lid"
  },
  "notifications": {
    "joinRequest": "{name} wil lid worden van {community}",
    "approved": "Je aanvraag voor {community} is goedgekeurd",
    "rejected": "Je aanvraag voor {community} is afgewezen",
    "roleChanged": "Je rol in {community} is gewijzigd naar {role}",
    "removed": "Je bent verwijderd uit {community}"
  },
  "nav": {
    "myCommunities": "Mijn Communities",
    "explore": "Ontdekken"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(multi-tenancy): add i18n keys for communities in en and nl"
```

---

## Task 12: Navigation Reorganization

**Files:**
- Modify: `src/components/navbar.tsx`

- [ ] **Step 1: Update navLinks in navbar.tsx**

In `src/components/navbar.tsx`, replace the `navLinks` array (lines 19-31) to match the spec's ~6 primary items with an "Explore" hub:

```typescript
const navLinks = [
  { href: "/communities", key: "communities", shortcut: "C" },
  { href: "/explore", key: "explore", shortcut: "X" },
  { href: "/blog", key: "blog", shortcut: "B" },
  { href: "/events", key: "events", shortcut: "E" },
  { href: "/impact", key: "impact", shortcut: "I" },
  { href: "/sponsors", key: "sponsors", shortcut: "S" },
] as const;
```

- [ ] **Step 2: Create the Explore hub page**

```typescript
// src/app/[locale]/explore/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildOgMeta, buildAlternates } from "@/lib/metadata";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Trophy, Rocket, Briefcase, BarChart3 } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return {
    title: t("explore"),
    ...buildOgMeta(t("explore"), "Discover challenges, projects, jobs, and benchmarks"),
    alternates: buildAlternates("/explore"),
  };
}

const sections = [
  { href: "/challenges", icon: Trophy, titleKey: "challenges", descKey: "challengesDescription" },
  { href: "/launchpad", icon: Rocket, titleKey: "launchpad", descKey: "launchpadDescription" },
  { href: "/jobs", icon: Briefcase, titleKey: "jobs", descKey: "jobsDescription" },
  { href: "/benchmark", icon: BarChart3, titleKey: "benchmark", descKey: "benchmarkDescription" },
] as const;

export default async function ExplorePage() {
  const t = await getTranslations("nav");

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">{t("explore")}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.titleKey} href={section.href}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <section.icon className="text-primary h-6 w-6" />
                  <CardTitle>{t(section.titleKey)}</CardTitle>
                </div>
                <CardDescription>
                  {t(section.descKey)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add nav translation keys in en.json**

In `messages/en.json`, add to the `nav` object:

```json
"communities": "Communities",
"explore": "Explore",
"challengesDescription": "Test your AI skills in community challenges",
"launchpadDescription": "Discover and showcase AI projects",
"jobsDescription": "Find AI-related job opportunities",
"benchmarkDescription": "Evaluate AI models with community questions"
```

- [ ] **Step 4: Add nav translation keys in nl.json**

In `messages/nl.json`, add to the `nav` object:

```json
"communities": "Communities",
"explore": "Ontdekken",
"challengesDescription": "Test je AI-vaardigheden in community uitdagingen",
"launchpadDescription": "Ontdek en showcase AI-projecten",
"jobsDescription": "Vind AI-gerelateerde vacatures",
"benchmarkDescription": "Evalueer AI-modellen met community vragen"
```

- [ ] **Step 5: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/navbar.tsx src/app/[locale]/explore/ messages/en.json messages/nl.json
git commit -m "feat(multi-tenancy): reorganize navigation with Communities and Explore hub

Consolidates nav from 11 items to 6. Challenges, Launchpad, Jobs, and
Benchmark are now accessible via the Explore hub page. Communities and
Explore replace the former standalone links."
```

---

## Task 13: Middleware — Redirect Old /community Routes

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add redirect logic for old /community routes**

In `src/middleware.ts`, add a redirect before the intl middleware runs. After the locale detection logic, add:

```typescript
// Redirect old /community/* routes to /communities/ait/forum/*
const pathname = request.nextUrl.pathname;
const communityMatch = pathname.match(/^\/([a-z]{2})\/community(?:\/(.*))?$/);
if (communityMatch) {
  const locale = communityMatch[1];
  const rest = communityMatch[2] ? `/${communityMatch[2]}` : "";
  return NextResponse.redirect(
    new URL(`/${locale}/communities/ait/forum${rest}`, request.url),
    301,
  );
}
```

- [ ] **Step 2: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(multi-tenancy): add 301 redirects from /community/* to /communities/ait/forum/*"
```

---

## Task 14: Community Directory Page

**Files:**
- Create: `src/app/[locale]/communities/page.tsx`
- Create: `src/components/communities/community-card.tsx`

- [ ] **Step 1: Create the community card component**

```typescript
// src/components/communities/community-card.tsx
"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users } from "lucide-react";

interface CommunityCardProps {
  community: {
    slug: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    joinPolicy: string;
    memberCount: number;
  };
}

export function CommunityCard({ community }: CommunityCardProps) {
  const t = useTranslations("communities");

  return (
    <Link href={`/communities/${community.slug}`}>
      <Card className="hover:border-primary/50 transition-colors">
        <CardHeader>
          <div className="flex items-center gap-3">
            {community.logoUrl ? (
              <img
                src={community.logoUrl}
                alt={community.name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold">
                {community.name[0]}
              </div>
            )}
            <div>
              <CardTitle className="text-lg">{community.name}</CardTitle>
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <Users className="h-3 w-3" />
                <span>
                  {community.memberCount} {t("profile.members").toLowerCase()}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        {community.description && (
          <CardContent>
            <CardDescription className="line-clamp-2">
              {community.description}
            </CardDescription>
          </CardContent>
        )}
        {community.joinPolicy !== "open" && (
          <CardContent className="pt-0">
            <Badge variant="secondary">
              {community.joinPolicy === "invite_only"
                ? t("create.joinPolicyInviteOnly")
                : t("create.joinPolicyApprovalRequired")}
            </Badge>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Create the directory page**

```typescript
// src/app/[locale]/communities/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildOgMeta, buildAlternates } from "@/lib/metadata";
import { CommunitiesDirectory } from "@/components/communities/communities-directory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("communities.directory");
  return {
    title: t("title"),
    ...buildOgMeta(t("title"), "Browse and join AI communities"),
    alternates: buildAlternates("/communities"),
  };
}

export default function CommunitiesPage() {
  return <CommunitiesDirectory />;
}
```

- [ ] **Step 3: Create the directory client component**

```typescript
// src/components/communities/communities-directory.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import { CommunityCard } from "./community-card";
import { Search } from "lucide-react";

export function CommunitiesDirectory() {
  const t = useTranslations("communities");
  const [search, setSearch] = useState("");

  const { data, isLoading } = api.communities.list.useQuery({
    search: search || undefined,
    limit: 20,
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t("directory.title")}</h1>

      <div className="relative mb-8">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder={t("directory.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted h-40 animate-pulse rounded-lg"
            />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">
          {t("directory.empty")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/communities/page.tsx src/components/communities/community-card.tsx src/components/communities/communities-directory.tsx
git commit -m "feat(multi-tenancy): add communities directory page with search and cards"
```

---

## Task 15: Community Profile Page & Layout

**Files:**
- Create: `src/app/[locale]/communities/[slug]/layout.tsx`
- Create: `src/app/[locale]/communities/[slug]/page.tsx`
- Create: `src/components/communities/community-header.tsx`
- Create: `src/components/communities/community-nav.tsx`
- Create: `src/components/communities/join-button.tsx`

- [ ] **Step 1: Create the join button component**

```typescript
// src/components/communities/join-button.tsx
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface JoinButtonProps {
  slug: string;
  joinPolicy: string;
  membershipStatus: string | null;
}

export function JoinButton({ slug, joinPolicy, membershipStatus }: JoinButtonProps) {
  const t = useTranslations("communities.profile");
  const utils = api.useUtils();

  const joinMutation = api.communities.join.useMutation({
    onSuccess: () => utils.communities.invalidate(),
  });

  const requestMutation = api.communities.requestToJoin.useMutation({
    onSuccess: () => utils.communities.invalidate(),
  });

  const leaveMutation = api.communities.leave.useMutation({
    onSuccess: () => utils.communities.invalidate(),
  });

  const isPending =
    joinMutation.isPending || requestMutation.isPending || leaveMutation.isPending;

  if (membershipStatus === "active") {
    return (
      <Button
        variant="outline"
        onClick={() => leaveMutation.mutate({ slug })}
        disabled={isPending}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("leave")}
      </Button>
    );
  }

  if (membershipStatus === "pending_approval") {
    return (
      <Button variant="secondary" disabled>
        {t("pending")}
      </Button>
    );
  }

  if (joinPolicy === "open") {
    return (
      <Button
        onClick={() => joinMutation.mutate({ slug })}
        disabled={isPending}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("join")}
      </Button>
    );
  }

  if (joinPolicy === "approval_required") {
    return (
      <Button
        onClick={() => requestMutation.mutate({ slug })}
        disabled={isPending}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("requestToJoin")}
      </Button>
    );
  }

  // invite_only — no button shown
  return null;
}
```

- [ ] **Step 2: Create the community header component**

```typescript
// src/components/communities/community-header.tsx
"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { JoinButton } from "./join-button";

interface CommunityHeaderProps {
  community: {
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    joinPolicy: string;
    memberCount: number;
  };
  membershipStatus: string | null;
}

export function CommunityHeader({
  community,
  membershipStatus,
}: CommunityHeaderProps) {
  const t = useTranslations("communities.profile");

  return (
    <div className="border-b pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {community.logoUrl ? (
            <img
              src={community.logoUrl}
              alt={community.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold">
              {community.name[0]}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold">{community.name}</h1>
            <div className="text-muted-foreground flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>
                {community.memberCount} {t("members").toLowerCase()}
              </span>
            </div>
          </div>
        </div>
        <JoinButton
          slug={community.slug}
          joinPolicy={community.joinPolicy}
          membershipStatus={membershipStatus}
        />
      </div>
      {community.description && (
        <p className="text-muted-foreground mt-4">{community.description}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the community sub-navigation**

```typescript
// src/components/communities/community-nav.tsx
"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface CommunityNavProps {
  slug: string;
}

export function CommunityNav({ slug }: CommunityNavProps) {
  const t = useTranslations("communities.profile");
  const pathname = usePathname();

  const tabs = [
    { key: "overview", href: `/communities/${slug}` },
    { key: "forum", href: `/communities/${slug}/forum` },
    { key: "events", href: `/communities/${slug}/events` },
    { key: "ideas", href: `/communities/${slug}/ideas` },
    { key: "challenges", href: `/communities/${slug}/challenges` },
    { key: "launchpad", href: `/communities/${slug}/launchpad` },
    { key: "jobs", href: `/communities/${slug}/jobs` },
    { key: "members", href: `/communities/${slug}/members` },
  ] as const;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const isActive =
          tab.key === "overview"
            ? pathname.endsWith(`/communities/${slug}`)
            : pathname.startsWith(tab.href) || pathname.includes(`${tab.href}/`);

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Create the community layout (server component for SEO)**

```typescript
// src/app/[locale]/communities/[slug]/layout.tsx
import { notFound } from "next/navigation";
import { api, HydrateClient } from "@/trpc/server";
import { CommunityHeader } from "@/components/communities/community-header";
import { CommunityNav } from "@/components/communities/community-nav";

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Prefetch on the server for SSR/SEO
  const community = await api.communities.getBySlug({ slug });

  if (!community) {
    notFound();
  }

  // Prefetch members so child pages hydrate instantly
  void api.communities.getMembers.prefetch({ slug, limit: 10 });

  // getMyCommunities may fail for unauthenticated users — ignore errors
  let membershipStatus: string | null = null;
  try {
    const myCommunities = await api.communities.getMyCommunities();
    const membership = myCommunities?.find(
      (m) => m.communityId === community.id,
    );
    membershipStatus = membership?.status ?? null;
  } catch {
    // Not authenticated — that's fine
  }

  return (
    <HydrateClient>
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <CommunityHeader
          community={community}
          membershipStatus={membershipStatus}
        />
        <CommunityNav slug={slug} />
        <div className="mt-6">{children}</div>
      </div>
    </HydrateClient>
  );
}
```

- [ ] **Step 5: Create the community overview page**

```typescript
// src/app/[locale]/communities/[slug]/page.tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";

export default function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.profile");
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: members } = api.communities.getMembers.useQuery({
    slug,
    limit: 10,
  });

  if (!community) return null;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-xl font-semibold">{t("overview")}</h2>
        <p className="text-muted-foreground">
          {community.description ?? "No description yet."}
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">
          {t("members")} ({community.memberCount})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {members?.items.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              {member.image ? (
                <img
                  src={member.image}
                  alt={member.displayName ?? ""}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold">
                  {(member.displayName ?? "?")[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{member.displayName}</p>
                <p className="text-muted-foreground text-xs capitalize">
                  {member.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale]/communities/[slug]/ src/components/communities/
git commit -m "feat(multi-tenancy): add community profile page with header, nav, and overview

Includes join/leave button, sub-navigation tabs, member preview,
and community layout wrapper."
```

---

## Task 16: Community Sub-Pages (Forum, Events, Members, Ideas, Challenges, Launchpad, Jobs)

**Files:**
- Create: `src/app/[locale]/communities/[slug]/forum/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/events/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/members/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/ideas/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/challenges/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/launchpad/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/jobs/page.tsx`

- [ ] **Step 1: Create community members page**

```typescript
// src/app/[locale]/communities/[slug]/members/page.tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export default function CommunityMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities");
  const { data, isLoading } = api.communities.getMembers.useQuery({
    slug,
    limit: 50,
  });

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">{t("profile.members")}</h2>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.items.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                {member.image ? (
                  <img
                    src={member.image}
                    alt={member.displayName ?? ""}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full font-bold">
                    {(member.displayName ?? "?")[0]}
                  </div>
                )}
                <div>
                  <p className="font-medium">{member.displayName}</p>
                  {member.bio && (
                    <p className="text-muted-foreground line-clamp-1 text-sm">
                      {member.bio}
                    </p>
                  )}
                </div>
              </div>
              {member.role !== "member" && (
                <Badge variant="secondary" className="capitalize">
                  {t(`roles.${member.role}`)}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create placeholder pages for other sub-sections**

Create each of these pages as a minimal placeholder that shows the section title. These will be enhanced later when content scoping (Payload access control) is wired up. For now they serve as route targets:

`src/app/[locale]/communities/[slug]/forum/page.tsx`:
```typescript
"use client";
import { useTranslations } from "next-intl";
export default function CommunityForumPage() {
  const t = useTranslations("communities.profile");
  return <div><h2 className="text-xl font-semibold">{t("forum")}</h2><p className="text-muted-foreground mt-2">Community forum — coming soon.</p></div>;
}
```

`src/app/[locale]/communities/[slug]/events/page.tsx`:
```typescript
"use client";
import { useTranslations } from "next-intl";
export default function CommunityEventsPage() {
  const t = useTranslations("communities.profile");
  return <div><h2 className="text-xl font-semibold">{t("events")}</h2><p className="text-muted-foreground mt-2">Community events — coming soon.</p></div>;
}
```

`src/app/[locale]/communities/[slug]/ideas/page.tsx`:
```typescript
"use client";
import { useTranslations } from "next-intl";
export default function CommunityIdeasPage() {
  const t = useTranslations("communities.profile");
  return <div><h2 className="text-xl font-semibold">{t("ideas")}</h2><p className="text-muted-foreground mt-2">Community ideas — coming soon.</p></div>;
}
```

`src/app/[locale]/communities/[slug]/challenges/page.tsx`:
```typescript
"use client";
import { useTranslations } from "next-intl";
export default function CommunityChallengesPage() {
  const t = useTranslations("communities.profile");
  return <div><h2 className="text-xl font-semibold">{t("challenges")}</h2><p className="text-muted-foreground mt-2">Community challenges — coming soon.</p></div>;
}
```

`src/app/[locale]/communities/[slug]/launchpad/page.tsx`:
```typescript
"use client";
import { useTranslations } from "next-intl";
export default function CommunityLaunchpadPage() {
  const t = useTranslations("communities.profile");
  return <div><h2 className="text-xl font-semibold">{t("launchpad")}</h2><p className="text-muted-foreground mt-2">Community launchpad — coming soon.</p></div>;
}
```

`src/app/[locale]/communities/[slug]/jobs/page.tsx`:
```typescript
"use client";
import { useTranslations } from "next-intl";
export default function CommunityJobsPage() {
  const t = useTranslations("communities.profile");
  return <div><h2 className="text-xl font-semibold">{t("jobs")}</h2><p className="text-muted-foreground mt-2">Community jobs — coming soon.</p></div>;
}
```

- [ ] **Step 3: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/communities/[slug]/
git commit -m "feat(multi-tenancy): add community sub-pages (members, forum, events, ideas, challenges, launchpad, jobs)

Members page is fully functional. Other sub-pages are placeholders
pending content scoping integration."
```

---

## Task 17: Dashboard — My Communities & Community Admin Pages

**Files:**
- Create: `src/app/[locale]/dashboard/communities/page.tsx`
- Create: `src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx`
- Create: `src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx`
- Create: `src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx`
- Create: `src/components/communities/manage/settings-form.tsx`
- Create: `src/components/communities/manage/members-table.tsx`
- Create: `src/components/communities/manage/invite-section.tsx`

- [ ] **Step 1: Create My Communities dashboard page**

```typescript
// src/app/[locale]/dashboard/communities/page.tsx
"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

export default function MyCommunities() {
  const t = useTranslations("communities");
  const { data, isLoading } = api.communities.getMyCommunities.useQuery();

  const activeMemberships = data?.filter((m) => m.status === "active") ?? [];
  const pendingMemberships = data?.filter((m) => m.status === "pending_approval") ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("nav.myCommunities")}</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : activeMemberships.length === 0 && pendingMemberships.length === 0 ? (
        <p className="text-muted-foreground">{t("directory.empty")}</p>
      ) : (
        <>
          {activeMemberships.map((m) => (
            <div
              key={m.communityId}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center gap-3">
                {m.logoUrl ? (
                  <img src={m.logoUrl} alt={m.name} className="h-10 w-10 rounded-full" />
                ) : (
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full font-bold">
                    {m.name[0]}
                  </div>
                )}
                <div>
                  <Link
                    href={`/communities/${m.slug}`}
                    className="font-medium hover:underline"
                  >
                    {m.name}
                  </Link>
                  <Badge variant="secondary" className="ml-2 capitalize">
                    {t(`roles.${m.role}`)}
                  </Badge>
                </div>
              </div>
              {(m.role === "owner" || m.role === "admin") && (
                <Link href={`/dashboard/communities/${m.slug}/manage`}>
                  <Button variant="ghost" size="sm">
                    <Settings className="mr-1 h-4 w-4" />
                    {t("manage.title")}
                  </Button>
                </Link>
              )}
            </div>
          ))}
          {pendingMemberships.map((m) => (
            <div
              key={m.communityId}
              className="flex items-center justify-between rounded-lg border border-dashed p-4 opacity-60"
            >
              <div className="flex items-center gap-3">
                <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full font-bold">
                  {m.name[0]}
                </div>
                <span className="font-medium">{m.name}</span>
                <Badge variant="outline">{t("profile.pending")}</Badge>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the settings form component**

```typescript
// src/components/communities/manage/settings-form.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface SettingsFormProps {
  slug: string;
  community: {
    name: string;
    description: string | null;
    joinPolicy: string;
    isListedInDirectory: boolean;
    logoUrl: string | null;
  };
}

export function SettingsForm({ slug, community }: SettingsFormProps) {
  const t = useTranslations("communities");
  const utils = api.useUtils();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [joinPolicy, setJoinPolicy] = useState(community.joinPolicy);
  const [isListed, setIsListed] = useState(community.isListedInDirectory);

  const mutation = api.communities.updateSettings.useMutation({
    onSuccess: () => utils.communities.invalidate(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      slug,
      name,
      description,
      joinPolicy: joinPolicy as "open" | "invite_only" | "approval_required",
      isListedInDirectory: isListed,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <Label>{t("create.name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>{t("create.description")}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div>
        <Label>{t("create.joinPolicy")}</Label>
        <Select value={joinPolicy} onValueChange={setJoinPolicy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("create.joinPolicyOpen")}</SelectItem>
            <SelectItem value="invite_only">{t("create.joinPolicyInviteOnly")}</SelectItem>
            <SelectItem value="approval_required">{t("create.joinPolicyApprovalRequired")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={isListed} onCheckedChange={setIsListed} />
        <Label>Listed in directory</Label>
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create the community manage page, members page, and settings page**

`src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx`:
```typescript
import { redirect } from "next/navigation";

export default async function CommunityManagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/dashboard/communities/${slug}/manage/settings`);
}
```

`src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx`:
```typescript
"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { SettingsForm } from "@/components/communities/manage/settings-form";

export default function CommunitySettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.manage");
  const { data: community, isLoading } = api.communities.getBySlug.useQuery({ slug });

  if (isLoading) return <div className="bg-muted h-64 animate-pulse rounded-lg" />;
  if (!community) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">{t("settings")}</h2>
      <SettingsForm slug={slug} community={community} />
    </div>
  );
}
```

`src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx`:
```typescript
"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function CommunityManageMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities");
  const utils = api.useUtils();
  const { data: members, isLoading } = api.communities.getMembers.useQuery({
    slug,
    limit: 50,
  });

  const banMutation = api.communities.banMember.useMutation({
    onSuccess: () => utils.communities.invalidate(),
  });

  const removeMutation = api.communities.removeMember.useMutation({
    onSuccess: () => utils.communities.invalidate(),
  });

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">{t("manage.members")}</h2>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {members?.items.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <p className="font-medium">{member.displayName}</p>
                <Badge variant="secondary" className="capitalize">
                  {t(`roles.${member.role}`)}
                </Badge>
              </div>
              {member.role === "member" && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate({ slug, userId: member.userId })}
                  >
                    Remove
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => banMutation.mutate({ slug, userId: member.userId })}
                  >
                    Ban
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/dashboard/communities/ src/components/communities/manage/
git commit -m "feat(multi-tenancy): add dashboard community management pages

Includes My Communities list, community settings form,
and member management with ban/remove actions."
```

---

## Task 18: Invite Link Handler Page

**Files:**
- Create: `src/app/[locale]/join/[code]/page.tsx`

- [ ] **Step 1: Create the invite handler page**

```typescript
// src/app/[locale]/join/[code]/page.tsx
"use client";

import { use, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";

export default function JoinByInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const hasRun = useRef(false);

  const mutation = api.communities.acceptInvite.useMutation({
    onSuccess: (data) => {
      router.replace(`/communities/${data.communitySlug}`);
    },
  });

  useEffect(() => {
    // Guard against React Strict Mode double-invoke
    if (hasRun.current) return;
    hasRun.current = true;
    mutation.mutate({ code });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (mutation.error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg font-medium">
            {mutation.error.message}
          </p>
          <button
            onClick={() => router.replace("/communities")}
            className="text-muted-foreground mt-4 underline"
          >
            Browse communities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
```

- [ ] **Step 2: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/join/
git commit -m "feat(multi-tenancy): add invite link handler page at /join/[code]

Accepts invite code, joins community, and redirects to community page."
```

---

## Task 19: Final Type Check & Integration Verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run existing tests to confirm nothing is broken**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 3: Run the dev server to verify compilation**

Run: `npx next dev --turbo`
Expected: Compiles without errors. Verify `/communities` loads in browser.

- [ ] **Step 4: Final commit if any fixes were needed**

Stage only the files that were actually fixed, then commit:
```bash
git add <fixed-files>
git commit -m "fix: resolve integration issues from multi-tenancy implementation"
```

---

## Task 18: Invite Link Handler Page

**Files:**
- Create: `src/app/[locale]/join/[code]/page.tsx`

- [ ] **Step 1: Create the invite handler page**

```typescript
// src/app/[locale]/join/[code]/page.tsx
"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Loader2 } from "lucide-react";

export default function JoinByInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  const mutation = api.communities.acceptInvite.useMutation({
    onSuccess: (data) => {
      router.replace(`/communities/${data.communitySlug}`);
    },
  });

  useEffect(() => {
    mutation.mutate({ code });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [code]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      {mutation.isPending && (
        <>
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Accepting invite...</p>
        </>
      )}
      {mutation.isError && (
        <div className="text-center">
          <p className="text-destructive text-lg font-medium">
            {mutation.error.message}
          </p>
          <p className="text-muted-foreground mt-2">
            This invite may be invalid, expired, or already used.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/join/
git commit -m "feat(multi-tenancy): add invite link handler page at /join/[code]

Accepts community invites and redirects to the community profile page."
```

---

## Task 19: Dashboard Sidebar — Add My Communities Link

**Files:**
- Modify: `src/components/dashboard-tabs.tsx`

- [ ] **Step 1: Add communities tab to dashboard sidebar**

In `src/components/dashboard-tabs.tsx`, add a new tab entry for communities. Insert after the notifications tab:

```typescript
{ path: "/dashboard/communities", icon: UsersIcon, labelKey: "communities" },
```

Also add the `UsersIcon` import from `lucide-react`.

- [ ] **Step 2: Add i18n key for dashboard communities tab**

In `messages/en.json`, under the `dashboard` namespace, add:
```json
"communities": "My Communities"
```

In `messages/nl.json`, under the `dashboard` namespace, add:
```json
"communities": "Mijn Communities"
```

- [ ] **Step 3: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard-tabs.tsx messages/en.json messages/nl.json
git commit -m "feat(multi-tenancy): add My Communities link to dashboard sidebar"
```

---

## Task 20: Community Notification Creation

**Files:**
- Modify: `src/server/api/routers/communities.ts`

Wire up notification records for the critical community events. Uses the existing `notifications` table pattern (direct Drizzle insert).

- [ ] **Step 1: Add notification helper and wire into admin procedures**

At the top of `src/server/api/routers/communities.ts`, add an import:

```typescript
import { notifications } from "@/server/db/schema";
```

Then add a helper function inside the file:

```typescript
async function notifyCommunityAdmins(
  db: typeof import("@/server/db").db,
  communityId: string,
  notification: { type: string; title: string; content: string; metadata?: Record<string, unknown> },
) {
  const admins = await db
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
        sql`${communityMemberships.role} IN ('owner', 'admin')`,
      ),
    );

  if (admins.length === 0) return;

  await db.insert(notifications).values(
    admins.map((a) => ({
      userId: a.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      metadata: notification.metadata ?? {},
    })),
  );
}
```

- [ ] **Step 2: Add notification to `requestToJoin` procedure**

After the `logActivity` call in `requestToJoin`, add:

```typescript
await notifyCommunityAdmins(ctx.db, community.id, {
  type: "community_join_request",
  title: "New join request",
  content: `A user requested to join your community`,
  metadata: { communityId: community.id, userId: ctx.session.user.id },
});
```

- [ ] **Step 3: Add notification to `approveRequest` procedure**

After the `logActivity` call in `approveRequest`, add:

```typescript
await ctx.db.insert(notifications).values({
  userId: input.userId,
  type: "community_request_approved",
  title: "Join request approved",
  content: `Your request to join ${ctx.community.name} was approved`,
  metadata: { communityId: ctx.community.id },
});
```

- [ ] **Step 4: Add notification to `rejectRequest` procedure**

After the deletion in `rejectRequest`, add:

```typescript
await ctx.db.insert(notifications).values({
  userId: input.userId,
  type: "community_request_rejected",
  title: "Join request rejected",
  content: `Your request to join ${ctx.community.name} was rejected`,
  metadata: { communityId: ctx.community.id },
});
```

- [ ] **Step 5: Add notification to `setMemberRole` procedure**

After the `logActivity` call in `setMemberRole`, add:

```typescript
await ctx.db.insert(notifications).values({
  userId: input.userId,
  type: "community_role_changed",
  title: "Role changed",
  content: `Your role in ${ctx.community.name} was changed to ${input.role}`,
  metadata: { communityId: ctx.community.id, from: target.role, to: input.role },
});
```

- [ ] **Step 6: Add notification to `banMember` procedure**

After the `logActivity` call in `banMember`, add:

```typescript
await ctx.db.insert(notifications).values({
  userId: input.userId,
  type: "community_banned",
  title: "Banned from community",
  content: `You were banned from ${ctx.community.name}`,
  metadata: { communityId: ctx.community.id },
});
```

- [ ] **Step 7: Add notification to `removeMember` procedure**

After the `logActivity` call in `removeMember`, add:

```typescript
await ctx.db.insert(notifications).values({
  userId: input.userId,
  type: "community_member_removed",
  title: "Removed from community",
  content: `You were removed from ${ctx.community.name}`,
  metadata: { communityId: ctx.community.id },
});
```

- [ ] **Step 8: Run tsc --noEmit**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(multi-tenancy): wire up community notification creation

Creates notification records for: join requests, approvals, rejections,
role changes, bans, and removals. Notifies admins for join requests
and affected users for all other actions."
```

---

## Deferred Work (Not In This Plan)

The following items are part of the spec but intentionally deferred to follow-up tasks:

1. **Payload access control** — The spec defines read/create/update/delete rules for community-scoped content in Payload collections. This plan adds the `communityId` fields but does not modify Payload access control hooks. This should be a separate task once the core community infrastructure is stable.

2. **CommunitySelectField Payload admin component** — The spec describes a custom Payload admin component for selecting communities from a dropdown instead of raw ID input. This is listed in the file structure but implementation is deferred — the raw text field works for initial use.

3. **Content scoping in community sub-pages** — The forum, events, ideas, challenges, launchpad, and jobs sub-pages under `/communities/[slug]/` are placeholder pages. Wiring them to query Payload content filtered by `communityId` requires the Payload access control work from item 1.

4. **Hardcoded strings** — Some UI components contain hardcoded English strings (e.g., "Save", "Remove", "Ban", "coming soon" placeholders). These should be replaced with i18n keys in a follow-up pass.

5. **Existing `/forum` and `/members` routes** — The nav reorganization removes direct links to these routes, but the routes themselves still exist and work. They should either be preserved as global aggregate views or integrated into the Explore hub page.

6. **Migrate admin procedures to `communityMemberProcedure`** — The `communityMemberProcedure` middleware (added in Task 5) rejects non-members automatically. The admin procedures in Task 7 currently use `communityProcedure` with manual role checks. A follow-up should migrate admin procedures to `communityMemberProcedure` to reduce boilerplate, or create a `communityAdminProcedure` variant that additionally requires admin+ roles.

7. **Community forum thread detail page** — `src/app/[locale]/communities/[slug]/forum/[threadSlug]/page.tsx` is not created in this plan. It requires content scoping (item 1) to filter threads by community. Add after Payload access control is wired up.

8. **Rate limiting on community creation** — Any authenticated user can create unlimited communities. A future iteration should add a max communities per user limit or platform admin approval.
