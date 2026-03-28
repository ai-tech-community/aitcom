# MCP Community & Feed Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 21 new MCP tools and extend 4 existing tools so AI agents can discover, join, manage, and participate in communities and their feeds.

**Architecture:** New agent procedures live in two domain files (`agent-communities.ts`, `agent-feed.ts`) that export plain objects spread into the main agent router. MCP tool registrations live in two domain modules (`community-tools.ts`, `feed-tools.ts`) called from the existing route. Destructive admin actions save to the existing `agentSuggestions` table instead of executing directly.

**Tech Stack:** tRPC, Drizzle ORM, Payload CMS, MCP SDK (`@modelcontextprotocol/sdk`), Zod

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/server/api/routers/agent-communities.ts` | 16 community agent procedures (read, membership, creation, admin, suggestions) |
| `src/server/api/routers/agent-feed.ts` | 5 feed agent procedures (browse, post, comment, like) |
| `src/app/api/mcp/community-tools.ts` | 16 community MCP tool registrations |
| `src/app/api/mcp/feed-tools.ts` | 5 feed MCP tool registrations |

### Modified Files
| File | Change |
|---|---|
| `src/server/api/routers/agent.ts` | Import + spread new routers, add `communitySlug` to 4 existing procedures |
| `src/app/api/mcp/route.ts` | Import + call domain modules, bump version, add `communitySlug` to 4 existing tool schemas |

---

### Task 1: Community Read Procedures

**Files:**
- Create: `src/server/api/routers/agent-communities.ts`

- [ ] **Step 1: Create agent-communities.ts with read procedures**

Create the file with `browseCommunities` and `getCommunityInfo`:

```typescript
// src/server/api/routers/agent-communities.ts
import { z } from "zod";
import { eq, and, isNull, ilike, count, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { agentProcedure, requireScope } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityInvites,
  agentSuggestions,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { canManageRole, type CommunityRole } from "@/server/communities/role-utils";
import { logActivity } from "@/server/agent/activity";

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

/** Resolve community by slug, throw NOT_FOUND if missing or deleted */
async function resolveCommunity(db: Parameters<typeof communities._.columns>[0] extends never ? never : any, slug: string) {
  // We'll use the db instance from ctx
  throw new Error("placeholder");
}

// ── Procedures ──────────────────────────────────────────────────────────────

export const agentCommunityRouter = {
  browseCommunities: agentProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

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
        .orderBy(desc(communities.createdAt))
        .limit(input.limit);

      return items;
    }),

  getCommunityInfo: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });

      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
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

      // Check owner's membership
      const ownerMembership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });

      return {
        ...community,
        memberCount: memberCountResult?.count ?? 0,
        ownerMembership: ownerMembership
          ? { role: ownerMembership.role, joinedAt: ownerMembership.joinedAt }
          : null,
      };
    }),
};
```

Then remove the placeholder `resolveCommunity` helper and replace with a proper inline pattern used in each procedure (the community resolution is simple enough to inline — just `ctx.db.query.communities.findFirst`).

The final file should NOT have the `resolveCommunity` placeholder. Here's the clean version of just the imports and helper:

```typescript
import { z } from "zod";
import { eq, and, isNull, ilike, count, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { agentProcedure, requireScope } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  communityInvites,
  agentSuggestions,
  memberProfiles,
  user,
} from "@/server/db/schema";
import { canManageRole, type CommunityRole } from "@/server/communities/role-utils";
import { logActivity } from "@/server/agent/activity";

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `agent-communities.ts`

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-communities.ts
git commit -m "feat(mcp): add community read procedures (browseCommunities, getCommunityInfo)"
```

---

### Task 2: Community Membership Procedures

**Files:**
- Modify: `src/server/api/routers/agent-communities.ts`

- [ ] **Step 1: Add membership procedures to agentCommunityRouter**

Add these procedures to the `agentCommunityRouter` object in `agent-communities.ts`, after `getCommunityInfo`:

```typescript
  getOwnerCommunities: agentProcedure
    .query(async ({ ctx }) => {
      requireScope(ctx.agent.scopes, "read");

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
        .where(eq(communityMemberships.userId, ctx.agent.ownerId))
        .orderBy(desc(communityMemberships.joinedAt));

      return memberships;
    }),

  joinCommunity: agentProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }
      if (community.joinPolicy !== "open") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This community is not open for direct joining. Use request-to-join-community instead.",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Owner is banned from this community" });
        }
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
        }
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: community.id,
          userId: ctx.agent.ownerId,
          role: "member",
          status: "active",
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.joined",
        targetType: "community",
        targetId: community.id,
        metadata: { slug: input.slug },
      });

      return { success: true, communitySlug: community.slug };
    }),

  requestToJoinCommunity: agentProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
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
          eq(communityMemberships.userId, ctx.agent.ownerId),
        ),
      });

      if (existing) {
        if (existing.status === "banned") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Owner is banned from this community" });
        }
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
        }
        if (existing.status === "pending_approval") {
          throw new TRPCError({ code: "CONFLICT", message: "Request already pending" });
        }
      }

      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({ status: "pending_approval" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: community.id,
          userId: ctx.agent.ownerId,
          role: "member",
          status: "pending_approval",
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.join_requested",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  leaveCommunity: agentProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

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
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Owner is not a member" });
      }

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
            message: "Cannot leave — owner is the last owner. Transfer ownership first.",
          });
        }
      }

      await ctx.db
        .delete(communityMemberships)
        .where(eq(communityMemberships.id, membership.id));

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.left",
        targetType: "community",
        targetId: community.id,
      });

      return { success: true };
    }),

  acceptCommunityInvite: agentProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

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
        await ctx.db
          .update(communityInvites)
          .set({ useCount: sql`${communityInvites.useCount} + 1` })
          .where(eq(communityInvites.id, invite.id));
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, invite.communityId),
          eq(communityMemberships.userId, ctx.agent.ownerId),
        ),
      });

      if (existing?.status === "banned") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is banned from this community" });
      }
      if (existing?.status === "active") {
        return { success: true, communitySlug: invite.community.slug };
      }

      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({ status: "active" })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: invite.communityId,
          userId: ctx.agent.ownerId,
          role: "member",
          status: "active",
          invitedBy: invite.createdBy,
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.joined",
        targetType: "community",
        targetId: invite.communityId,
        metadata: { via: "invite" },
      });

      return { success: true, communitySlug: invite.community.slug };
    }),
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `agent-communities.ts`

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-communities.ts
git commit -m "feat(mcp): add community membership procedures (join, leave, request, invite, list)"
```

---

### Task 3: Community Creation & Admin Procedures

**Files:**
- Modify: `src/server/api/routers/agent-communities.ts`

- [ ] **Step 1: Add creation and admin procedures**

Add these procedures to the `agentCommunityRouter` object, after `acceptCommunityInvite`:

```typescript
  createCommunity: agentProcedure
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
      requireScope(ctx.agent.scopes, "contribute");

      const { generateSlug } = await import("@/server/communities/slug-utils");
      const slug = generateSlug(input.name);

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
          createdBy: ctx.agent.ownerId,
        })
        .returning();

      await ctx.db.insert(communityMemberships).values({
        communityId: community!.id,
        userId: ctx.agent.ownerId,
        role: "owner",
        status: "active",
      });

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.created",
        targetType: "community",
        targetId: community!.id,
        metadata: { name: input.name, slug },
      });

      return { id: community!.id, slug: community!.slug, name: community!.name };
    }),

  updateCommunitySettings: agentProcedure
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
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner must be admin or owner of this community" });
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
      if (input.joinPolicy !== undefined) updates.joinPolicy = input.joinPolicy;
      if (input.isListedInDirectory !== undefined) updates.isListedInDirectory = input.isListedInDirectory;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No settings to update" });
      }

      const [updated] = await ctx.db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, community.id))
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.settings_updated",
        targetType: "community",
        targetId: community.id,
        metadata: updates,
      });

      return updated!;
    }),

  getCommunityInviteLinks: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!membership || membership.role === "member" || membership.role === "moderator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Requires admin or owner role" });
      }

      const invites = await ctx.db
        .select()
        .from(communityInvites)
        .where(eq(communityInvites.communityId, community.id))
        .orderBy(desc(communityInvites.createdAt));

      return invites;
    }),

  createCommunityInviteLink: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        maxUses: z.number().int().positive().optional(),
        expiresInDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!membership || membership.role === "member") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Requires moderator role or above" });
      }

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000)
        : null;

      const [invite] = await ctx.db
        .insert(communityInvites)
        .values({
          communityId: community.id,
          code,
          createdBy: ctx.agent.ownerId,
          maxUses: input.maxUses ?? null,
          expiresAt,
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "community.invite_created",
        targetType: "community",
        targetId: community.id,
      });

      return invite!;
    }),

  revokeCommunityInviteLink: agentProcedure
    .input(z.object({ slug: z.string(), inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!membership || membership.role === "member") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Requires moderator role or above" });
      }

      const deleted = await ctx.db
        .delete(communityInvites)
        .where(
          and(
            eq(communityInvites.id, input.inviteId),
            eq(communityInvites.communityId, community.id),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      return { success: true };
    }),
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `agent-communities.ts`

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-communities.ts
git commit -m "feat(mcp): add community creation and admin procedures"
```

---

### Task 4: Destructive Admin Suggestions (Ghost Mode)

**Files:**
- Modify: `src/server/api/routers/agent-communities.ts`

- [ ] **Step 1: Add the four suggestion procedures**

Add these to the `agentCommunityRouter` object, after `revokeCommunityInviteLink`:

```typescript
  suggestBanMember: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const actorMembership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!actorMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is not a member" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
        ),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found in community" });
      }

      if (!canManageRole(actorMembership.role as CommunityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to ban this member" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Ban member from ${community.name}`,
          content: input.reason,
          metadata: {
            action: "ban_member",
            communitySlug: input.slug,
            communityId: community.id,
            targetUserId: input.userId,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: { action: "ban_member", communitySlug: input.slug },
      });

      return { suggestionId: suggestion!.id, message: "Ban suggestion saved for owner review" };
    }),

  suggestRemoveMember: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const actorMembership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!actorMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is not a member" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found or not active" });
      }

      if (!canManageRole(actorMembership.role as CommunityRole, target.role as CommunityRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to remove this member" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Remove member from ${community.name}`,
          content: input.reason,
          metadata: {
            action: "remove_member",
            communitySlug: input.slug,
            communityId: community.id,
            targetUserId: input.userId,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: { action: "remove_member", communitySlug: input.slug },
      });

      return { suggestionId: suggestion!.id, message: "Remove suggestion saved for owner review" };
    }),

  suggestTransferOwnership: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const actorMembership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });

      if (!actorMembership || actorMembership.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners can transfer ownership" });
      }

      if (input.userId === ctx.agent.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot transfer to yourself" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user is not an active member" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Transfer ownership of ${community.name}`,
          content: input.reason,
          metadata: {
            action: "transfer_ownership",
            communitySlug: input.slug,
            communityId: community.id,
            targetUserId: input.userId,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: { action: "transfer_ownership", communitySlug: input.slug },
      });

      return { suggestionId: suggestion!.id, message: "Ownership transfer suggestion saved for owner review" };
    }),

  suggestSetMemberRole: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "moderator", "member"]),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.slug), isNull(communities.deletedAt)),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const actorMembership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!actorMembership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is not a member" });
      }

      const target = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found or not active" });
      }

      if (
        !canManageRole(actorMembership.role as CommunityRole, target.role as CommunityRole) ||
        !canManageRole(actorMembership.role as CommunityRole, input.role)
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for this role change" });
      }

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "community_action",
          title: `Change role in ${community.name}`,
          content: input.reason,
          metadata: {
            action: "set_member_role",
            communitySlug: input.slug,
            communityId: community.id,
            targetUserId: input.userId,
            role: input.role,
            currentRole: target.role,
          },
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_community_action",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: { action: "set_member_role", communitySlug: input.slug, role: input.role },
      });

      return { suggestionId: suggestion!.id, message: "Role change suggestion saved for owner review" };
    }),
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-communities.ts
git commit -m "feat(mcp): add destructive admin suggestion procedures (ghost mode)"
```

---

### Task 5: Feed Agent Procedures

**Files:**
- Create: `src/server/api/routers/agent-feed.ts`

- [ ] **Step 1: Create agent-feed.ts with all 5 feed procedures**

```typescript
// src/server/api/routers/agent-feed.ts
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { agentProcedure, requireScope } from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  agentProfiles,
  agentDrafts,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { logActivity } from "@/server/agent/activity";

export const agentFeedRouter = {
  browseFeed: agentProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z
          .object({ createdAt: z.string().datetime(), id: z.number() })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const payload = await getPayloadClient();

      const conditions: Record<string, unknown>[] = [
        { communityId: { equals: community.id } },
        { isDeleted: { not_equals: true } },
      ];

      if (input.cursor) {
        conditions.push({
          createdAt: { less_than: input.cursor.createdAt },
        });
      }

      const { docs } = await payload.find({
        collection: "feed-posts",
        where: { and: conditions },
        sort: "-createdAt",
        limit: input.limit,
        depth: 0,
      });

      return docs.map((p) => ({
        id: p.id,
        content: p.content,
        imageUrl: (p as Record<string, unknown>).imageUrl ?? null,
        authorId: (p as Record<string, unknown>).authorId ?? null,
        authorName: (p as Record<string, unknown>).authorName ?? null,
        likeCount: (p as Record<string, unknown>).likeCount ?? 0,
        commentCount: (p as Record<string, unknown>).commentCount ?? 0,
        isEdited: (p as Record<string, unknown>).isEdited ?? false,
        createdAt: p.createdAt,
      }));
    }),

  getFeedComments: agentProcedure
    .input(
      z.object({
        postId: z.number(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await getPayloadClient();

      const { docs } = await payload.find({
        collection: "feed-comments",
        where: {
          and: [
            { post: { equals: input.postId } },
            { isDeleted: { not_equals: true } },
          ],
        },
        sort: "createdAt",
        limit: input.limit,
        depth: 0,
      });

      return docs.map((c) => ({
        id: c.id,
        content: (c as Record<string, unknown>).content ?? "",
        authorId: (c as Record<string, unknown>).authorId ?? null,
        authorName: (c as Record<string, unknown>).authorName ?? null,
        isEdited: (c as Record<string, unknown>).isEdited ?? false,
        createdAt: c.createdAt,
      }));
    }),

  createFeedPost: agentProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        content: z.string().min(1).max(2000),
        imageUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is not a member of this community" });
      }

      if (
        community.feedPostPolicy === "admins_only" &&
        membership.role !== "owner" &&
        membership.role !== "admin" &&
        membership.role !== "moderator"
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and moderators can post to this feed" });
      }

      // Check ghost mode
      const [agent] = await ctx.db
        .select({ visibilityMode: agentProfiles.visibilityMode, name: agentProfiles.name })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (agent?.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: ctx.agent.agentId,
            ownerId: ctx.agent.ownerId,
            type: "feed_post",
            targetType: "community",
            targetId: community.id,
            content: input.content,
            metadata: { communitySlug: input.communitySlug, imageUrl: input.imageUrl },
          })
          .returning();

        return { mode: "draft" as const, draftId: draft!.id };
      }

      const payload = await getPayloadClient();
      await payload.create({
        collection: "feed-posts",
        data: {
          content: input.content,
          imageUrl: input.imageUrl,
          authorId: ctx.agent.ownerId,
          authorName: agent?.name ? `${agent.name} (AI)` : "AI Agent",
          communityId: community.id,
        } as Record<string, unknown>,
      });

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "feed.post_created",
        targetType: "community",
        targetId: community.id,
        metadata: { communitySlug: input.communitySlug },
      });

      return { mode: "visible" as const, posted: true };
    }),

  commentOnFeedPost: agentProcedure
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const payload = await getPayloadClient();

      let post;
      try {
        post = await payload.findByID({ collection: "feed-posts", id: input.postId, depth: 0 });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      const communityId = (post as Record<string, unknown>).communityId as string;

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is not a member of this community" });
      }

      // Check ghost mode
      const [agent] = await ctx.db
        .select({ visibilityMode: agentProfiles.visibilityMode, name: agentProfiles.name })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (agent?.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: ctx.agent.agentId,
            ownerId: ctx.agent.ownerId,
            type: "feed_comment",
            targetType: "feed-posts",
            targetId: String(input.postId),
            content: input.content,
          })
          .returning();

        return { mode: "draft" as const, draftId: draft!.id };
      }

      await payload.create({
        collection: "feed-comments",
        data: {
          post: input.postId,
          content: input.content,
          authorId: ctx.agent.ownerId,
          authorName: agent?.name ? `${agent.name} (AI)` : "AI Agent",
          communityId,
        } as Record<string, unknown>,
      });

      // Increment comment count on the post
      await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          commentCount: ((post as Record<string, unknown>).commentCount as number ?? 0) + 1,
        } as Record<string, unknown>,
      });

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "feed.comment_created",
        targetType: "feed-posts",
        targetId: String(input.postId),
      });

      return { mode: "visible" as const, posted: true };
    }),

  toggleFeedLike: agentProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const payload = await getPayloadClient();

      let post;
      try {
        post = await payload.findByID({ collection: "feed-posts", id: input.postId, depth: 0 });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      const communityId = (post as Record<string, unknown>).communityId as string;

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, ctx.agent.ownerId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner is not a member of this community" });
      }

      // Check existing like
      const { docs: existingLikes } = await payload.find({
        collection: "feed-likes",
        where: {
          and: [
            { post: { equals: input.postId } },
            { userId: { equals: ctx.agent.ownerId } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      const currentLikeCount = (post as Record<string, unknown>).likeCount as number ?? 0;

      if (existingLikes.length > 0) {
        // Unlike
        await payload.delete({ collection: "feed-likes", id: existingLikes[0]!.id });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: Math.max(0, currentLikeCount - 1) } as Record<string, unknown>,
        });
        return { liked: false, likeCount: Math.max(0, currentLikeCount - 1) };
      } else {
        // Like
        await payload.create({
          collection: "feed-likes",
          data: {
            post: input.postId,
            userId: ctx.agent.ownerId,
          } as Record<string, unknown>,
        });
        await payload.update({
          collection: "feed-posts",
          id: input.postId,
          data: { likeCount: currentLikeCount + 1 } as Record<string, unknown>,
        });
        return { liked: true, likeCount: currentLikeCount + 1 };
      }
    }),
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `agent-feed.ts`

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/agent-feed.ts
git commit -m "feat(mcp): add feed agent procedures (browse, post, comment, like)"
```

---

### Task 6: Merge New Routers into Agent Router

**Files:**
- Modify: `src/server/api/routers/agent.ts` (lines 1-2, 70-71, 2358)

- [ ] **Step 1: Add imports at top of agent.ts**

Add after line 35 (after the existing imports):

```typescript
import { agentCommunityRouter } from "./agent-communities";
import { agentFeedRouter } from "./agent-feed";
```

- [ ] **Step 2: Spread the new routers into createTRPCRouter**

At line 2358, the file ends with `});`. Change the closing of the router to spread the new procedure objects. Replace line 2358:

```typescript
// Before:
});

// After:
  ...agentCommunityRouter,
  ...agentFeedRouter,
});
```

This spreads all community and feed procedures into the main agent router.

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(mcp): merge community and feed routers into agent router"
```

---

### Task 7: Extend Existing Agent Procedures with communitySlug

**Files:**
- Modify: `src/server/api/routers/agent.ts` (lines 76-115, 179-217, 219-253, 255-363)

- [ ] **Step 1: Add communitySlug to browseThreads (lines 76-115)**

Add `communitySlug: z.string().optional()` to the input schema (after `limit`). Add community filtering logic inside the query handler. The input becomes:

```typescript
  browseThreads: agentProcedure
    .input(
      z.object({
        category: z
          .enum(["all", "general", "question", "showcase", "job"])
          .default("all"),
        limit: z.number().min(1).max(50).default(20),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      // Resolve community if scoped
      let communityId: string | undefined;
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
        }
        communityId = community.id;
      }

      const payload = await getPayloadClient();

      const conditions: Record<string, unknown>[] = [];
      if (input.category !== "all") {
        conditions.push({ category: { equals: input.category } });
      }
      if (communityId) {
        conditions.push({ communityId: { equals: communityId } });
      }

      const where = conditions.length > 0 ? { and: conditions } : undefined;

      const { docs } = await payload.find({
        collection: "forum-threads",
        where,
        sort: "-lastActivityAt",
        limit: input.limit,
        depth: 0,
      });

      return docs.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        authorName: t.authorName ?? null,
        authorId: t.authorId ?? null,
        replyCount: t.replyCount ?? 0,
        isPinned: t.isPinned ?? false,
        isLocked: t.isLocked ?? false,
        lastActivityAt: t.lastActivityAt ?? null,
        createdAt: t.createdAt,
      }));
    }),
```

This requires adding `communities` and `isNull` to the imports from `@/server/db/schema` and `drizzle-orm` respectively. Check if they're already imported — `isNull` is not in the current imports at line 2 (`eq, and, desc, ilike, sql`). Add `isNull` to the drizzle-orm import. `communities` is not in the schema import at lines 6-30 — add it.

Add to line 2:

```typescript
import { eq, and, desc, ilike, sql, isNull } from "drizzle-orm";
```

Add `communities` to the schema import block (line 6-30):

```typescript
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  agentSessionLogs,
  memberProfiles,
  activityEvents,
  communities,
  communityMemberships,
  // ... rest unchanged
```

- [ ] **Step 2: Add communitySlug to browseEvents (lines 179-217)**

Same pattern — add `communitySlug: z.string().optional()` to input, resolve community, add `communityId` condition:

```typescript
  browseEvents: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(10),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      let communityId: string | undefined;
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
        }
        communityId = community.id;
      }

      const payload = await getPayloadClient();
      const now = new Date().toISOString();

      const conditions: Record<string, unknown>[] = [
        { status: { equals: "published" } },
        { date: { greater_than_equal: now } },
      ];
      if (communityId) {
        conditions.push({ communityId: { equals: communityId } });
      }

      const { docs } = await payload.find({
        collection: "events",
        where: { and: conditions },
        sort: "date",
        limit: input.limit,
        locale: "en",
        draft: false,
        depth: 0,
      });

      return docs.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        location: e.location,
        maxAttendees: e.maxAttendees ?? null,
        descriptionEn: richTextSnippet(e.description, 500),
      }));
    }),
```

- [ ] **Step 3: Add communitySlug to browseMembers (lines 219-253)**

When `communitySlug` is provided, query from `communityMemberships` joined with `memberProfiles` instead of querying `memberProfiles` directly:

```typescript
  browseMembers: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        search: z.string().optional(),
        communitySlug: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      // Community-scoped member browsing
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
        }

        const conditions = [
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.status, "active"),
        ];

        const members = await ctx.db
          .select({
            userId: communityMemberships.userId,
            role: communityMemberships.role,
            joinedAt: communityMemberships.joinedAt,
            displayName: memberProfiles.displayName,
            bio: memberProfiles.bio,
            xp: memberProfiles.xp,
            level: memberProfiles.level,
          })
          .from(communityMemberships)
          .leftJoin(memberProfiles, eq(communityMemberships.userId, memberProfiles.userId))
          .where(and(...conditions))
          .orderBy(desc(communityMemberships.joinedAt))
          .limit(input.limit);

        return members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName ?? null,
          bio: m.bio ?? null,
          skills: null,
          company: null,
          xp: m.xp ?? 0,
          level: m.level ?? 1,
          role: m.role,
        }));
      }

      // Global member browsing (original logic)
      const conditions = [eq(memberProfiles.isPublic, true)];

      if (input.search) {
        conditions.push(
          ilike(memberProfiles.displayName, `%${input.search}%`),
        );
      }

      const profiles = await ctx.db
        .select()
        .from(memberProfiles)
        .where(and(...conditions))
        .orderBy(sql`${memberProfiles.xp} DESC`)
        .limit(input.limit);

      return profiles.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        bio: p.bio ?? null,
        skills: p.skills,
        company: p.company ?? null,
        xp: p.xp,
        level: p.level,
      }));
    }),
```

- [ ] **Step 4: Add communitySlug to searchKnowledge (lines 255-363)**

Add `communitySlug: z.string().optional()` to input. When provided, add `communityId` filter to all three Payload queries (threads, articles, ideas):

Add to input schema:
```typescript
communitySlug: z.string().optional(),
```

Add community resolution at the start of the query handler (after `requireScope`):
```typescript
      let communityId: string | undefined;
      if (input.communitySlug) {
        const community = await ctx.db.query.communities.findFirst({
          where: and(
            eq(communities.slug, input.communitySlug),
            isNull(communities.deletedAt),
          ),
        });
        if (!community) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
        }
        communityId = community.id;
      }
```

Then in each Payload query's `where` clause, add `communityId` filter when present. For threads (line 281-292):
```typescript
        const threadConditions: Record<string, unknown>[] = [
          { or: [
            { title: { contains: input.query } },
            { content: { contains: input.query } },
          ] },
        ];
        if (communityId) {
          threadConditions.push({ communityId: { equals: communityId } });
        }
        const { docs } = await payload.find({
          collection: "forum-threads",
          where: { and: threadConditions },
          limit: perType,
          sort: "-createdAt",
          depth: 0,
        });
```

Apply the same pattern to articles and ideas queries.

- [ ] **Step 5: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(mcp): add communitySlug scoping to browseThreads, browseEvents, browseMembers, searchKnowledge"
```

---

### Task 8: Community MCP Tool Registrations

**Files:**
- Create: `src/app/api/mcp/community-tools.ts`

- [ ] **Step 1: Create community-tools.ts**

```typescript
// src/app/api/mcp/community-tools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";

type Caller = ReturnType<typeof createCaller>;

export function registerCommunityTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string; agentId: string },
): void {
  // ── Community read tools ────────────────────────────────────────────────

  server.registerTool("browse-communities", {
    description:
      "Browse listed communities. Returns communities sorted by newest first with member counts.",
    inputSchema: {
      search: z.string().optional().describe("Optional search term for community name."),
      limit: z.number().min(1).max(50).default(20).describe("Max communities to return."),
    },
  }, async ({ search, limit }) => {
    const result = await caller.agent.browseCommunities({ search, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-community-info", {
    description:
      "Get detailed info about a community including description, join policy, member count, and your owner's membership status.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.getCommunityInfo({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-owner-communities", {
    description:
      "List all communities your owner belongs to, with their role and membership status.",
  }, async () => {
    const result = await caller.agent.getOwnerCommunities();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community membership tools ──────────────────────────────────────────

  server.registerTool("join-community", {
    description:
      "Join an open community on behalf of your owner.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.joinCommunity({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("request-to-join-community", {
    description:
      "Request to join a community that requires approval.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.requestToJoinCommunity({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("leave-community", {
    description:
      "Leave a community on behalf of your owner. Cannot leave if owner is the last owner.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.leaveCommunity({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("accept-community-invite", {
    description:
      "Accept a community invite link on behalf of your owner.",
    inputSchema: {
      code: z.string().describe("The invite code from the invite link."),
    },
  }, async ({ code }) => {
    const result = await caller.agent.acceptCommunityInvite({ code });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community creation ──────────────────────────────────────────────────

  server.registerTool("create-community", {
    description:
      "Create a new community. Your owner becomes the owner of the community.",
    inputSchema: {
      name: z.string().min(2).max(100).describe("Community name."),
      description: z.string().max(500).optional().describe("Community description."),
      joinPolicy: z.enum(["open", "invite_only", "approval_required"]).default("open")
        .describe("How new members can join."),
      isListedInDirectory: z.boolean().default(false)
        .describe("Whether the community appears in the public directory."),
    },
  }, async ({ name, description, joinPolicy, isListedInDirectory }) => {
    const result = await caller.agent.createCommunity({ name, description, joinPolicy, isListedInDirectory });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community admin tools ───────────────────────────────────────────────

  server.registerTool("update-community-settings", {
    description:
      "Update community settings. Requires owner or admin role. At least one field must be provided.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      name: z.string().min(2).max(100).optional().describe("New community name."),
      description: z.string().max(500).optional().describe("New description."),
      logoUrl: z.string().url().optional().nullable().describe("New logo URL (null to remove)."),
      joinPolicy: z.enum(["open", "invite_only", "approval_required"]).optional()
        .describe("New join policy."),
      isListedInDirectory: z.boolean().optional().describe("Whether to list in directory."),
    },
  }, async ({ slug, name, description, logoUrl, joinPolicy, isListedInDirectory }) => {
    const result = await caller.agent.updateCommunitySettings({ slug, name, description, logoUrl, joinPolicy, isListedInDirectory });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-community-invites", {
    description:
      "List active invite links for a community. Requires admin or owner role.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
    },
  }, async ({ slug }) => {
    const result = await caller.agent.getCommunityInviteLinks({ slug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("create-community-invite", {
    description:
      "Create a new invite link for a community. Requires moderator role or above.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      maxUses: z.number().int().positive().optional().describe("Max number of uses. Unlimited if omitted."),
      expiresInDays: z.number().int().positive().optional().describe("Expires after N days. Never if omitted."),
    },
  }, async ({ slug, maxUses, expiresInDays }) => {
    const result = await caller.agent.createCommunityInviteLink({ slug, maxUses, expiresInDays });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("revoke-community-invite", {
    description:
      "Revoke an invite link for a community. Requires moderator role or above.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      inviteId: z.string().describe("The invite ID to revoke."),
    },
  }, async ({ slug, inviteId }) => {
    const result = await caller.agent.revokeCommunityInviteLink({ slug, inviteId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Community admin suggestions (ghost mode) ────────────────────────────

  server.registerTool("suggest-ban-member", {
    description:
      "Suggest banning a member from a community. Saved for owner review (not executed immediately). Requires sufficient role.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      userId: z.string().describe("User ID of the member to ban."),
      reason: z.string().min(1).max(500).describe("Reason for the ban."),
    },
  }, async ({ slug, userId, reason }) => {
    const result = await caller.agent.suggestBanMember({ slug, userId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-remove-member", {
    description:
      "Suggest removing a member from a community. Saved for owner review (not executed immediately). Requires sufficient role.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      userId: z.string().describe("User ID of the member to remove."),
      reason: z.string().min(1).max(500).describe("Reason for removal."),
    },
  }, async ({ slug, userId, reason }) => {
    const result = await caller.agent.suggestRemoveMember({ slug, userId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-transfer-ownership", {
    description:
      "Suggest transferring community ownership to another member. Saved for owner review. Only available when owner has owner role.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      userId: z.string().describe("User ID of the new owner."),
      reason: z.string().min(1).max(500).describe("Reason for the transfer."),
    },
  }, async ({ slug, userId, reason }) => {
    const result = await caller.agent.suggestTransferOwnership({ slug, userId, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("suggest-set-member-role", {
    description:
      "Suggest changing a member's role in a community. Saved for owner review. Requires sufficient role hierarchy.",
    inputSchema: {
      slug: z.string().describe("Community URL slug."),
      userId: z.string().describe("User ID of the member."),
      role: z.enum(["admin", "moderator", "member"]).describe("New role."),
      reason: z.string().min(1).max(500).describe("Reason for the role change."),
    },
  }, async ({ slug, userId, role, reason }) => {
    const result = await caller.agent.suggestSetMemberRole({ slug, userId, role, reason });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/community-tools.ts
git commit -m "feat(mcp): add community MCP tool registrations (16 tools)"
```

---

### Task 9: Feed MCP Tool Registrations

**Files:**
- Create: `src/app/api/mcp/feed-tools.ts`

- [ ] **Step 1: Create feed-tools.ts**

```typescript
// src/app/api/mcp/feed-tools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";

type Caller = ReturnType<typeof createCaller>;

export function registerFeedTools(
  server: McpServer,
  caller: Caller,
  _keyData: { ownerId: string; agentId: string },
): void {
  // ── Feed read tools ─────────────────────────────────────────────────────

  server.registerTool("browse-feed", {
    description:
      "Browse posts in a community's feed. Returns posts sorted by newest first.",
    inputSchema: {
      communitySlug: z.string().describe("Community URL slug."),
      limit: z.number().min(1).max(50).default(20).describe("Max posts to return."),
      cursor: z
        .object({
          createdAt: z.string().describe("ISO-8601 timestamp cursor."),
          id: z.number().describe("Post ID cursor."),
        })
        .optional()
        .describe("Pagination cursor from previous response."),
    },
  }, async ({ communitySlug, limit, cursor }) => {
    const result = await caller.agent.browseFeed({ communitySlug, limit, cursor });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-feed-comments", {
    description:
      "Get comments on a feed post, sorted oldest first.",
    inputSchema: {
      postId: z.number().describe("Feed post ID."),
      limit: z.number().min(1).max(100).default(50).describe("Max comments to return."),
    },
  }, async ({ postId, limit }) => {
    const result = await caller.agent.getFeedComments({ postId, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Feed write tools ────────────────────────────────────────────────────

  server.registerTool("create-feed-post", {
    description:
      "Post to a community's feed. In ghost mode, saves as draft for owner review. Respects the community's feed post policy.",
    inputSchema: {
      communitySlug: z.string().describe("Community URL slug."),
      content: z.string().min(1).max(2000).describe("Post content (plain text)."),
      imageUrl: z.string().url().optional().describe("Optional image URL."),
    },
  }, async ({ communitySlug, content, imageUrl }) => {
    const result = await caller.agent.createFeedPost({ communitySlug, content, imageUrl });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("comment-on-feed-post", {
    description:
      "Comment on a feed post. In ghost mode, saves as draft for owner review.",
    inputSchema: {
      postId: z.number().describe("Feed post ID."),
      content: z.string().min(1).max(1000).describe("Comment content."),
    },
  }, async ({ postId, content }) => {
    const result = await caller.agent.commentOnFeedPost({ postId, content });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("toggle-feed-like", {
    description:
      "Like or unlike a feed post on behalf of your owner. If already liked, unlikes it. Always executes directly (not affected by ghost mode).",
    inputSchema: {
      postId: z.number().describe("Feed post ID."),
    },
  }, async ({ postId }) => {
    const result = await caller.agent.toggleFeedLike({ postId });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/feed-tools.ts
git commit -m "feat(mcp): add feed MCP tool registrations (5 tools)"
```

---

### Task 10: Wire Domain Modules into MCP Route + Update Existing Tools

**Files:**
- Modify: `src/app/api/mcp/route.ts` (lines 1-35, 39-52, 65-74, 76-86, 88-102, 488-490)

- [ ] **Step 1: Add imports to route.ts**

Add after line 9 (after `createTRPCContext` import):

```typescript
import { registerCommunityTools } from "./community-tools";
import { registerFeedTools } from "./feed-tools";
```

- [ ] **Step 2: Bump version and call domain modules**

Change line 34 from `version: "0.3.0"` to:

```typescript
    version: "0.4.0",
```

Before `return server;` (line 490), add:

```typescript
  // ── Community & Feed tools (domain modules) ────────────────────────────
  registerCommunityTools(server, caller, keyData);
  registerFeedTools(server, caller, keyData);
```

- [ ] **Step 3: Add communitySlug to existing MCP tool schemas**

Update the `browse-threads` tool registration (lines 39-52). Add `communitySlug` to the inputSchema and pass it to the caller:

```typescript
  server.registerTool("browse-threads", {
    description:
      "Browse recent forum threads. Returns threads sorted by most recent activity. Optionally filter to a specific community.",
    inputSchema: {
      category: z
        .enum(["all", "general", "question", "showcase", "job"])
        .default("all")
        .describe("Filter threads by category."),
      limit: z.number().min(1).max(50).default(20).describe("Max threads to return."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ category, limit, communitySlug }) => {
    const result = await caller.agent.browseThreads({ category, limit, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
```

Update `browse-events` (lines 65-74):

```typescript
  server.registerTool("browse-events", {
    description:
      "Browse upcoming community events sorted by date. Optionally filter to a specific community.",
    inputSchema: {
      limit: z.number().min(1).max(20).default(10).describe("Max events to return."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ limit, communitySlug }) => {
    const result = await caller.agent.browseEvents({ limit, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
```

Update `browse-members` (lines 76-86):

```typescript
  server.registerTool("browse-members", {
    description:
      "Browse public member profiles sorted by XP. Optionally filter to a specific community's members.",
    inputSchema: {
      limit: z.number().min(1).max(50).default(20).describe("Max members to return."),
      search: z.string().optional().describe("Optional search term for display name."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ limit, search, communitySlug }) => {
    const result = await caller.agent.browseMembers({ limit, search, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
```

Update `search-knowledge` (lines 88-102):

```typescript
  server.registerTool("search-knowledge", {
    description:
      "Search across community threads, articles, and ideas. Returns matching results with snippets. Optionally scope to a specific community.",
    inputSchema: {
      query: z.string().min(1).max(200).describe("Search query."),
      type: z
        .enum(["threads", "articles", "ideas", "all"])
        .default("all")
        .describe("Restrict to a content type, or 'all'."),
      limit: z.number().min(1).max(20).default(10).describe("Max results."),
      communitySlug: z.string().optional().describe("Optional community slug to scope results."),
    },
  }, async ({ query, type, limit, communitySlug }) => {
    const result = await caller.agent.searchKnowledge({ query, type, limit, communitySlug });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "feat(mcp): wire community/feed modules into route, add communitySlug to 4 existing tools, bump to v0.4.0"
```

---

### Task 11: Final Verification

**Files:** All new and modified files

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors across the entire project

- [ ] **Step 2: Verify tool count**

Count the total number of `registerTool` calls across all MCP files:

```bash
grep -c "registerTool" src/app/api/mcp/route.ts src/app/api/mcp/community-tools.ts src/app/api/mcp/feed-tools.ts
```

Expected:
- `route.ts`: 30 (existing)
- `community-tools.ts`: 16
- `feed-tools.ts`: 5
- Total: 51

- [ ] **Step 3: Verify router merge**

Check that all new procedures are accessible through the agent router by grepping for them:

```bash
grep -E "browseCommunities|getCommunityInfo|joinCommunity|browseFeed|toggleFeedLike" src/server/api/routers/agent-communities.ts src/server/api/routers/agent-feed.ts
```

Expected: All procedure names found in their respective files

- [ ] **Step 4: Verify communitySlug was added to all 4 existing procedures**

```bash
grep -n "communitySlug" src/server/api/routers/agent.ts | head -20
```

Expected: 4+ occurrences across `browseThreads`, `browseEvents`, `browseMembers`, `searchKnowledge`
