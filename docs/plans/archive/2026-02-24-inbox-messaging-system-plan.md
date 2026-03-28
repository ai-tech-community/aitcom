# Inbox Messaging System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the notebook panel with a LinkedIn-style inbox supporting member DMs and agent conversations in a unified multi-window UI.

**Architecture:** Unified `conversations` + `conversationParticipants` + `messages` tables replace `notebookMessages`. New `inbox` tRPC router replaces `notebook` router. React context (`InboxProvider`) manages open/minimized chat windows. LinkedIn-style floating panels: inbox pill → conversation list, up to 2 independent chat windows on desktop, fullscreen on mobile.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Tailwind CSS 4, tRPC 11, Drizzle ORM (Neon Postgres), next-intl, lucide-react, ai-elements component library.

---

### Task 1: Database Schema — New Tables

**Files:**
- Modify: `src/server/db/schema.ts`

**Context:** The codebase uses `appSchema = pgSchema("app")` with `varchar(255)` UUIDs via `crypto.randomUUID()`, `timestamp({ withTimezone: true })`, and separate `relations()` calls. See existing `notebookMessages` and `agentProfiles` tables for patterns.

**Step 1: Add the `conversations` table after the `notebookMessages` table definition**

```typescript
export const conversations = appSchema.table("conversation", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: d.varchar({ length: 10 }).notNull(), // "agent" | "dm"
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));
```

**Step 2: Add the `conversationParticipants` table**

```typescript
export const conversationParticipants = appSchema.table(
  "conversation_participant",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => conversations.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    joinedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lastReadAt: d.timestamp({ withTimezone: true }),
    isPinned: d.boolean().default(false).notNull(),
  }),
  (t) => [
    uniqueIndex("conv_participant_unique_idx").on(t.conversationId, t.userId),
    index("conv_participant_user_idx").on(t.userId),
  ],
);
```

**Step 3: Add the `messages` table**

```typescript
export const messages = appSchema.table(
  "message",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => conversations.id),
    senderId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    senderType: d.varchar({ length: 10 }).notNull().default("human"), // "human" | "agent"
    content: d.text().notNull(),
    metadata: d.json().$type<Record<string, unknown>>(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("messages_conv_created_idx").on(t.conversationId, t.createdAt),
  ],
);
```

**Step 4: Add relations for the new tables**

```typescript
export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(user, {
      fields: [conversationParticipants.userId],
      references: [user.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
  }),
}));
```

**Step 5: Add `canReadOwnerDMs` to `agentProfiles`**

In the `agentProfiles` table definition, add after the `lastActiveAt` field:

```typescript
canReadOwnerDMs: d.boolean().default(true).notNull(),
```

**Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean (no errors related to new tables)

**Step 7: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(db): add conversations, participants, messages tables for inbox system"
```

---

### Task 2: Database Migration — Create Tables in Neon

**Context:** The project uses Neon Serverless Postgres. Tables live in the `app` schema. Use Drizzle's `casing: "snake_case"` convention (camelCase in code → snake_case in DB). The Neon project ID is `muddy-truth-19293777`, org `org-odd-forest-17808561`.

**Step 1: Push schema changes to Neon**

Run: `npx drizzle-kit push`

This will create the three new tables and add the `can_read_owner_dms` column to `app.agent_profile`. Confirm the changes when prompted.

**Step 2: Verify tables exist**

Use the Neon MCP `run_sql` tool to verify:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'app'
ORDER BY table_name;
```

Expected: `conversation`, `conversation_participant`, `message` appear alongside existing tables.

**Step 3: Migrate existing `notebookMessages` data**

Run this SQL via `run_sql` to create agent conversations from existing notebook data:

```sql
-- Step A: Create one conversation per unique agentId in notebook_message
INSERT INTO app.conversation (id, type, created_at, updated_at)
SELECT DISTINCT
  gen_random_uuid()::text,
  'agent',
  MIN(created_at),
  MAX(created_at)
FROM app.notebook_message
GROUP BY agent_id;

-- Step B: Create a mapping temp table to link old agentId to new conversationId
CREATE TEMP TABLE agent_conv_map AS
SELECT
  nm.agent_id,
  c.id AS conversation_id,
  nm.owner_id
FROM app.conversation c
JOIN (
  SELECT DISTINCT agent_id, owner_id, MIN(created_at) AS min_created
  FROM app.notebook_message
  GROUP BY agent_id, owner_id
) nm ON c.created_at = nm.min_created AND c.type = 'agent';

-- Step C: Insert participants (owner + treat agent messages as owner with senderType)
INSERT INTO app.conversation_participant (id, conversation_id, user_id, joined_at, is_pinned)
SELECT
  gen_random_uuid()::text,
  m.conversation_id,
  m.owner_id,
  NOW(),
  true
FROM agent_conv_map m;

-- Step D: Migrate messages
INSERT INTO app.message (id, conversation_id, sender_id, sender_type, content, metadata, created_at)
SELECT
  nm.id,
  m.conversation_id,
  nm.owner_id,
  nm.role,
  nm.content,
  nm.metadata,
  nm.created_at
FROM app.notebook_message nm
JOIN agent_conv_map m ON nm.agent_id = m.agent_id;

-- Step E: Drop temp table
DROP TABLE agent_conv_map;
```

**Note:** The migration SQL above is a guide — if there are zero rows in `notebook_message` (likely in dev), it'll be a no-op. The important thing is the tables exist. Adjust the migration if needed based on actual data.

**Step 4: Commit** (no file changes — DB-only migration)

---

### Task 3: Inbox tRPC Router — Human-Facing Endpoints

**Files:**
- Create: `src/server/api/routers/inbox.ts`
- Modify: `src/server/api/root.ts`

**Context:** The router uses `protectedProcedure` for human endpoints, `agentProcedure` for agent endpoints. `ctx.session.user.id` gives the current user ID. `ctx.db` is the Drizzle database instance. `requireScope()` validates agent scopes. Import tables from `@/server/db/schema`.

**Step 1: Create the inbox router with human-facing endpoints**

Create `src/server/api/routers/inbox.ts`:

```typescript
import { z } from "zod";
import { eq, and, desc, lt, sql, ne, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  agentProcedure,
  requireScope,
} from "@/server/api/trpc";
import {
  conversations,
  conversationParticipants,
  messages,
  agentProfiles,
  memberProfiles,
  user,
} from "@/server/db/schema";

export const inboxRouter = createTRPCRouter({
  /**
   * listConversations — paginated list of user's conversations.
   * Returns conversations ordered by updatedAt desc with last message preview,
   * unread count, and participant info. Agent conversations flagged with isPinned.
   */
  listConversations: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get conversations where user is a participant
      const participantRows = await ctx.db
        .select({
          conversationId: conversationParticipants.conversationId,
          isPinned: conversationParticipants.isPinned,
          lastReadAt: conversationParticipants.lastReadAt,
        })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, userId));

      if (participantRows.length === 0) {
        return { conversations: [], nextCursor: null };
      }

      const convIds = participantRows.map((r) => r.conversationId);
      const pinnedMap = new Map(
        participantRows.map((r) => [r.conversationId, r.isPinned]),
      );
      const lastReadMap = new Map(
        participantRows.map((r) => [r.conversationId, r.lastReadAt]),
      );

      // Fetch conversations with conditions
      const conditions = convIds.map((id) => eq(conversations.id, id));
      const whereClause = conditions.length === 1
        ? conditions[0]!
        : or(...conditions)!;

      let query = ctx.db
        .select()
        .from(conversations)
        .where(
          input.cursor
            ? and(whereClause, lt(conversations.updatedAt, new Date(input.cursor)))
            : whereClause,
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(input.limit + 1);

      const convRows = await query;
      const hasMore = convRows.length > input.limit;
      const items = hasMore ? convRows.slice(0, input.limit) : convRows;
      const nextCursor = hasMore
        ? items[items.length - 1]!.updatedAt.toISOString()
        : null;

      // For each conversation, get: last message, other participant, unread count
      const enriched = await Promise.all(
        items.map(async (conv) => {
          // Last message
          const [lastMsg] = await ctx.db
            .select({
              content: messages.content,
              senderType: messages.senderType,
              createdAt: messages.createdAt,
              senderId: messages.senderId,
            })
            .from(messages)
            .where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          // Other participant(s)
          const otherParticipants = await ctx.db
            .select({
              userId: conversationParticipants.userId,
              displayName: memberProfiles.displayName,
              image: user.image,
              name: user.name,
            })
            .from(conversationParticipants)
            .leftJoin(
              memberProfiles,
              eq(conversationParticipants.userId, memberProfiles.userId),
            )
            .leftJoin(user, eq(conversationParticipants.userId, user.id))
            .where(
              and(
                eq(conversationParticipants.conversationId, conv.id),
                ne(conversationParticipants.userId, userId),
              ),
            );

          // Agent info (if agent conversation)
          let agentInfo = null;
          if (conv.type === "agent") {
            const [agent] = await ctx.db
              .select({
                id: agentProfiles.id,
                name: agentProfiles.name,
                avatar: agentProfiles.avatar,
                lastActiveAt: agentProfiles.lastActiveAt,
              })
              .from(agentProfiles)
              .where(eq(agentProfiles.ownerId, userId))
              .limit(1);
            agentInfo = agent ?? null;
          }

          // Unread count
          const lastReadAt = lastReadMap.get(conv.id);
          const unreadConditions = [eq(messages.conversationId, conv.id)];
          if (lastReadAt) {
            unreadConditions.push(
              sql`${messages.createdAt} > ${lastReadAt}`,
            );
          }
          // Don't count own messages as unread
          unreadConditions.push(
            or(
              ne(messages.senderId, userId),
              ne(messages.senderType, "human"),
            )!,
          );

          const [unreadRow] = await ctx.db
            .select({ count: sql<number>`count(*)` })
            .from(messages)
            .where(and(...unreadConditions));

          return {
            id: conv.id,
            type: conv.type,
            updatedAt: conv.updatedAt.toISOString(),
            isPinned: pinnedMap.get(conv.id) ?? false,
            lastMessage: lastMsg
              ? {
                  content: lastMsg.content,
                  senderType: lastMsg.senderType,
                  senderId: lastMsg.senderId,
                  createdAt: lastMsg.createdAt.toISOString(),
                }
              : null,
            participants: otherParticipants.map((p) => ({
              userId: p.userId,
              displayName: p.displayName ?? p.name ?? "Unknown",
              image: p.image,
            })),
            agentInfo,
            unreadCount: unreadRow?.count ?? 0,
          };
        }),
      );

      // Sort: pinned first, then by updatedAt
      enriched.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0; // already ordered by updatedAt from query
      });

      return { conversations: enriched, nextCursor };
    }),

  /**
   * getMessages — paginated messages for a conversation.
   * Cursor-based, returns oldest-first. Updates lastReadAt.
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.string().nullable().default(null),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is a participant
      const [participant] = await ctx.db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .limit(1);

      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      const conditions = [eq(messages.conversationId, input.conversationId)];
      if (input.cursor) {
        conditions.push(lt(messages.createdAt, new Date(input.cursor)));
      }

      const rows = await ctx.db
        .select()
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      items.reverse(); // chronological order

      // Update lastReadAt (fire-and-forget)
      ctx.db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .then(() => {}, () => {});

      return { messages: items, nextCursor, hasMore };
    }),

  /**
   * sendMessage — send a message in an existing conversation.
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is a participant
      const [participant] = await ctx.db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .limit(1);

      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: userId,
          senderType: "human",
          content: input.content,
        })
        .returning();

      // Update conversation.updatedAt
      await ctx.db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      // Update sender's lastReadAt
      ctx.db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .then(() => {}, () => {});

      return message!;
    }),

  /**
   * startConversation — find or create a DM conversation with another member.
   */
  startConversation: protectedProcedure
    .input(
      z.object({
        recipientId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.recipientId === userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot message yourself" });
      }

      // Check if DM conversation already exists between these two users
      const myConvs = await ctx.db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, userId));

      for (const mc of myConvs) {
        const [other] = await ctx.db
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, mc.conversationId),
              eq(conversationParticipants.userId, input.recipientId),
            ),
          )
          .limit(1);

        if (other) {
          // Check it's a DM (not agent conversation)
          const [conv] = await ctx.db
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.id, mc.conversationId),
                eq(conversations.type, "dm"),
              ),
            )
            .limit(1);

          if (conv) {
            return { conversationId: conv.id, created: false };
          }
        }
      }

      // Create new DM conversation
      const [conv] = await ctx.db
        .insert(conversations)
        .values({ type: "dm" })
        .returning();

      await ctx.db.insert(conversationParticipants).values([
        { conversationId: conv!.id, userId },
        { conversationId: conv!.id, userId: input.recipientId },
      ]);

      return { conversationId: conv!.id, created: true };
    }),

  /**
   * totalUnreadCount — total unread messages across all conversations.
   */
  totalUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const rows = await ctx.db
      .select({
        conversationId: conversationParticipants.conversationId,
        lastReadAt: conversationParticipants.lastReadAt,
      })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));

    if (rows.length === 0) return { count: 0 };

    let total = 0;
    for (const row of rows) {
      const conditions = [eq(messages.conversationId, row.conversationId)];
      if (row.lastReadAt) {
        conditions.push(sql`${messages.createdAt} > ${row.lastReadAt}`);
      }
      conditions.push(
        or(
          ne(messages.senderId, userId),
          ne(messages.senderType, "human"),
        )!,
      );

      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(...conditions));

      total += result?.count ?? 0;
    }

    return { count: total };
  }),

  /**
   * searchMembers — search members for "new message" flow.
   */
  searchMembers: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const pattern = `%${input.query}%`;

      const rows = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(memberProfiles.userId, user.id))
        .where(
          and(
            ne(memberProfiles.userId, userId),
            eq(memberProfiles.isPublic, true),
            or(
              like(memberProfiles.displayName, pattern),
              like(user.name, pattern),
            ),
          ),
        )
        .limit(input.limit);

      return { members: rows };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT-FACING PROCEDURES (agentProcedure)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * agentCheckInbox — agent fetches unread human messages from its conversation.
   */
  agentCheckInbox: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");

    // Find the agent conversation
    const agentConv = await findAgentConversation(ctx.db, ctx.agent.ownerId);
    if (!agentConv) return { messages: [] };

    // Get the agent owner's participant record to find lastReadAt
    // For agent reads, we track separately — use a query for unread
    const rows = await ctx.db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, agentConv.id),
          eq(messages.senderType, "human"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(50);

    rows.reverse(); // chronological

    return { messages: rows };
  }),

  /**
   * agentSendMessage — agent sends a message to its owner.
   */
  agentSendMessage: agentProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10000),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      // Find or create agent conversation
      let agentConv = await findAgentConversation(ctx.db, ctx.agent.ownerId);

      if (!agentConv) {
        // Create agent conversation
        const [conv] = await ctx.db
          .insert(conversations)
          .values({ type: "agent" })
          .returning();

        await ctx.db.insert(conversationParticipants).values({
          conversationId: conv!.id,
          userId: ctx.agent.ownerId,
          isPinned: true,
        });

        agentConv = conv!;
      }

      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId: agentConv.id,
          senderId: ctx.agent.ownerId,
          senderType: "agent",
          content: input.content,
          metadata: input.metadata,
        })
        .returning();

      // Update conversation.updatedAt
      await ctx.db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, agentConv.id));

      return { messageId: message!.id };
    }),

  /**
   * agentGetConversationHistory — paginated agent ↔ owner history.
   */
  agentGetConversationHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        before: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const agentConv = await findAgentConversation(ctx.db, ctx.agent.ownerId);
      if (!agentConv) return { messages: [], hasMore: false };

      const conditions = [eq(messages.conversationId, agentConv.id)];
      if (input.before) {
        conditions.push(lt(messages.createdAt, new Date(input.before)));
      }

      const rows = await ctx.db
        .select({
          id: messages.id,
          senderType: messages.senderType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      items.reverse();

      return { messages: items, hasMore };
    }),

  /**
   * agentGetOwnerDMs — agent reads owner's DM conversations (if allowed).
   */
  agentGetOwnerDMs: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      // Check if agent is allowed to read owner DMs
      const [agent] = await ctx.db
        .select({ canReadOwnerDMs: agentProfiles.canReadOwnerDMs })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent?.canReadOwnerDMs) {
        return { messages: [] };
      }

      // Get owner's DM conversations
      const ownerConvs = await ctx.db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversationParticipants.userId, ctx.agent.ownerId),
            eq(conversations.type, "dm"),
          ),
        );

      if (ownerConvs.length === 0) return { messages: [] };

      const convIds = ownerConvs.map((c) => c.conversationId);
      const convConditions = convIds.map((id) => eq(messages.conversationId, id));

      const rows = await ctx.db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          senderType: messages.senderType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(or(...convConditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit);

      rows.reverse();

      return { messages: rows };
    }),
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function findAgentConversation(
  db: typeof import("@/server/db").db,
  ownerId: string,
) {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .where(
      and(
        eq(conversations.type, "agent"),
        eq(conversationParticipants.userId, ownerId),
      ),
    )
    .limit(1);

  return row ?? null;
}
```

**Step 2: Wire the inbox router into root.ts**

In `src/server/api/root.ts`, replace the notebook import and registration:

Replace:
```typescript
import { notebookRouter } from "@/server/api/routers/notebook";
```
With:
```typescript
import { inboxRouter } from "@/server/api/routers/inbox";
```

Replace in the router object:
```typescript
notebook: notebookRouter,
```
With:
```typescript
inbox: inboxRouter,
```

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Errors in `notebook-panel.tsx` (references `api.notebook.*` which no longer exists). This is expected — we'll replace that component in Task 6.

**Step 4: Commit**

```bash
git add src/server/api/routers/inbox.ts src/server/api/root.ts
git commit -m "feat(api): add inbox tRPC router replacing notebook router"
```

---

### Task 4: Update i18n Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Replace the `notebook` namespace with `inbox` in `messages/en.json`**

Remove the `"notebook"` key and its contents. Add `"inbox"`:

```json
"inbox": {
  "title": "Inbox",
  "search": "Search conversations...",
  "newMessage": "New message",
  "searchMembers": "Search members...",
  "noConversations": "No conversations yet",
  "noConversationsDescription": "Start a conversation with a community member or your AI agent.",
  "placeholder": "Type a message...",
  "agentLabel": "Your Agent",
  "unreadBadge": "unread messages"
}
```

**Step 2: Same for `messages/nl.json`**

Remove `"notebook"` namespace. Add `"inbox"`:

```json
"inbox": {
  "title": "Inbox",
  "search": "Zoek gesprekken...",
  "newMessage": "Nieuw bericht",
  "searchMembers": "Zoek leden...",
  "noConversations": "Nog geen gesprekken",
  "noConversationsDescription": "Start een gesprek met een community-lid of je AI-agent.",
  "placeholder": "Typ een bericht...",
  "agentLabel": "Jouw Agent",
  "unreadBadge": "ongelezen berichten"
}
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): replace notebook namespace with inbox for messaging system"
```

---

### Task 5: InboxProvider — State Management Context

**Files:**
- Create: `src/components/inbox/inbox-provider.tsx`

**Context:** This React context manages which chat windows are open, minimized, and active (mobile). It lives at the layout level and provides state + actions to all inbox components. Uses a breakpoint hook to enforce max windows: 2 on desktop (>= 1024px), 1 on tablet (768-1023px), 0 on mobile (< 768px, uses fullscreen instead).

**Step 1: Create the InboxProvider**

Create `src/components/inbox/inbox-provider.tsx`:

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type InboxState = {
  isListOpen: boolean;
  openChats: string[]; // conversation IDs
  minimizedChats: string[]; // conversation IDs
  activeChat: string | null; // mobile fullscreen chat
};

type InboxActions = {
  toggleList: () => void;
  openChat: (conversationId: string) => void;
  closeChat: (conversationId: string) => void;
  minimizeChat: (conversationId: string) => void;
  restoreChat: (conversationId: string) => void;
  setActiveChat: (conversationId: string | null) => void;
};

const InboxContext = createContext<(InboxState & InboxActions) | null>(null);

function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (width >= 1024) return "desktop" as const;
  if (width >= 768) return "tablet" as const;
  return "mobile" as const;
}

function getMaxChats(breakpoint: "desktop" | "tablet" | "mobile") {
  if (breakpoint === "desktop") return 2;
  if (breakpoint === "tablet") return 1;
  return 0;
}

export function InboxProvider({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const maxChats = getMaxChats(breakpoint);

  const [state, setState] = useState<InboxState>({
    isListOpen: false,
    openChats: [],
    minimizedChats: [],
    activeChat: null,
  });

  // Enforce max open chats when breakpoint changes
  useEffect(() => {
    setState((prev) => {
      if (prev.openChats.length <= maxChats) return prev;
      const keep = prev.openChats.slice(-maxChats);
      const overflow = prev.openChats.slice(0, -maxChats);
      return {
        ...prev,
        openChats: keep,
        minimizedChats: [...prev.minimizedChats, ...overflow],
      };
    });
  }, [maxChats]);

  const toggleList = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListOpen: !prev.isListOpen,
      activeChat: prev.isListOpen ? null : prev.activeChat,
    }));
  }, []);

  const openChat = useCallback(
    (conversationId: string) => {
      setState((prev) => {
        // Already open — bring to focus
        if (prev.openChats.includes(conversationId)) return prev;

        // Remove from minimized if there
        const minimized = prev.minimizedChats.filter((id) => id !== conversationId);

        // Mobile — use fullscreen
        if (maxChats === 0) {
          return { ...prev, minimizedChats: minimized, activeChat: conversationId };
        }

        let open = [...prev.openChats, conversationId];
        const newMinimized = [...minimized];

        // Enforce max — close oldest
        while (open.length > maxChats) {
          const removed = open.shift()!;
          newMinimized.push(removed);
        }

        return {
          ...prev,
          openChats: open,
          minimizedChats: newMinimized,
          activeChat: null,
        };
      });
    },
    [maxChats],
  );

  const closeChat = useCallback((conversationId: string) => {
    setState((prev) => ({
      ...prev,
      openChats: prev.openChats.filter((id) => id !== conversationId),
      minimizedChats: prev.minimizedChats.filter((id) => id !== conversationId),
      activeChat: prev.activeChat === conversationId ? null : prev.activeChat,
    }));
  }, []);

  const minimizeChat = useCallback((conversationId: string) => {
    setState((prev) => ({
      ...prev,
      openChats: prev.openChats.filter((id) => id !== conversationId),
      minimizedChats: prev.minimizedChats.includes(conversationId)
        ? prev.minimizedChats
        : [...prev.minimizedChats, conversationId],
      activeChat: prev.activeChat === conversationId ? null : prev.activeChat,
    }));
  }, []);

  const restoreChat = useCallback(
    (conversationId: string) => {
      openChat(conversationId);
    },
    [openChat],
  );

  const setActiveChat = useCallback((conversationId: string | null) => {
    setState((prev) => ({ ...prev, activeChat: conversationId }));
  }, []);

  return (
    <InboxContext.Provider
      value={{
        ...state,
        toggleList,
        openChat,
        closeChat,
        minimizeChat,
        restoreChat,
        setActiveChat,
      }}
    >
      {children}
    </InboxContext.Provider>
  );
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used within InboxProvider");
  return ctx;
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean for this file (existing notebook errors still present, handled in Task 6)

**Step 3: Commit**

```bash
git add src/components/inbox/inbox-provider.tsx
git commit -m "feat(inbox): add InboxProvider context for multi-window state management"
```

---

### Task 6: InboxPill Component

**Files:**
- Create: `src/components/inbox/inbox-pill.tsx`

**Context:** The pill is the collapsed state — a small button fixed at bottom-right showing the inbox icon, total unread badge, and "INBOX" label. Clicking toggles the inbox list. Matches the design system: `font-mono text-xs font-medium uppercase tracking-wider`, `border-border bg-background shadow-lg`.

**Step 1: Create the InboxPill component**

Create `src/components/inbox/inbox-pill.tsx`:

```typescript
"use client";

import { MessageSquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useInbox } from "./inbox-provider";

export function InboxPill() {
  const { data: session } = authClient.useSession();
  const { isListOpen, toggleList } = useInbox();
  const t = useTranslations("inbox");

  const { data: unreadData } = api.inbox.totalUnreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 30_000,
  });

  if (!session?.user || isListOpen) return null;

  const unreadCount = unreadData?.count ?? 0;

  return (
    <button
      type="button"
      onClick={toggleList}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg transition-opacity hover:opacity-90"
    >
      <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("title")}
      </span>
      {unreadCount > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/inbox/inbox-pill.tsx
git commit -m "feat(inbox): add InboxPill collapsed state component"
```

---

### Task 7: InboxConversationItem Component

**Files:**
- Create: `src/components/inbox/inbox-conversation-item.tsx`

**Context:** A single row in the conversation list. Shows avatar (with bot badge for agent), name, last message preview (truncated), relative timestamp, and unread indicator dot. Clicking opens the chat window.

**Step 1: Create the component**

Create `src/components/inbox/inbox-conversation-item.tsx`:

```typescript
"use client";

import { BotIcon } from "lucide-react";
import { useInbox } from "./inbox-provider";

type ConversationItemProps = {
  id: string;
  type: "agent" | "dm";
  displayName: string;
  image: string | null;
  agentAvatar?: string | null;
  lastMessage: string | null;
  lastMessageSenderType: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function InboxConversationItem({
  id,
  type,
  displayName,
  image,
  agentAvatar,
  lastMessage,
  lastMessageSenderType,
  lastMessageAt,
  unreadCount,
}: ConversationItemProps) {
  const { openChat } = useInbox();

  const avatar = type === "agent" ? agentAvatar : image;
  const preview = lastMessage
    ? lastMessage.length > 40
      ? lastMessage.slice(0, 40) + "..."
      : lastMessage
    : null;

  return (
    <button
      type="button"
      onClick={() => openChat(id)}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {type === "agent" && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
            <BotIcon className="h-3 w-3 text-muted-foreground" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={`truncate text-sm ${unreadCount > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
            {displayName}
          </span>
          {lastMessageAt && (
            <span className="ml-2 flex-shrink-0 font-mono text-[10px] text-muted-foreground">
              {timeAgo(new Date(lastMessageAt))}
            </span>
          )}
        </div>
        {preview && (
          <p className={`truncate text-xs ${unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {lastMessageSenderType === "agent" ? "Agent: " : ""}
            {preview}
          </p>
        )}
      </div>

      {/* Unread dot */}
      {unreadCount > 0 && (
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/inbox/inbox-conversation-item.tsx
git commit -m "feat(inbox): add InboxConversationItem component"
```

---

### Task 8: InboxList Component

**Files:**
- Create: `src/components/inbox/inbox-list.tsx`

**Context:** The conversation list panel — 320px wide, floating bottom-right. Header with `/ INBOX`, new message button, close chevron. Search input. Scrollable conversation list with agent conversation pinned to top. "New message" mode shows member search.

**Step 1: Create the InboxList component**

Create `src/components/inbox/inbox-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  PenSquareIcon,
  SearchIcon,
  ArrowLeftIcon,
  BotIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { useInbox } from "./inbox-provider";
import { InboxConversationItem } from "./inbox-conversation-item";
import { Spinner } from "@/components/ui/spinner";

export function InboxList() {
  const { data: session } = authClient.useSession();
  const { isListOpen, toggleList, openChat } = useInbox();
  const t = useTranslations("inbox");
  const [search, setSearch] = useState("");
  const [isNewMessage, setIsNewMessage] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const utils = api.useUtils();

  const { data: conversationsData, isLoading } =
    api.inbox.listConversations.useQuery(
      { limit: 20 },
      { enabled: !!session?.user && isListOpen },
    );

  const { data: membersData } = api.inbox.searchMembers.useQuery(
    { query: memberSearch, limit: 10 },
    { enabled: isNewMessage && memberSearch.length > 0 },
  );

  const startConversation = api.inbox.startConversation.useMutation({
    onSuccess: (data) => {
      setIsNewMessage(false);
      setMemberSearch("");
      openChat(data.conversationId);
      void utils.inbox.listConversations.invalidate();
    },
  });

  if (!session?.user || !isListOpen) return null;

  const conversations = conversationsData?.conversations ?? [];
  const filteredConversations = search
    ? conversations.filter((c) => {
        const name =
          c.type === "agent"
            ? c.agentInfo?.name ?? t("agentLabel")
            : c.participants[0]?.displayName ?? "";
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : conversations;

  return (
    <div className="flex h-[500px] w-[320px] flex-col rounded-lg border border-border bg-background shadow-lg max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:h-full max-sm:w-full max-sm:rounded-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        {isNewMessage ? (
          <>
            <button
              type="button"
              onClick={() => {
                setIsNewMessage(false);
                setMemberSearch("");
              }}
              className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("newMessage")}
            </span>
            <div className="w-6" />
          </>
        ) : (
          <>
            <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              / {t("title")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsNewMessage(true)}
                className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
                aria-label={t("newMessage")}
              >
                <PenSquareIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleList}
                className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
                aria-label="Minimize"
              >
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={isNewMessage ? t("searchMembers") : t("search")}
            value={isNewMessage ? memberSearch : search}
            onChange={(e) =>
              isNewMessage
                ? setMemberSearch(e.target.value)
                : setSearch(e.target.value)
            }
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isNewMessage ? (
          // New message — member search results
          <div className="p-1">
            {membersData?.members.map((member) => (
              <button
                key={member.userId}
                type="button"
                onClick={() => startConversation.mutate({ recipientId: member.userId })}
                disabled={startConversation.isPending}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
              >
                {member.image ? (
                  <img
                    src={member.image}
                    alt={member.displayName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-foreground">
                  {member.displayName}
                </span>
              </button>
            ))}
            {memberSearch.length > 0 && !membersData?.members.length && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                No members found
              </p>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-5 w-5" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <BotIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {t("noConversations")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("noConversationsDescription")}
            </p>
          </div>
        ) : (
          <div className="p-1">
            {filteredConversations.map((conv) => (
              <InboxConversationItem
                key={conv.id}
                id={conv.id}
                type={conv.type as "agent" | "dm"}
                displayName={
                  conv.type === "agent"
                    ? conv.agentInfo?.name ?? t("agentLabel")
                    : conv.participants[0]?.displayName ?? "Unknown"
                }
                image={conv.participants[0]?.image ?? null}
                agentAvatar={conv.agentInfo?.avatar}
                lastMessage={conv.lastMessage?.content ?? null}
                lastMessageSenderType={conv.lastMessage?.senderType ?? null}
                lastMessageAt={conv.lastMessage?.createdAt ?? null}
                unreadCount={conv.unreadCount}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/inbox/inbox-list.tsx
git commit -m "feat(inbox): add InboxList conversation list panel"
```

---

### Task 9: ChatWindow and ChatWindowMinimized Components

**Files:**
- Create: `src/components/inbox/chat-window.tsx`
- Create: `src/components/inbox/chat-window-minimized.tsx`

**Context:** The chat window is a 320px × 450px floating panel for an individual conversation. It reuses the existing `<Conversation>`, `<Message>`, and `<PromptInput>` primitives from `src/components/ai-elements/`. Has a header with avatar, name, minimize, and close buttons. The minimized state is a small pill at the bottom showing avatar + name.

**Step 1: Create ChatWindow**

Create `src/components/inbox/chat-window.tsx`:

```typescript
"use client";

import { ChevronDownIcon, XIcon, BotIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useInbox } from "./inbox-provider";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Spinner } from "@/components/ui/spinner";

type ChatWindowProps = {
  conversationId: string;
  displayName: string;
  image: string | null;
  isAgent: boolean;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatWindow({
  conversationId,
  displayName,
  image,
  isAgent,
}: ChatWindowProps) {
  const { closeChat, minimizeChat } = useInbox();
  const t = useTranslations("inbox");
  const utils = api.useUtils();

  const { data, isLoading } = api.inbox.getMessages.useQuery(
    { conversationId, limit: 50 },
    { refetchInterval: 10_000 },
  );

  const sendMessage = api.inbox.sendMessage.useMutation({
    onSuccess: () => {
      void utils.inbox.getMessages.invalidate({ conversationId });
      void utils.inbox.listConversations.invalidate();
      void utils.inbox.totalUnreadCount.invalidate();
    },
  });

  const messages = data?.messages ?? [];

  function handleSubmit({ text }: { text: string }) {
    const content = text.trim();
    if (!content) return;
    sendMessage.mutate({ conversationId, content });
  }

  return (
    <div className="flex h-[450px] w-[320px] flex-col rounded-lg border border-border bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            {image ? (
              <img
                src={image}
                alt={displayName}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {isAgent && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background">
                <BotIcon className="h-2.5 w-2.5 text-muted-foreground" />
              </span>
            )}
          </div>
          <span className="truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => minimizeChat(conversationId)}
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Minimize"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => closeChat(conversationId)}
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((msg) => (
              <div key={msg.id}>
                <Message
                  from={msg.senderType === "agent" ? "assistant" : msg.senderId === "self" ? "user" : "user"}
                >
                  <MessageContent>
                    {msg.senderType === "agent" ? (
                      <MessageResponse>{msg.content}</MessageResponse>
                    ) : (
                      msg.content
                    )}
                  </MessageContent>
                </Message>
                <p
                  className={`mt-1 font-mono text-[10px] text-muted-foreground/60 ${
                    msg.senderType === "human" ? "text-right" : "text-left"
                  }`}
                >
                  {formatTime(new Date(msg.createdAt))}
                </p>
              </div>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input */}
      <div className="border-t border-border p-2">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea placeholder={t("placeholder")} />
          <PromptInputFooter>
            <PromptInputSubmit disabled={sendMessage.isPending} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
```

**Step 2: Create ChatWindowMinimized**

Create `src/components/inbox/chat-window-minimized.tsx`:

```typescript
"use client";

import { BotIcon } from "lucide-react";
import { useInbox } from "./inbox-provider";

type ChatWindowMinimizedProps = {
  conversationId: string;
  displayName: string;
  image: string | null;
  isAgent: boolean;
};

export function ChatWindowMinimized({
  conversationId,
  displayName,
  image,
  isAgent,
}: ChatWindowMinimizedProps) {
  const { restoreChat, closeChat } = useInbox();

  return (
    <button
      type="button"
      onClick={() => restoreChat(conversationId)}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-lg transition-opacity hover:opacity-90"
    >
      <div className="relative flex-shrink-0">
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {isAgent && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-background">
            <BotIcon className="h-2 w-2 text-muted-foreground" />
          </span>
        )}
      </div>
      <span className="max-w-[100px] truncate text-xs font-medium text-foreground">
        {displayName}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeChat(conversationId);
        }}
        className="ml-1 rounded-sm text-muted-foreground opacity-70 hover:opacity-100"
        aria-label="Close"
      >
        ×
      </button>
    </button>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/inbox/chat-window.tsx src/components/inbox/chat-window-minimized.tsx
git commit -m "feat(inbox): add ChatWindow and ChatWindowMinimized components"
```

---

### Task 10: InboxMobileView Component

**Files:**
- Create: `src/components/inbox/inbox-mobile-view.tsx`

**Context:** On mobile (< 768px), the inbox opens as a fullscreen overlay. It has two views: conversation list and individual chat. Navigation via back arrow. The `activeChat` state from InboxProvider determines which view is shown.

**Step 1: Create InboxMobileView**

Create `src/components/inbox/inbox-mobile-view.tsx`:

```typescript
"use client";

import { ArrowLeftIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInbox } from "./inbox-provider";
import { InboxList } from "./inbox-list";
import { ChatWindow } from "./chat-window";

type MobileChatInfo = {
  conversationId: string;
  displayName: string;
  image: string | null;
  isAgent: boolean;
};

export function InboxMobileView({ chatInfo }: { chatInfo: MobileChatInfo | null }) {
  const { activeChat, setActiveChat, toggleList } = useInbox();
  const t = useTranslations("inbox");

  if (!activeChat || !chatInfo) {
    // Show conversation list — handled by InboxList with max-sm styles
    return null;
  }

  // Fullscreen chat view
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          onClick={() => setActiveChat(null)}
          className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {chatInfo.image ? (
            <img
              src={chatInfo.image}
              alt={chatInfo.displayName}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
              {chatInfo.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="truncate text-sm font-medium text-foreground">
            {chatInfo.displayName}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveChat(null);
            toggleList();
          }}
          className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Chat — reuse ChatWindow internals but fullscreen */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatWindowFullscreen
          conversationId={chatInfo.conversationId}
          isAgent={chatInfo.isAgent}
        />
      </div>
    </div>
  );
}

// Stripped-down chat window for mobile fullscreen (no header/border/shadow)
function ChatWindowFullscreen({
  conversationId,
  isAgent,
}: {
  conversationId: string;
  isAgent: boolean;
}) {
  const t = useTranslations("inbox");
  const utils = api.useUtils();
  const { api } = require("@/trpc/react");

  // NOTE: The implementer should import api at the top of the file and
  // inline the message list + input logic from ChatWindow here,
  // using the same query/mutation pattern but without the window chrome.
  // For brevity, this is left as a reference for the implementer to
  // extract shared logic from ChatWindow into a reusable hook or component.

  return null; // placeholder — implementer fills in
}
```

**Important note for implementer:** Extract the message fetching + rendering + input logic from `ChatWindow` into a shared `ChatMessages` component that both `ChatWindow` and `InboxMobileView` can reuse. This avoids duplicating the tRPC query/mutation logic.

**Step 2: Commit**

```bash
git add src/components/inbox/inbox-mobile-view.tsx
git commit -m "feat(inbox): add InboxMobileView fullscreen overlay for mobile"
```

---

### Task 11: InboxRoot Orchestrator + Layout Wiring

**Files:**
- Create: `src/components/inbox/inbox-root.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Delete: `src/components/notebook-panel.tsx`

**Context:** InboxRoot is the top-level component that renders the pill, list, chat windows, and minimized pills based on state from InboxProvider. It positions all elements fixed at the bottom of the viewport, stacking horizontally from right to left. On mobile, it delegates to InboxMobileView.

**Step 1: Create InboxRoot**

Create `src/components/inbox/inbox-root.tsx`:

```typescript
"use client";

import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";
import { useInbox } from "./inbox-provider";
import { InboxPill } from "./inbox-pill";
import { InboxList } from "./inbox-list";
import { ChatWindow } from "./chat-window";
import { ChatWindowMinimized } from "./chat-window-minimized";
import { InboxMobileView } from "./inbox-mobile-view";
import { useTranslations } from "next-intl";

export function InboxRoot() {
  const { data: session } = authClient.useSession();
  const inbox = useInbox();
  const t = useTranslations("inbox");

  const { data: conversationsData } = api.inbox.listConversations.useQuery(
    { limit: 20 },
    { enabled: !!session?.user && (inbox.isListOpen || inbox.openChats.length > 0) },
  );

  if (!session?.user) return null;

  const conversations = conversationsData?.conversations ?? [];

  // Helper to get conversation info for chat windows
  function getConvInfo(conversationId: string) {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return null;
    return {
      conversationId: conv.id,
      displayName:
        conv.type === "agent"
          ? conv.agentInfo?.name ?? t("agentLabel")
          : conv.participants[0]?.displayName ?? "Unknown",
      image:
        conv.type === "agent"
          ? conv.agentInfo?.avatar ?? null
          : conv.participants[0]?.image ?? null,
      isAgent: conv.type === "agent",
    };
  }

  // Mobile active chat info
  const activeChatInfo = inbox.activeChat
    ? getConvInfo(inbox.activeChat)
    : null;

  return (
    <>
      {/* Mobile fullscreen overlay */}
      {inbox.activeChat && activeChatInfo && (
        <InboxMobileView chatInfo={activeChatInfo} />
      )}

      {/* Fixed bottom-right container */}
      <div className="fixed bottom-4 right-4 z-40 flex items-end gap-2">
        {/* Minimized chat pills */}
        {inbox.minimizedChats.map((convId) => {
          const info = getConvInfo(convId);
          if (!info) return null;
          return (
            <ChatWindowMinimized
              key={convId}
              conversationId={info.conversationId}
              displayName={info.displayName}
              image={info.image}
              isAgent={info.isAgent}
            />
          );
        })}

        {/* Open chat windows */}
        {inbox.openChats.map((convId) => {
          const info = getConvInfo(convId);
          if (!info) return null;
          return (
            <ChatWindow
              key={convId}
              conversationId={info.conversationId}
              displayName={info.displayName}
              image={info.image}
              isAgent={info.isAgent}
            />
          );
        })}

        {/* Inbox list */}
        {inbox.isListOpen && <InboxList />}

        {/* Inbox pill (collapsed) */}
        <InboxPill />
      </div>
    </>
  );
}
```

**Step 2: Update layout.tsx**

In `src/app/[locale]/layout.tsx`:

Replace:
```typescript
import { NotebookPanel } from "@/components/notebook-panel";
```
With:
```typescript
import { InboxProvider } from "@/components/inbox/inbox-provider";
import { InboxRoot } from "@/components/inbox/inbox-root";
```

Replace:
```tsx
<NotebookPanel />
```
With:
```tsx
<InboxProvider>
  <InboxRoot />
</InboxProvider>
```

**Step 3: Delete the old notebook panel**

Delete `src/components/notebook-panel.tsx`.

**Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean (may have minor issues to fix in chat-window message sender logic — see Task 12)

**Step 5: Commit**

```bash
git add src/components/inbox/inbox-root.tsx src/app/[locale]/layout.tsx
git rm src/components/notebook-panel.tsx
git commit -m "feat(inbox): add InboxRoot orchestrator, wire into layout, remove notebook panel"
```

---

### Task 12: Delete Old Notebook Router + Cleanup

**Files:**
- Delete: `src/server/api/routers/notebook.ts`
- Modify: `src/server/db/schema.ts` (comment or remove `notebookMessages` table — keep until migration verified)

**Step 1: Delete the old notebook router file**

Delete `src/server/api/routers/notebook.ts`. The `inbox.ts` router already replaces all its functionality.

**Step 2: Verify no remaining references to notebook**

Search the codebase for `notebook` imports:
- `src/server/api/root.ts` should already reference `inboxRouter` (done in Task 3)
- `messages/en.json` and `messages/nl.json` should already have `inbox` namespace (done in Task 4)
- `src/components/notebook-panel.tsx` should already be deleted (done in Task 11)

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git rm src/server/api/routers/notebook.ts
git commit -m "chore: remove old notebook router, replaced by inbox router"
```

---

### Task 13: Update MCP Server Tools

**Files:**
- Modify: `mcp-server/src/index.ts` (or wherever tools are registered)

**Context:** The MCP server has three notebook tools: `check-inbox`, `send-message`, `get-conversation-history`. These call tRPC procedures via the `AitClient` class using `client.query("notebook.checkInbox")` etc. Update them to use `inbox.agentCheckInbox`, `inbox.agentSendMessage`, `inbox.agentGetConversationHistory`. Add new `read-owner-messages` tool.

**Step 1: Update existing tool procedure paths**

In the MCP server tool registrations:

- `check-inbox`: Change `client.query("notebook.checkInbox")` to `client.query("inbox.agentCheckInbox")`
- `send-message`: Change `client.mutate("notebook.sendNotebookMessage", input)` to `client.mutate("inbox.agentSendMessage", input)`
- `get-conversation-history`: Change `client.query("notebook.getConversationHistory", input)` to `client.query("inbox.agentGetConversationHistory", input)`

**Step 2: Add new `read-owner-messages` tool**

```typescript
server.registerTool("read-owner-messages", {
  description:
    "Read your owner's recent direct messages with other community members. Use this to understand context about what your owner is discussing. Only works if the owner has allowed agent access to DMs (enabled by default).",
  inputSchema: {
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of recent messages to return (1-50, default 20)."),
  },
}, async ({ limit }) => {
  const result = await client.query("inbox.agentGetOwnerDMs", { limit });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
});
```

**Step 3: Update MCP package version**

In `mcp-server/package.json`, bump the minor version (e.g., `0.2.0` → `0.3.0`).

**Step 4: Commit**

```bash
git add mcp-server/
git commit -m "feat(mcp): update tools to use inbox router, add read-owner-messages tool"
```

---

### Task 14: End-to-End Verification

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean (no errors)

**Step 2: Verify the dev server starts**

Run: `npm run dev` (or `pnpm dev`)
Expected: Server starts without errors

**Step 3: Verify tRPC routes respond**

Test key endpoints manually or via curl:
- `/api/trpc/inbox.totalUnreadCount` should return `{"count":0}` when authenticated
- `/api/trpc/inbox.listConversations` should return `{"conversations":[]}` for a fresh user

**Step 4: Test agent MCP tools**

Use the test agent (Nova, key `ait_sk_3EtGnJajFNGTVyQg0QyujeNLgrCGlJrYvJKkQK9dQHs`) to verify:
- `check-inbox` returns messages
- `send-message` creates a message
- `read-owner-messages` returns DMs (or empty array)

**Step 5: Test responsive breakpoints**

Open the app and verify:
- Desktop (>= 1024px): Pill → list + up to 2 chat windows
- Tablet (768-1023px): Pill → list + 1 chat window
- Mobile (< 768px): Pill → fullscreen list → fullscreen chat

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
