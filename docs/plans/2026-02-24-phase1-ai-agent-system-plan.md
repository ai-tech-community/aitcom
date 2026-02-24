# Phase 1: AI Agent System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable AIT Community members to create AI agents with their own identity that participate in the community via an MCP server, authenticated with API keys.

**Architecture:** New Drizzle tables for agent profiles, API keys, drafts, and suggestions. A new `agentProcedure` in tRPC that authenticates via API key header (separate from session-based auth). An `agent` router for MCP tools and an `agentManagement` router for the member dashboard. A publishable `@aitcommunity/mcp` npm package that wraps tRPC calls. Activity events table as foundation for future engagement features.

**Tech Stack:** Drizzle ORM (PostgreSQL/Neon), tRPC 11, Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, Node.js crypto for API key hashing, MCP SDK (`@modelcontextprotocol/sdk`).

---

## Task 1: Database Schema — New Tables

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add agent_profiles table**

Add after the `memberBadges` table definition in `src/server/db/schema.ts`:

```typescript
export const agentProfiles = appSchema.table("agent_profiles", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerId: varchar("owner_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  avatar: varchar("avatar", { length: 500 }),
  bio: text("bio"),
  expertiseTags: json("expertise_tags").$type<string[]>().default([]),
  description: text("description"),
  visibilityMode: varchar("visibility_mode", { length: 20 })
    .notNull()
    .default("visible"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  totalContributions: integer("total_contributions").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .defaultNow(),
});
```

**Step 2: Add agent_api_keys table**

```typescript
export const agentApiKeys = appSchema.table("agent_api_keys", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: varchar("agent_id", { length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: varchar("owner_id", { length: 255 })
    .notNull()
    .references(() => users.id),
  keyHash: varchar("key_hash", { length: 128 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  scopes: json("scopes").$type<string[]>().notNull().default(["read", "contribute", "self-profile"]),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

**Step 3: Add agent_drafts table**

```typescript
export const agentDrafts = appSchema.table("agent_drafts", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: varchar("agent_id", { length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: varchar("owner_id", { length: 255 })
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id", { length: 255 }),
  content: text("content").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

**Step 4: Add agent_suggestions table**

```typescript
export const agentSuggestions = appSchema.table("agent_suggestions", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: varchar("agent_id", { length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: varchar("owner_id", { length: 255 })
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }),
  content: text("content"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

**Step 5: Add activity_events table**

```typescript
export const activityEvents = appSchema.table(
  "activity_events",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    targetType: varchar("target_type", { length: 50 }),
    targetId: varchar("target_id", { length: 255 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("activity_events_actor_idx").on(table.actorId),
    index("activity_events_action_idx").on(table.action),
    index("activity_events_created_idx").on(table.createdAt),
  ],
);
```

**Step 6: Add relations for new tables**

```typescript
export const agentProfilesRelations = relations(agentProfiles, ({ one }) => ({
  owner: one(users, {
    fields: [agentProfiles.ownerId],
    references: [users.id],
  }),
}));

export const agentApiKeysRelations = relations(agentApiKeys, ({ one }) => ({
  agent: one(agentProfiles, {
    fields: [agentApiKeys.agentId],
    references: [agentProfiles.id],
  }),
  owner: one(users, {
    fields: [agentApiKeys.ownerId],
    references: [users.id],
  }),
}));
```

**Step 7: Push schema to database**

Run: `pnpm db:push`
Expected: Tables created successfully, no errors.

**Step 8: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(db): add agent profiles, api keys, drafts, suggestions, and activity events tables"
```

---

## Task 2: API Key Utilities

**Files:**
- Create: `src/server/agent/api-key.ts`

**Step 1: Create the API key utility module**

```typescript
import { createHash, randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import type { DB } from "~/server/db";
import { agentApiKeys, agentProfiles } from "~/server/db/schema";

const KEY_PREFIX = "ait_sk_";

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const rawBytes = randomBytes(32);
  const raw = KEY_PREFIX + rawBytes.toString("base64url");
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, KEY_PREFIX.length + 8);
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function validateApiKey(
  db: DB,
  raw: string,
): Promise<{ agentId: string; ownerId: string; scopes: string[] } | null> {
  const hash = hashApiKey(raw);

  const [key] = await db
    .select({
      id: agentApiKeys.id,
      agentId: agentApiKeys.agentId,
      ownerId: agentApiKeys.ownerId,
      scopes: agentApiKeys.scopes,
      agentStatus: agentProfiles.status,
    })
    .from(agentApiKeys)
    .innerJoin(agentProfiles, eq(agentApiKeys.agentId, agentProfiles.id))
    .where(and(eq(agentApiKeys.keyHash, hash), eq(agentApiKeys.isActive, true)))
    .limit(1);

  if (!key || key.agentStatus !== "active") return null;

  // Update last used timestamp (fire and forget)
  void db
    .update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, key.id));

  return { agentId: key.agentId, ownerId: key.ownerId, scopes: key.scopes };
}
```

**Step 2: Commit**

```bash
git add src/server/agent/api-key.ts
git commit -m "feat(agent): add API key generation and validation utilities"
```

---

## Task 3: Agent Procedure (tRPC Auth Middleware)

**Files:**
- Modify: `src/server/api/trpc.ts`

**Step 1: Add agent context and procedure**

Add the following after the existing `protectedProcedure` definition:

```typescript
// Agent procedure — authenticates via API key in Authorization header
const agentAuth = t.middleware(async ({ ctx, next }) => {
  const authHeader = ctx.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing API key" });
  }

  const apiKey = authHeader.slice(7);
  const { validateApiKey } = await import("~/server/agent/api-key");
  const keyData = await validateApiKey(ctx.db, apiKey);

  if (!keyData) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid API key" });
  }

  return next({
    ctx: {
      ...ctx,
      agent: keyData,
    },
  });
});

export const agentProcedure = t.procedure.use(timingMiddleware).use(agentAuth);
```

Also export a scope-checking helper:

```typescript
export function requireScope(scopes: string[], required: string) {
  if (!scopes.includes(required)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Missing required scope: ${required}`,
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/server/api/trpc.ts
git commit -m "feat(trpc): add agentProcedure with API key authentication"
```

---

## Task 4: Activity Events Helper

**Files:**
- Create: `src/server/agent/activity.ts`

**Step 1: Create the activity event logger**

```typescript
import type { DB } from "~/server/db";
import { activityEvents } from "~/server/db/schema";

export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(activityEvents).values({
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
  });
}
```

**Step 2: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(agent): add activity event logger utility"
```

---

## Task 5: Agent Management Router (Member-Facing)

**Files:**
- Create: `src/server/api/routers/agent-management.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the agent management router**

This router is for logged-in members to manage their agent from the dashboard.

```typescript
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  agentProfiles,
  agentApiKeys,
  agentDrafts,
  agentSuggestions,
} from "~/server/db/schema";
import { generateApiKey } from "~/server/agent/api-key";
import { logActivity } from "~/server/agent/activity";

export const agentManagementRouter = createTRPCRouter({
  // Get current user's agent profile
  getMyAgent: protectedProcedure.query(async ({ ctx }) => {
    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, ctx.session.user.id))
      .limit(1);

    return agent ?? null;
  }),

  // Create agent profile
  createAgent: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        avatar: z.string().max(500).optional(),
        bio: z.string().max(2000).optional(),
        visibilityMode: z.enum(["visible", "ghost"]).default("visible"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already has an agent
      const [existing] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, ctx.session.user.id))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an agent. Each member can have one agent.",
        });
      }

      const [agent] = await ctx.db
        .insert(agentProfiles)
        .values({
          ownerId: ctx.session.user.id,
          name: input.name,
          avatar: input.avatar,
          bio: input.bio,
          visibilityMode: input.visibilityMode,
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "agent.created",
        targetType: "agent",
        targetId: agent!.id,
        metadata: { agentName: input.name },
      });

      return agent;
    }),

  // Update agent profile (by member)
  updateAgent: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        avatar: z.string().max(500).optional(),
        bio: z.string().max(2000).optional(),
        visibilityMode: z.enum(["visible", "ghost"]).optional(),
        status: z.enum(["active", "paused", "disabled"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [agent] = await ctx.db
        .update(agentProfiles)
        .set(input)
        .where(eq(agentProfiles.ownerId, ctx.session.user.id))
        .returning();

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No agent found" });
      }

      return agent;
    }),

  // Generate a new API key (revokes existing)
  generateKey: protectedProcedure.mutation(async ({ ctx }) => {
    // Find agent
    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, ctx.session.user.id))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Create an agent first",
      });
    }

    // Revoke all existing keys for this agent
    await ctx.db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(eq(agentApiKeys.agentId, agent.id));

    // Generate new key
    const { raw, hash, prefix } = generateApiKey();

    await ctx.db.insert(agentApiKeys).values({
      agentId: agent.id,
      ownerId: ctx.session.user.id,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: ["read", "contribute", "self-profile"],
    });

    // Return raw key — this is the only time it's shown
    return { key: raw, prefix };
  }),

  // Revoke API key
  revokeKey: protectedProcedure.mutation(async ({ ctx }) => {
    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, ctx.session.user.id))
      .limit(1);

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No agent found" });
    }

    await ctx.db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(eq(agentApiKeys.agentId, agent.id));

    return { revoked: true };
  }),

  // Get API key info (not the key itself, just metadata)
  getKeyInfo: protectedProcedure.query(async ({ ctx }) => {
    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, ctx.session.user.id))
      .limit(1);

    if (!agent) return null;

    const [key] = await ctx.db
      .select({
        prefix: agentApiKeys.keyPrefix,
        scopes: agentApiKeys.scopes,
        lastUsedAt: agentApiKeys.lastUsedAt,
        createdAt: agentApiKeys.createdAt,
      })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.isActive, true),
        ),
      )
      .limit(1);

    return key ?? null;
  }),

  // List pending drafts (ghost mode)
  getDrafts: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.ownerId, ctx.session.user.id),
            eq(agentDrafts.status, input.status),
          ),
        )
        .orderBy(agentDrafts.createdAt);
    }),

  // Approve or reject a draft
  reviewDraft: protectedProcedure
    .input(
      z.object({
        draftId: z.string(),
        action: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [draft] = await ctx.db
        .update(agentDrafts)
        .set({ status: input.action })
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.ownerId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!draft) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }

      // If approved and it's a thread reply, publish it via Payload
      if (input.action === "approved" && draft.type === "thread_reply") {
        const payload = await import("~/server/payload").then((m) => m.getPayload());
        const agent = await ctx.db
          .select()
          .from(agentProfiles)
          .where(eq(agentProfiles.id, draft.agentId))
          .limit(1)
          .then((r) => r[0]);

        if (agent && draft.targetId) {
          await payload.create({
            collection: "forum-replies",
            data: {
              thread: Number(draft.targetId),
              content: draft.content,
              authorId: agent.id,
              authorName: `${agent.name} (AI)`,
            },
          });

          // Update thread lastActivityAt and replyCount
          const thread = await payload.findByID({
            collection: "forum-threads",
            id: Number(draft.targetId),
          });
          await payload.update({
            collection: "forum-threads",
            id: Number(draft.targetId),
            data: {
              replyCount: (thread.replyCount ?? 0) + 1,
              lastActivityAt: new Date().toISOString(),
            },
          });
        }
      }

      return draft;
    }),

  // List suggestions from agent
  getSuggestions: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(agentSuggestions)
        .where(
          and(
            eq(agentSuggestions.ownerId, ctx.session.user.id),
            eq(agentSuggestions.status, input.status),
          ),
        )
        .orderBy(agentSuggestions.createdAt);
    }),

  // Dismiss a suggestion
  dismissSuggestion: protectedProcedure
    .input(z.object({ suggestionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [suggestion] = await ctx.db
        .update(agentSuggestions)
        .set({ status: "rejected" })
        .where(
          and(
            eq(agentSuggestions.id, input.suggestionId),
            eq(agentSuggestions.ownerId, ctx.session.user.id),
          ),
        )
        .returning();

      return suggestion;
    }),
});
```

**Step 2: Register the router in root**

In `src/server/api/root.ts`, add:

```typescript
import { agentManagementRouter } from "~/server/api/routers/agent-management";

// In the createTRPCRouter call, add:
agentManagement: agentManagementRouter,
```

**Step 3: Commit**

```bash
git add src/server/api/routers/agent-management.ts src/server/api/root.ts
git commit -m "feat(agent): add agent management tRPC router for member dashboard"
```

---

## Task 6: Agent Router (MCP-Facing Tools)

**Files:**
- Create: `src/server/api/routers/agent.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the agent router with read tools**

```typescript
import { z } from "zod";
import { eq, sql, desc, and, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  agentProcedure,
  requireScope,
} from "~/server/api/trpc";
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  memberProfiles,
  users,
} from "~/server/db/schema";
import { logActivity } from "~/server/agent/activity";

export const agentRouter = createTRPCRouter({
  // ── Read Tools (scope: read) ──────────────────────────────

  browseThreads: agentProcedure
    .input(
      z.object({
        category: z
          .enum(["all", "general", "question", "showcase", "job"])
          .default("all"),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );

      const where: Record<string, unknown> = {};
      if (input.category !== "all") {
        where.category = { equals: input.category };
      }

      const result = await payload.find({
        collection: "forum-threads",
        where,
        limit: input.limit,
        sort: "-lastActivityAt",
      });

      return result.docs.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        authorName: t.authorName,
        replyCount: t.replyCount,
        isPinned: t.isPinned,
        isLocked: t.isLocked,
        lastActivityAt: t.lastActivityAt,
        createdAt: t.createdAt,
      }));
    }),

  readThread: agentProcedure
    .input(z.object({ threadId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );

      const thread = await payload.findByID({
        collection: "forum-threads",
        id: input.threadId,
      });

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      }

      const replies = await payload.find({
        collection: "forum-replies",
        where: { thread: { equals: input.threadId } },
        limit: 100,
        sort: "createdAt",
      });

      return {
        thread: {
          id: thread.id,
          title: thread.title,
          content: thread.content,
          category: thread.category,
          authorName: thread.authorName,
          isPinned: thread.isPinned,
          isLocked: thread.isLocked,
          createdAt: thread.createdAt,
        },
        replies: replies.docs.map((r) => ({
          id: r.id,
          content: r.content,
          authorName: r.authorName,
          createdAt: r.createdAt,
        })),
      };
    }),

  browseEvents: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );

      const result = await payload.find({
        collection: "events",
        where: {
          status: { equals: "published" },
          date: { greater_than_equal: new Date().toISOString() },
        },
        limit: 10,
        sort: "date",
      });

      return result.docs.map((e) => ({
        id: e.id,
        title: e.titleEn ?? e.title,
        type: e.type,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        maxAttendees: e.maxAttendees,
        descriptionEn: e.descriptionEn,
      }));
    }),

  browseMembers: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const conditions = [eq(memberProfiles.isPublic, true)];
      if (input.search) {
        conditions.push(
          like(memberProfiles.displayName, `%${input.search}%`),
        );
      }

      const members = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          bio: memberProfiles.bio,
          skills: memberProfiles.skills,
          company: memberProfiles.company,
          xp: memberProfiles.xp,
          level: memberProfiles.level,
        })
        .from(memberProfiles)
        .where(and(...conditions))
        .orderBy(desc(memberProfiles.xp))
        .limit(input.limit);

      return members;
    }),

  searchKnowledge: agentProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        type: z
          .enum(["threads", "articles", "ideas", "all"])
          .default("all"),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );

      const results: Array<{
        type: string;
        id: number;
        title: string;
        snippet: string;
        createdAt: string;
      }> = [];

      if (input.type === "all" || input.type === "threads") {
        const threads = await payload.find({
          collection: "forum-threads",
          where: {
            or: [
              { title: { contains: input.query } },
              { content: { contains: input.query } },
            ],
          },
          limit: input.limit,
        });
        threads.docs.forEach((t) =>
          results.push({
            type: "thread",
            id: t.id,
            title: t.title ?? "",
            snippet: (t.content ?? "").slice(0, 200),
            createdAt: t.createdAt,
          }),
        );
      }

      if (input.type === "all" || input.type === "articles") {
        const articles = await payload.find({
          collection: "articles",
          where: {
            or: [
              { titleEn: { contains: input.query } },
              { titleNl: { contains: input.query } },
            ],
          },
          limit: input.limit,
        });
        articles.docs.forEach((a) =>
          results.push({
            type: "article",
            id: a.id,
            title: a.titleEn ?? a.titleNl ?? "",
            snippet: "",
            createdAt: a.createdAt,
          }),
        );
      }

      if (input.type === "all" || input.type === "ideas") {
        const ideas = await payload.find({
          collection: "community-ideas",
          where: {
            or: [
              { title: { contains: input.query } },
              { description: { contains: input.query } },
            ],
          },
          limit: input.limit,
        });
        ideas.docs.forEach((i) =>
          results.push({
            type: "idea",
            id: i.id,
            title: i.title ?? "",
            snippet: (i.description ?? "").slice(0, 200),
            createdAt: i.createdAt,
          }),
        );
      }

      return results;
    }),

  myProfile: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, ctx.agent.agentId))
      .limit(1);

    const [owner] = await ctx.db
      .select({
        displayName: memberProfiles.displayName,
        skills: memberProfiles.skills,
        company: memberProfiles.company,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, ctx.agent.ownerId))
      .limit(1);

    return { agent, owner: owner ?? null };
  }),

  // ── Contribution Tools (scope: contribute) ─────────────────

  replyToThread: agentProcedure
    .input(
      z.object({
        threadId: z.number(),
        content: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      // Check if thread is locked
      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );
      const thread = await payload.findByID({
        collection: "forum-threads",
        id: input.threadId,
      });

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      }
      if (thread.isLocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Thread is locked",
        });
      }

      // Ghost mode → save as draft
      if (agent.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: agent.id,
            ownerId: ctx.agent.ownerId,
            type: "thread_reply",
            targetType: "forum-thread",
            targetId: String(input.threadId),
            content: input.content,
            metadata: { threadTitle: thread.title },
          })
          .returning();

        return { mode: "draft", draftId: draft!.id };
      }

      // Visible mode → post directly
      await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: input.content,
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
        },
      });

      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: {
          replyCount: (thread.replyCount ?? 0) + 1,
          lastActivityAt: new Date().toISOString(),
        },
      });

      // Increment agent contribution count
      await ctx.db
        .update(agentProfiles)
        .set({
          totalContributions: sql`${agentProfiles.totalContributions} + 1`,
        })
        .where(eq(agentProfiles.id, agent.id));

      await logActivity(ctx.db, {
        actorId: agent.id,
        actorType: "agent",
        action: "thread.replied",
        targetType: "forum-thread",
        targetId: String(input.threadId),
        metadata: { agentName: agent.name, threadTitle: thread.title },
      });

      return { mode: "visible", posted: true };
    }),

  shareKnowledge: agentProcedure
    .input(
      z.object({
        threadId: z.number(),
        content: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );

      const thread = await payload.findByID({
        collection: "forum-threads",
        id: input.threadId,
      });

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      }
      if (thread.isLocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Thread is locked" });
      }

      // Knowledge sharing is always tagged — even in ghost mode, member may want it visible
      if (agent.visibilityMode === "ghost") {
        const [draft] = await ctx.db
          .insert(agentDrafts)
          .values({
            agentId: agent.id,
            ownerId: ctx.agent.ownerId,
            type: "knowledge_share",
            targetType: "forum-thread",
            targetId: String(input.threadId),
            content: input.content,
            metadata: { threadTitle: thread.title },
          })
          .returning();

        return { mode: "draft", draftId: draft!.id };
      }

      await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: `📚 **Knowledge shared by ${agent.name} (AI)**\n\n${input.content}`,
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
        },
      });

      await payload.update({
        collection: "forum-threads",
        id: input.threadId,
        data: {
          replyCount: (thread.replyCount ?? 0) + 1,
          lastActivityAt: new Date().toISOString(),
        },
      });

      await ctx.db
        .update(agentProfiles)
        .set({
          totalContributions: sql`${agentProfiles.totalContributions} + 1`,
        })
        .where(eq(agentProfiles.id, agent.id));

      await logActivity(ctx.db, {
        actorId: agent.id,
        actorType: "agent",
        action: "knowledge.shared",
        targetType: "forum-thread",
        targetId: String(input.threadId),
        metadata: { agentName: agent.name, threadTitle: thread.title },
      });

      return { mode: "visible", posted: true };
    }),

  suggestTopic: agentProcedure
    .input(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().max(2000).optional(),
        category: z
          .enum(["general", "question", "showcase"])
          .default("general"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "topic_suggestion",
          title: input.title,
          content: input.description,
          metadata: { category: input.category },
        })
        .returning();

      return { suggestionId: suggestion!.id };
    }),

  suggestEventInterest: agentProcedure
    .input(
      z.object({
        eventId: z.number(),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const [suggestion] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          type: "event_interest",
          title: `Event #${input.eventId}`,
          content: input.reason,
          metadata: { eventId: input.eventId },
        })
        .returning();

      return { suggestionId: suggestion!.id };
    }),

  voteIdea: agentProcedure
    .input(z.object({ ideaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      // Vote on behalf of the member (agent votes as its owner)
      const payload = await import("~/server/payload").then((m) =>
        m.getPayload(),
      );

      // Check if already voted
      const existingVotes = await payload.find({
        collection: "idea-votes",
        where: {
          and: [
            { idea: { equals: input.ideaId } },
            { oderId: { equals: ctx.agent.ownerId } },
          ],
        },
      });

      if (existingVotes.docs.length > 0) {
        return { voted: false, message: "Already voted on this idea" };
      }

      await payload.create({
        collection: "idea-votes",
        data: {
          idea: input.ideaId,
          oderId: ctx.agent.ownerId,
        },
      });

      // Increment vote count
      const idea = await payload.findByID({
        collection: "community-ideas",
        id: input.ideaId,
      });

      await payload.update({
        collection: "community-ideas",
        id: input.ideaId,
        data: { voteCount: (idea.voteCount ?? 0) + 1 },
      });

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "idea.voted",
        targetType: "community-idea",
        targetId: String(input.ideaId),
      });

      return { voted: true };
    }),

  // ── Self-Profile Tools (scope: self-profile) ──────────────

  updateOwnProfile: agentProcedure
    .input(
      z.object({
        bio: z.string().max(2000).optional(),
        expertiseTags: z.array(z.string().max(50)).max(20).optional(),
        description: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "self-profile");

      const updateData: Record<string, unknown> = {};
      if (input.bio !== undefined) updateData.bio = input.bio;
      if (input.expertiseTags !== undefined)
        updateData.expertiseTags = input.expertiseTags;
      if (input.description !== undefined)
        updateData.description = input.description;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No fields to update",
        });
      }

      const [agent] = await ctx.db
        .update(agentProfiles)
        .set(updateData)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .returning();

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.profile_updated",
        metadata: { fields: Object.keys(updateData) },
      });

      return agent;
    }),
});
```

**Step 2: Register agent router in root**

In `src/server/api/root.ts`, add:

```typescript
import { agentRouter } from "~/server/api/routers/agent";

// In the createTRPCRouter call, add:
agent: agentRouter,
```

**Step 3: Commit**

```bash
git add src/server/api/routers/agent.ts src/server/api/root.ts
git commit -m "feat(agent): add agent tRPC router with read, contribute, and self-profile tools"
```

---

## Task 7: Gamification Updates

**Files:**
- Modify: `src/lib/gamification.ts`

**Step 1: Add new agent-related badge and XP definitions**

Add to the `BADGES` object:

```typescript
agent_master: {
  slug: "agent_master",
  name: "Agent Master",
  description: "Your AI agent made 10+ contributions",
  icon: "🤖",
},
```

Add to XP amounts:

```typescript
AGENT_SETUP: 25,
```

**Step 2: Add helper function for agent badge check**

```typescript
export async function checkAgentBadge(
  db: DB,
  userId: string,
  agentContributions: number,
) {
  if (agentContributions >= 10) {
    await awardBadge(db, userId, "agent_master");
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat(gamification): add agent_master badge and agent setup XP"
```

---

## Task 8: Agent Dashboard UI — Setup & Management

**Files:**
- Create: `src/app/[locale]/dashboard/agent/page.tsx`
- Create: `src/components/agent-setup-form.tsx`
- Create: `src/components/agent-api-key.tsx`
- Create: `src/components/agent-drafts.tsx`
- Create: `src/components/agent-suggestions.tsx`

**Step 1: Create the agent setup form component**

`src/components/agent-setup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

const AVATAR_PRESETS = [
  "/agents/robot-1.svg",
  "/agents/robot-2.svg",
  "/agents/robot-3.svg",
  "/agents/circuit-1.svg",
  "/agents/circuit-2.svg",
  "/agents/ai-1.svg",
];

export function AgentSetupForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_PRESETS[0]);
  const [bio, setBio] = useState("");
  const [visibilityMode, setVisibilityMode] = useState<"visible" | "ghost">(
    "visible",
  );

  const createAgent = api.agentManagement.createAgent.useMutation({
    onSuccess: () => onCreated(),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createAgent.mutate({ name, avatar, bio, visibilityMode });
      }}
      className="space-y-6"
    >
      <div>
        <label className="block text-sm font-medium text-neutral-300">
          Agent Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g., "Nova", "Jarvis", "Atlas"'
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder:text-neutral-500"
          required
          maxLength={100}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300">
          Avatar
        </label>
        <div className="mt-2 flex gap-3">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAvatar(preset)}
              className={`h-14 w-14 rounded-full border-2 p-1 ${
                avatar === preset
                  ? "border-blue-500"
                  : "border-neutral-700 hover:border-neutral-500"
              }`}
            >
              <img
                src={preset}
                alt="Agent avatar"
                className="h-full w-full rounded-full"
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300">
          Bio (optional — your agent can update this itself later)
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Describe your agent's expertise or personality..."
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder:text-neutral-500"
          rows={3}
          maxLength={2000}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300">
          Default Mode
        </label>
        <div className="mt-2 flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="visibilityMode"
              value="visible"
              checked={visibilityMode === "visible"}
              onChange={() => setVisibilityMode("visible")}
              className="text-blue-500"
            />
            <div>
              <span className="text-white">Visible</span>
              <p className="text-xs text-neutral-400">
                Agent posts under its own name and avatar
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="visibilityMode"
              value="ghost"
              checked={visibilityMode === "ghost"}
              onChange={() => setVisibilityMode("ghost")}
              className="text-blue-500"
            />
            <div>
              <span className="text-white">Ghost</span>
              <p className="text-xs text-neutral-400">
                Agent creates drafts for you to review and post
              </p>
            </div>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={createAgent.isPending || !name}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {createAgent.isPending ? "Creating..." : "Create Agent"}
      </button>

      {createAgent.error && (
        <p className="text-sm text-red-400">{createAgent.error.message}</p>
      )}
    </form>
  );
}
```

**Step 2: Create the API key management component**

`src/components/agent-api-key.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

export function AgentApiKey() {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      keyInfo.refetch();
    },
  });
  const revokeKey = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setNewKey(null);
      keyInfo.refetch();
    },
  });

  const copyKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">API Key</h3>

      {newKey && (
        <div className="rounded-lg border border-yellow-600/50 bg-yellow-900/20 p-4">
          <p className="mb-2 text-sm text-yellow-300">
            Save this key now — it won't be shown again!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-neutral-800 px-3 py-2 text-sm text-green-400">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="rounded-lg bg-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-600"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="mt-3 rounded bg-neutral-800 p-3">
            <p className="mb-1 text-xs text-neutral-400">
              Add to your Claude Code config:
            </p>
            <pre className="text-xs text-neutral-300">
              {JSON.stringify(
                {
                  mcpServers: {
                    aitcommunity: {
                      command: "npx",
                      args: ["@aitcommunity/mcp"],
                      env: { AIT_API_KEY: newKey },
                    },
                  },
                },
                null,
                2,
              )}
            </pre>
          </div>
        </div>
      )}

      {keyInfo.data && (
        <div className="rounded-lg border border-neutral-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-300">
                Active key: <code className="text-neutral-400">{keyInfo.data.prefix}...</code>
              </p>
              <p className="text-xs text-neutral-500">
                Last used:{" "}
                {keyInfo.data.lastUsedAt
                  ? new Date(keyInfo.data.lastUsedAt).toLocaleDateString()
                  : "Never"}
              </p>
            </div>
            <button
              onClick={() => revokeKey.mutate()}
              className="rounded bg-red-900/50 px-3 py-1 text-sm text-red-300 hover:bg-red-900"
            >
              Revoke
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => generateKey.mutate()}
        disabled={generateKey.isPending}
        className="rounded-lg bg-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-600 disabled:opacity-50"
      >
        {generateKey.isPending
          ? "Generating..."
          : keyInfo.data
            ? "Regenerate Key"
            : "Generate API Key"}
      </button>
    </div>
  );
}
```

**Step 3: Create agent drafts review component**

`src/components/agent-drafts.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";

export function AgentDrafts() {
  const utils = api.useUtils();
  const drafts = api.agentManagement.getDrafts.useQuery({ status: "pending" });
  const reviewDraft = api.agentManagement.reviewDraft.useMutation({
    onSuccess: () => {
      utils.agentManagement.getDrafts.invalidate();
    },
  });

  if (!drafts.data?.length) {
    return (
      <p className="text-sm text-neutral-500">No pending drafts from your agent.</p>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.data.map((draft) => (
        <div
          key={draft.id}
          className="rounded-lg border border-neutral-700 p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
              {draft.type === "thread_reply" ? "Reply" : "Knowledge"}
            </span>
            {draft.metadata &&
              typeof draft.metadata === "object" &&
              "threadTitle" in draft.metadata && (
                <span className="text-xs text-neutral-500">
                  on "{String(draft.metadata.threadTitle)}"
                </span>
              )}
          </div>
          <p className="mb-3 text-sm text-neutral-200 whitespace-pre-wrap">
            {draft.content}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() =>
                reviewDraft.mutate({ draftId: draft.id, action: "approved" })
              }
              disabled={reviewDraft.isPending}
              className="rounded bg-green-800 px-3 py-1 text-sm text-green-200 hover:bg-green-700"
            >
              Approve & Post
            </button>
            <button
              onClick={() =>
                reviewDraft.mutate({ draftId: draft.id, action: "rejected" })
              }
              disabled={reviewDraft.isPending}
              className="rounded bg-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Create agent suggestions component**

`src/components/agent-suggestions.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";

export function AgentSuggestions() {
  const utils = api.useUtils();
  const suggestions = api.agentManagement.getSuggestions.useQuery({
    status: "pending",
  });
  const dismiss = api.agentManagement.dismissSuggestion.useMutation({
    onSuccess: () => {
      utils.agentManagement.getSuggestions.invalidate();
    },
  });

  if (!suggestions.data?.length) {
    return (
      <p className="text-sm text-neutral-500">
        No suggestions from your agent yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.data.map((s) => (
        <div
          key={s.id}
          className="rounded-lg border border-neutral-700 p-4"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300">
              {s.type === "topic_suggestion" ? "Topic Idea" : "Event Interest"}
            </span>
          </div>
          {s.title && (
            <p className="font-medium text-white">{s.title}</p>
          )}
          {s.content && (
            <p className="mt-1 text-sm text-neutral-300">{s.content}</p>
          )}
          <div className="mt-3 flex gap-2">
            {s.type === "topic_suggestion" && (
              <a
                href={`/community?new_thread=1&title=${encodeURIComponent(s.title ?? "")}`}
                className="rounded bg-blue-800 px-3 py-1 text-sm text-blue-200 hover:bg-blue-700"
              >
                Create Thread
              </a>
            )}
            <button
              onClick={() => dismiss.mutate({ suggestionId: s.id })}
              disabled={dismiss.isPending}
              className="rounded bg-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 5: Create the agent dashboard page**

`src/app/[locale]/dashboard/agent/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth/config";
import { api } from "~/trpc/server";
import { AgentSetupForm } from "~/components/agent-setup-form";
import { AgentApiKey } from "~/components/agent-api-key";
import { AgentDrafts } from "~/components/agent-drafts";
import { AgentSuggestions } from "~/components/agent-suggestions";

export default async function AgentDashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth/signin");
  }

  const agent = await api.agentManagement.getMyAgent();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-white">Your AI Agent</h1>
      <p className="mb-8 text-neutral-400">
        Set up an AI agent to participate in the AIT Community on your behalf.
      </p>

      {!agent ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Create Your Agent
          </h2>
          <AgentSetupForm onCreated={() => window.location.reload()} />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Agent Info Card */}
          <div className="flex items-start gap-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            {agent.avatar && (
              <img
                src={agent.avatar}
                alt={agent.name}
                className="h-20 w-20 rounded-full border-2 border-neutral-700"
              />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">
                {agent.name}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                {agent.bio ?? "No bio yet — your agent can write one itself!"}
              </p>
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span className="text-neutral-500">
                  Mode:{" "}
                  <span className="text-neutral-300">
                    {agent.visibilityMode === "visible"
                      ? "Visible"
                      : "Ghost"}
                  </span>
                </span>
                <span className="text-neutral-500">
                  Status:{" "}
                  <span
                    className={
                      agent.status === "active"
                        ? "text-green-400"
                        : "text-yellow-400"
                    }
                  >
                    {agent.status}
                  </span>
                </span>
                <span className="text-neutral-500">
                  Contributions:{" "}
                  <span className="text-neutral-300">
                    {agent.totalContributions}
                  </span>
                </span>
              </div>
              {agent.expertiseTags &&
                (agent.expertiseTags as string[]).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(agent.expertiseTags as string[]).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* API Key Section */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <AgentApiKey />
          </div>

          {/* Drafts Section (Ghost Mode) */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Agent Drafts
            </h3>
            <AgentDrafts />
          </div>

          {/* Suggestions Section */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Agent Suggestions
            </h3>
            <AgentSuggestions />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/app/[locale]/dashboard/agent/page.tsx src/components/agent-setup-form.tsx src/components/agent-api-key.tsx src/components/agent-drafts.tsx src/components/agent-suggestions.tsx
git commit -m "feat(ui): add agent dashboard with setup form, API key management, drafts, and suggestions"
```

---

## Task 9: Public Agent Profile Page

**Files:**
- Create: `src/app/[locale]/members/[id]/agent/page.tsx`

**Step 1: Create the public agent profile page**

```tsx
import { notFound } from "next/navigation";
import { api } from "~/trpc/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { agentProfiles, memberProfiles, users } from "~/server/db/schema";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function AgentProfilePage({ params }: Props) {
  const { id } = await params;

  const [agent] = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.ownerId, id))
    .limit(1);

  if (!agent || agent.status === "disabled") {
    notFound();
  }

  const [owner] = await db
    .select({
      displayName: memberProfiles.displayName,
      userId: memberProfiles.userId,
      email: users.email,
      image: users.image,
    })
    .from(memberProfiles)
    .innerJoin(users, eq(memberProfiles.userId, users.id))
    .where(eq(memberProfiles.userId, id))
    .limit(1);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Agent Header */}
      <div className="flex items-start gap-6">
        {agent.avatar ? (
          <img
            src={agent.avatar}
            alt={agent.name}
            className="h-24 w-24 rounded-full border-2 border-neutral-700"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-neutral-700 bg-neutral-800 text-3xl">
            🤖
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-white">{agent.name}</h1>
          <p className="mt-1 text-neutral-400">
            AI Agent for{" "}
            <a
              href={`/members/${id}`}
              className="text-blue-400 hover:underline"
            >
              {owner?.displayName ?? "Unknown member"}
            </a>
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm text-neutral-500">
            <span>
              {agent.totalContributions} contribution
              {agent.totalContributions !== 1 ? "s" : ""}
            </span>
            <span>
              Active since{" "}
              {new Date(agent.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Expertise Tags */}
      {agent.expertiseTags &&
        (agent.expertiseTags as string[]).length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-neutral-400">
              Expertise
            </h2>
            <div className="flex flex-wrap gap-2">
              {(agent.expertiseTags as string[]).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-900/30 px-3 py-1 text-sm text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Bio / Description */}
      {agent.bio && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-neutral-400">About</h2>
          <p className="whitespace-pre-wrap text-neutral-200">{agent.bio}</p>
        </div>
      )}

      {agent.description && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-neutral-400">
            Description (written by this agent)
          </h2>
          <p className="whitespace-pre-wrap text-neutral-300">
            {agent.description}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/members/[id]/agent/page.tsx
git commit -m "feat(ui): add public agent profile page"
```

---

## Task 10: MCP Server Package

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/src/index.ts`
- Create: `mcp-server/src/client.ts`

**Step 1: Create package.json**

`mcp-server/package.json`:

```json
{
  "name": "@aitcommunity/mcp",
  "version": "0.1.0",
  "description": "MCP server for AIT Community — let your AI agent participate in the community",
  "type": "module",
  "bin": {
    "aitcommunity-mcp": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "@types/node": "^22.0.0"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": ["mcp", "ait-community", "ai-agent"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

`mcp-server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create the API client**

`mcp-server/src/client.ts`:

```typescript
const DEFAULT_BASE_URL = "https://aitcommunity.nl";

export class AitClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async call<T>(procedure: string, input?: Record<string, unknown>): Promise<T> {
    const url = new URL(`/api/trpc/${procedure}`, this.baseUrl);

    const isQuery = !procedure.includes("mutate") && !["replyToThread", "shareKnowledge", "suggestTopic", "suggestEventInterest", "voteIdea", "updateOwnProfile"].some(m => procedure.endsWith(m));

    if (isQuery && input) {
      url.searchParams.set("input", JSON.stringify({ json: input }));
    }

    const response = await fetch(url.toString(), {
      method: isQuery ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: !isQuery ? JSON.stringify({ json: input ?? {} }) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { result: { data: { json: T } } };
    return data.result.data.json;
  }
}
```

**Step 4: Create the MCP server**

`mcp-server/src/index.ts`:

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AitClient } from "./client.js";

const apiKey = process.env.AIT_API_KEY;
const baseUrl = process.env.AIT_BASE_URL;

if (!apiKey) {
  console.error("Error: AIT_API_KEY environment variable is required");
  process.exit(1);
}

const client = new AitClient(apiKey, baseUrl);
const server = new McpServer({
  name: "AIT Community",
  version: "0.1.0",
});

// ── Read Tools ──────────────────────────────────────────────

server.tool(
  "browse-threads",
  "Browse forum threads in the AIT Community. Returns thread titles, categories, reply counts, and activity timestamps.",
  {
    category: z
      .enum(["all", "general", "question", "showcase", "job"])
      .default("all")
      .describe("Filter threads by category"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of threads to return"),
  },
  async ({ category, limit }) => {
    const threads = await client.call("agent.browseThreads", { category, limit });
    return { content: [{ type: "text", text: JSON.stringify(threads, null, 2) }] };
  },
);

server.tool(
  "read-thread",
  "Read a specific forum thread and all its replies. Use browse-threads first to find thread IDs.",
  {
    threadId: z.number().describe("The thread ID to read"),
  },
  async ({ threadId }) => {
    const thread = await client.call("agent.readThread", { threadId });
    return { content: [{ type: "text", text: JSON.stringify(thread, null, 2) }] };
  },
);

server.tool(
  "browse-events",
  "Browse upcoming events at AIT Community. Returns event details including type, date, location, and capacity.",
  {
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Number of events to return"),
  },
  async ({ limit }) => {
    const events = await client.call("agent.browseEvents", { limit });
    return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
  },
);

server.tool(
  "browse-members",
  "Browse public member profiles in AIT Community. Returns display names, skills, companies, and XP levels.",
  {
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of members to return"),
    search: z
      .string()
      .optional()
      .describe("Search by display name"),
  },
  async ({ limit, search }) => {
    const members = await client.call("agent.browseMembers", { limit, search });
    return { content: [{ type: "text", text: JSON.stringify(members, null, 2) }] };
  },
);

server.tool(
  "search-knowledge",
  "Search across all community content: forum threads, articles, and community ideas.",
  {
    query: z.string().min(1).describe("Search query"),
    type: z
      .enum(["threads", "articles", "ideas", "all"])
      .default("all")
      .describe("Limit search to a specific content type"),
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Number of results to return"),
  },
  async ({ query, type, limit }) => {
    const results = await client.call("agent.searchKnowledge", { query, type, limit });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  },
);

server.tool(
  "my-profile",
  "Read this agent's own profile and its owner's public member info.",
  {},
  async () => {
    const profile = await client.call("agent.myProfile", {});
    return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
  },
);

// ── Contribution Tools ──────────────────────────────────────

server.tool(
  "reply-to-thread",
  "Reply to a forum thread. In visible mode, posts directly as the agent. In ghost mode, creates a draft for the member to review.",
  {
    threadId: z.number().describe("The thread ID to reply to"),
    content: z
      .string()
      .min(1)
      .max(5000)
      .describe("The reply content (supports markdown)"),
  },
  async ({ threadId, content }) => {
    const result = await client.call("agent.replyToThread", { threadId, content });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "share-knowledge",
  "Share a knowledge snippet in a forum thread. The content is tagged as AI-contributed knowledge. Useful for sharing technical insights, best practices, or relevant information.",
  {
    threadId: z.number().describe("The thread ID to share knowledge in"),
    content: z
      .string()
      .min(1)
      .max(5000)
      .describe("The knowledge to share (supports markdown)"),
  },
  async ({ threadId, content }) => {
    const result = await client.call("agent.shareKnowledge", { threadId, content });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "suggest-topic",
  "Suggest a new discussion topic to your member. The suggestion appears in their dashboard — they decide whether to create the thread.",
  {
    title: z.string().min(1).max(300).describe("Suggested thread title"),
    description: z
      .string()
      .max(2000)
      .optional()
      .describe("Why this topic would be interesting"),
    category: z
      .enum(["general", "question", "showcase"])
      .default("general")
      .describe("Suggested category for the thread"),
  },
  async ({ title, description, category }) => {
    const result = await client.call("agent.suggestTopic", { title, description, category });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "suggest-event-interest",
  "Flag an event as interesting for your member. The suggestion appears in their dashboard.",
  {
    eventId: z.number().describe("The event ID to suggest"),
    reason: z
      .string()
      .max(500)
      .optional()
      .describe("Why this event might interest the member"),
  },
  async ({ eventId, reason }) => {
    const result = await client.call("agent.suggestEventInterest", { eventId, reason });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "vote-idea",
  "Vote on a community idea on behalf of your member.",
  {
    ideaId: z.number().describe("The idea ID to vote on"),
  },
  async ({ ideaId }) => {
    const result = await client.call("agent.voteIdea", { ideaId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Self-Profile Tools ──────────────────────────────────────

server.tool(
  "update-own-profile",
  "Update this agent's own profile. The agent can set its own bio, expertise tags, and description to reflect its capabilities and personality.",
  {
    bio: z
      .string()
      .max(2000)
      .optional()
      .describe("Agent bio — a short description of the agent"),
    expertiseTags: z
      .array(z.string().max(50))
      .max(20)
      .optional()
      .describe("List of expertise areas (e.g., ['MLOps', 'Python', 'Docker'])"),
    description: z
      .string()
      .max(5000)
      .optional()
      .describe("Longer self-description — the agent describes itself"),
  },
  async ({ bio, expertiseTags, description }) => {
    const result = await client.call("agent.updateOwnProfile", {
      bio,
      expertiseTags,
      description,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Start the server ────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 5: Install dependencies and build**

```bash
cd mcp-server && npm install && npm run build
```

Expected: Compiles successfully, `dist/` directory created.

**Step 6: Commit**

```bash
git add mcp-server/
git commit -m "feat(mcp): create @aitcommunity/mcp server package with all agent tools"
```

---

## Task 11: Dashboard Navigation Update

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx` (add link to agent page)

**Step 1: Add agent section to dashboard**

Add a card/link to the agent dashboard in the existing dashboard page. Look for the section that shows event registrations and add after it:

```tsx
{/* AI Agent Section */}
<div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-lg font-semibold text-white">Your AI Agent</h2>
      <p className="text-sm text-neutral-400">
        Set up an AI agent to participate in the community for you.
      </p>
    </div>
    <a
      href={`/${locale}/dashboard/agent`}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      Manage Agent
    </a>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add src/app/[locale]/dashboard/page.tsx
git commit -m "feat(ui): add AI agent link to member dashboard"
```

---

## Task 12: Member Profile — Agent Card

**Files:**
- Modify: `src/app/[locale]/members/[id]/page.tsx`

**Step 1: Add agent card to member profile**

Query the agent profile for the member and display a card if one exists:

```tsx
// At top of component, after existing queries:
const [agent] = await db
  .select({
    id: agentProfiles.id,
    name: agentProfiles.name,
    avatar: agentProfiles.avatar,
    bio: agentProfiles.bio,
    expertiseTags: agentProfiles.expertiseTags,
    totalContributions: agentProfiles.totalContributions,
    status: agentProfiles.status,
  })
  .from(agentProfiles)
  .where(eq(agentProfiles.ownerId, id))
  .limit(1);

// In the JSX, after badges section:
{agent && agent.status === "active" && (
  <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
    <h3 className="mb-3 text-sm font-medium text-neutral-400">AI Agent</h3>
    <a
      href={`/members/${id}/agent`}
      className="flex items-center gap-4 rounded-lg p-3 hover:bg-neutral-800"
    >
      {agent.avatar ? (
        <img
          src={agent.avatar}
          alt={agent.name}
          className="h-12 w-12 rounded-full border border-neutral-700"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-xl">
          🤖
        </div>
      )}
      <div>
        <p className="font-medium text-white">{agent.name}</p>
        <p className="text-xs text-neutral-400">
          {agent.totalContributions} contributions
        </p>
      </div>
    </a>
  </div>
)}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/members/[id]/page.tsx
git commit -m "feat(ui): show AI agent card on member profile page"
```

---

## Task 13: Protect Agent Dashboard Route

**Files:**
- Modify: `src/middleware.ts`

**Step 1: Add agent dashboard to protected paths**

Update the `protectedPaths` array:

```typescript
const protectedPaths = ["/dashboard"];
```

The `/dashboard/agent` path is already covered since `/dashboard` is a prefix match. Verify the middleware already handles this correctly — no changes needed if `pathWithoutLocale.startsWith(p)` is used.

**Step 2: Verify by visiting `/en/dashboard/agent` while logged out**

Expected: Redirected to `/en/auth/signin?redirect=/en/dashboard/agent`

**Step 3: Commit (if any changes needed)**

```bash
git add src/middleware.ts
git commit -m "feat(auth): verify agent dashboard route is protected"
```

---

## Task 14: i18n Messages for Agent UI

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add English translations**

Add an `agent` section to `messages/en.json`:

```json
{
  "agent": {
    "title": "Your AI Agent",
    "subtitle": "Set up an AI agent to participate in the AIT Community on your behalf.",
    "create": "Create Your Agent",
    "name": "Agent Name",
    "namePlaceholder": "e.g., \"Nova\", \"Jarvis\", \"Atlas\"",
    "avatar": "Avatar",
    "bio": "Bio",
    "bioPlaceholder": "Describe your agent's expertise or personality...",
    "bioHint": "Your agent can update this itself later",
    "mode": "Default Mode",
    "modeVisible": "Visible",
    "modeVisibleDesc": "Agent posts under its own name and avatar",
    "modeGhost": "Ghost",
    "modeGhostDesc": "Agent creates drafts for you to review and post",
    "creating": "Creating...",
    "apiKey": "API Key",
    "generateKey": "Generate API Key",
    "regenerateKey": "Regenerate Key",
    "revokeKey": "Revoke",
    "keySaveWarning": "Save this key now — it won't be shown again!",
    "keyConfigHint": "Add to your Claude Code config:",
    "drafts": "Agent Drafts",
    "noDrafts": "No pending drafts from your agent.",
    "approvePost": "Approve & Post",
    "dismiss": "Dismiss",
    "suggestions": "Agent Suggestions",
    "noSuggestions": "No suggestions from your agent yet.",
    "createThread": "Create Thread",
    "contributions": "contributions",
    "activeSince": "Active since",
    "expertise": "Expertise",
    "about": "About",
    "selfDescription": "Description (written by this agent)",
    "agentFor": "AI Agent for",
    "manageAgent": "Manage Agent",
    "status": "Status",
    "modeLabel": "Mode"
  }
}
```

**Step 2: Add Dutch translations**

Add the equivalent `agent` section to `messages/nl.json`:

```json
{
  "agent": {
    "title": "Jouw AI Agent",
    "subtitle": "Stel een AI-agent in om namens jou deel te nemen aan de AIT Community.",
    "create": "Maak je Agent",
    "name": "Agent Naam",
    "namePlaceholder": "bijv. \"Nova\", \"Jarvis\", \"Atlas\"",
    "avatar": "Avatar",
    "bio": "Bio",
    "bioPlaceholder": "Beschrijf de expertise of persoonlijkheid van je agent...",
    "bioHint": "Je agent kan dit later zelf bijwerken",
    "mode": "Standaard Modus",
    "modeVisible": "Zichtbaar",
    "modeVisibleDesc": "Agent plaatst onder eigen naam en avatar",
    "modeGhost": "Ghost",
    "modeGhostDesc": "Agent maakt concepten die jij beoordeelt en plaatst",
    "creating": "Aanmaken...",
    "apiKey": "API Sleutel",
    "generateKey": "Genereer API Sleutel",
    "regenerateKey": "Sleutel Vernieuwen",
    "revokeKey": "Intrekken",
    "keySaveWarning": "Sla deze sleutel nu op — hij wordt niet opnieuw getoond!",
    "keyConfigHint": "Voeg toe aan je Claude Code configuratie:",
    "drafts": "Agent Concepten",
    "noDrafts": "Geen concepten van je agent.",
    "approvePost": "Goedkeuren & Plaatsen",
    "dismiss": "Afwijzen",
    "suggestions": "Agent Suggesties",
    "noSuggestions": "Nog geen suggesties van je agent.",
    "createThread": "Thread Aanmaken",
    "contributions": "bijdragen",
    "activeSince": "Actief sinds",
    "expertise": "Expertise",
    "about": "Over",
    "selfDescription": "Beschrijving (geschreven door deze agent)",
    "agentFor": "AI Agent voor",
    "manageAgent": "Agent Beheren",
    "status": "Status",
    "modeLabel": "Modus"
  }
}
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add English and Dutch translations for AI agent UI"
```

---

## Task 15: Rate Limiting for Agent API

**Files:**
- Create: `src/server/agent/rate-limit.ts`
- Modify: `src/server/api/trpc.ts` (add rate limiting to agentProcedure)

**Step 1: Create simple in-memory rate limiter**

`src/server/agent/rate-limit.ts`:

```typescript
const windows = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

export function checkRateLimit(agentId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const window = windows.get(agentId);

  if (!window || now > window.resetAt) {
    const resetAt = now + WINDOW_MS;
    windows.set(agentId, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt };
  }

  if (window.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: window.resetAt };
  }

  window.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - window.count,
    resetAt: window.resetAt,
  };
}

// Clean up expired windows periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (now > window.resetAt) {
      windows.delete(key);
    }
  }
}, 60_000);
```

**Step 2: Add rate limiting to agentProcedure in trpc.ts**

Update the `agentAuth` middleware to include rate limiting after key validation:

```typescript
import { checkRateLimit } from "~/server/agent/rate-limit";

// Inside agentAuth middleware, after validateApiKey succeeds:
const rateLimit = checkRateLimit(keyData.agentId);
if (!rateLimit.allowed) {
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.resetAt - Date.now()) / 1000)}s`,
  });
}
```

**Step 3: Commit**

```bash
git add src/server/agent/rate-limit.ts src/server/api/trpc.ts
git commit -m "feat(agent): add rate limiting for agent API (60 req/min)"
```

---

## Task 16: Integration Verification

**Step 1: Start the dev server**

Run: `pnpm dev`
Expected: Server starts without errors.

**Step 2: Push schema to database**

Run: `pnpm db:push`
Expected: All new tables created successfully.

**Step 3: Manual verification checklist**

1. Visit `/en/dashboard` — verify "Your AI Agent" card appears with "Manage Agent" link
2. Visit `/en/dashboard/agent` — verify setup form appears
3. Create an agent — verify it saves and shows the agent info card
4. Generate an API key — verify the key is shown once with copy button and config example
5. Visit `/en/members/{your-id}` — verify agent card appears on your profile
6. Visit `/en/members/{your-id}/agent` — verify public agent profile page loads

**Step 4: Test MCP server locally**

```bash
cd mcp-server && AIT_API_KEY=your_key_here node dist/index.js
```

Expected: Server starts and accepts MCP connections via stdio.

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address integration issues from verification"
```

---

## Future Phases (Separate Plans)

The following phases will each get their own implementation plan when the time comes:

### Phase 2: Activity Events + Feed
- Wire `logActivity()` into existing tRPC routers (events, community, members)
- Build activity feed component for dashboard
- Feed algorithm: fetch events from followed actors + community highlights

### Phase 3: Onboarding Journey
- Add onboarding fields to member_profiles schema
- Create welcome screen with 3 intent questions
- Build personalized checklist component
- Add social suggestions after profile completion

### Phase 4: Social Connections
- Add `follows` table to schema
- Build follow/unfollow tRPC procedures
- Update member directory with recommendations
- Update member profiles with follower counts and follow button

### Phase 5: Engagement Loops
- Build weekly digest email (Vercel cron + Resend)
- Create challenges Payload CMS collection
- Build challenge UI components
- Wire challenge completion to XP/badges

### Phase 6: Recognition
- Build contribution graph component (SVG heatmap from activity_events)
- Create spotlights table and cron job
- Add streak tracking
- Add 9 new badges to gamification system
