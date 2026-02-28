import { z } from "zod";
import { eq, and, desc, lt, sql, ne, or, ilike } from "drizzle-orm";
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
import { logActivity } from "@/server/agent/activity";

// ── Router ───────────────────────────────────────────────────────────────────

export const inboxRouter = createTRPCRouter({
  // ═══════════════════════════════════════════════════════════════════════════
  // HUMAN-FACING PROCEDURES (protectedProcedure)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * listConversations - paginated list of the user's conversations.
   * Sorted by pinned first, then updatedAt desc. Includes last message,
   * other participants, agent info, and unread count.
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

      // Get user's participant rows with conversation data
      const participantRows = await ctx.db
        .select({
          participantId: conversationParticipants.id,
          conversationId: conversationParticipants.conversationId,
          lastReadAt: conversationParticipants.lastReadAt,
          isPinned: conversationParticipants.isPinned,
          convType: conversations.type,
          convUpdatedAt: conversations.updatedAt,
        })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(eq(conversationParticipants.userId, userId));

      if (participantRows.length === 0) {
        return { conversations: [], nextCursor: null };
      }

      // Sort: pinned first, then updatedAt desc
      participantRows.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.convUpdatedAt.getTime() - a.convUpdatedAt.getTime();
      });

      // Apply cursor-based pagination (cursor = updatedAt ISO string)
      let filtered = participantRows;
      if (input.cursor) {
        const cursorDate = new Date(input.cursor);
        filtered = participantRows.filter(
          (r) => r.convUpdatedAt.getTime() < cursorDate.getTime(),
        );
      }

      const page = filtered.slice(0, input.limit + 1);
      const hasMore = page.length > input.limit;
      const items = hasMore ? page.slice(0, input.limit) : page;
      const nextCursor = hasMore
        ? items[items.length - 1]!.convUpdatedAt.toISOString()
        : null;

      // Build full conversation objects
      const result = await Promise.all(
        items.map(async (row) => {
          // Last message
          const [lastMessage] = await ctx.db
            .select({
              content: messages.content,
              senderType: messages.senderType,
              senderId: messages.senderId,
              createdAt: messages.createdAt,
            })
            .from(messages)
            .where(eq(messages.conversationId, row.conversationId))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          // Other participants
          const otherParticipantsRaw = await ctx.db
            .select({
              userId: conversationParticipants.userId,
              displayName: memberProfiles.displayName,
              name: user.name,
              image: user.image,
            })
            .from(conversationParticipants)
            .leftJoin(
              memberProfiles,
              eq(memberProfiles.userId, conversationParticipants.userId),
            )
            .leftJoin(
              user,
              eq(user.id, conversationParticipants.userId),
            )
            .where(
              and(
                eq(conversationParticipants.conversationId, row.conversationId),
                ne(conversationParticipants.userId, userId),
              ),
            );

          const otherParticipants = otherParticipantsRaw.map((p) => ({
            userId: p.userId,
            displayName: p.displayName ?? p.name ?? "Unknown",
            image: p.image,
          }));

          // Agent info (only for agent conversations)
          let agentInfo = null;
          if (row.convType === "agent") {
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

          // Unread count: messages after lastReadAt that aren't sent by the current user as "human"
          let unreadCount = 0;
          if (row.lastReadAt) {
            const [unreadRow] = await ctx.db
              .select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, row.conversationId),
                  sql`${messages.createdAt} > ${row.lastReadAt}`,
                  or(
                    ne(messages.senderId, userId),
                    ne(messages.senderType, "human"),
                  ),
                ),
              );
            unreadCount = unreadRow?.count ?? 0;
          } else {
            // Never read - all messages not sent by the user as "human" are unread
            const [unreadRow] = await ctx.db
              .select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, row.conversationId),
                  or(
                    ne(messages.senderId, userId),
                    ne(messages.senderType, "human"),
                  ),
                ),
              );
            unreadCount = unreadRow?.count ?? 0;
          }

          return {
            id: row.conversationId,
            type: row.convType,
            updatedAt: row.convUpdatedAt.toISOString(),
            isPinned: row.isPinned,
            lastMessage: lastMessage ?? null,
            participants: otherParticipants,
            agentInfo,
            unreadCount,
          };
        }),
      );

      return { conversations: result, nextCursor };
    }),

  /**
   * getMessages - paginated messages for a conversation.
   * Verifies user is a participant. Returns chronological order.
   * Fire-and-forget updates lastReadAt.
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
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
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

      // Reverse to chronological order
      items.reverse();

      // Fire-and-forget: update lastReadAt
      ctx.db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .catch((err: unknown) => { console.error("[inbox] update failed:", err); });

      return { messages: items, nextCursor, hasMore };
    }),

  /**
   * sendMessage - human sends a message in a conversation.
   * Verifies participant. Updates conversation.updatedAt.
   * Fire-and-forget updates sender's lastReadAt.
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
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Find the other participant (recipient) for event isolation
      const [recipient] = await ctx.db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            sql`${conversationParticipants.userId} != ${userId}`,
          ),
        )
        .limit(1);

      // Insert message
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

      // Log activity for webhook dispatch
      void logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "message.sent",
        targetType: "conversations",
        targetId: input.conversationId,
        recipientId: recipient?.userId,
      });

      // Fire-and-forget: update sender's lastReadAt
      ctx.db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .catch((err: unknown) => { console.error("[inbox] update failed:", err); });

      return message!;
    }),

  /**
   * startConversation - start a DM with another user.
   * Cannot message yourself. Returns existing conversation if one exists.
   */
  startConversation: protectedProcedure
    .input(
      z.object({
        recipientId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (userId === input.recipientId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot start a conversation with yourself",
        });
      }

      // Find existing DM between these two users with a single query
      const [existing] = await ctx.db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
        .where(
          and(
            eq(conversations.type, "dm"),
            eq(conversationParticipants.userId, input.recipientId),
            sql`${conversationParticipants.conversationId} IN (
              SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${userId}
            )`,
          ),
        )
        .limit(1);

      if (existing) {
        return { conversationId: existing.conversationId, created: false };
      }

      // Create new DM conversation (neon-http driver doesn't support transactions)
      const [newConv] = await ctx.db
        .insert(conversations)
        .values({ type: "dm" })
        .returning();

      await ctx.db.insert(conversationParticipants).values([
        { conversationId: newConv!.id, userId },
        { conversationId: newConv!.id, userId: input.recipientId },
      ]);

      return { conversationId: newConv!.id, created: true };
    }),

  /**
   * totalUnreadCount - sum of unread messages across all conversations.
   */
  totalUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [result] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(sub.cnt), 0)::int` })
      .from(
        sql`(
          SELECT count(*) as cnt
          FROM ${messages} m
          JOIN ${conversationParticipants} cp
            ON cp.conversation_id = m.conversation_id
          WHERE cp.user_id = ${userId}
            AND (m.sender_id != ${userId} OR m.sender_type != 'human')
            AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
          GROUP BY m.conversation_id
        ) sub`,
      );

    return { count: result?.total ?? 0 };
  }),

  /**
   * searchMembers - search for members by displayName or user.name.
   * Excludes current user. Only public profiles.
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
      const escaped = input.query.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escaped}%`;

      const rows = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(user.id, memberProfiles.userId))
        .where(
          and(
            eq(memberProfiles.isPublic, true),
            ne(memberProfiles.userId, userId),
            or(
              ilike(memberProfiles.displayName, pattern),
              ilike(user.name, pattern),
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
   * agentCheckInbox - agent fetches recent human messages from their
   * agent conversation.
   */
  agentCheckInbox: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");

    const [agentConv] = await ctx.db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.type, "agent"),
          eq(conversationParticipants.userId, ctx.agent.ownerId),
        ),
      )
      .limit(1);

    if (!agentConv) {
      return { messages: [] };
    }

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

    // Reverse to chronological order
    rows.reverse();

    return { messages: rows };
  }),

  /**
   * agentSendMessage - agent sends a message to its owner.
   * Creates the agent conversation if it doesn't exist.
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

      // Find existing agent conversation
      const [existingConv] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, ctx.agent.ownerId),
          ),
        )
        .limit(1);

      // Create agent conversation if it doesn't exist
      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
      } else {
        const [newConv] = await ctx.db
          .insert(conversations)
          .values({ type: "agent" })
          .returning();

        await ctx.db.insert(conversationParticipants).values({
          conversationId: newConv!.id,
          userId: ctx.agent.ownerId,
          isPinned: true,
        });

        convId = newConv!.id;
      }

      // Insert message with senderType "agent", senderId = owner's userId
      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId: convId,
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
        .where(eq(conversations.id, convId));

      // Log activity for webhook dispatch
      void logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "message.sent",
        targetType: "conversations",
        targetId: convId,
      });

      return { messageId: message!.id };
    }),

  /**
   * agentGetConversationHistory - agent fetches paginated conversation history.
   * Returns messages in chronological order.
   */
  agentGetConversationHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        before: z.string().optional(), // ISO-8601 date string
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const [agentConv] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, ctx.agent.ownerId),
          ),
        )
        .limit(1);

      if (!agentConv) {
        return { messages: [], hasMore: false };
      }

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

      // Reverse to chronological order
      items.reverse();

      return { messages: items, hasMore };
    }),

  /**
   * agentGetOwnerDMs - agent reads owner's DM conversations.
   * Requires canReadOwnerDMs permission on agent profile.
   */
  agentGetOwnerDMs: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      // Check canReadOwnerDMs permission
      const [agent] = await ctx.db
        .select({ canReadOwnerDMs: agentProfiles.canReadOwnerDMs })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent?.canReadOwnerDMs) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Agent does not have permission to read owner DMs",
        });
      }

      // Get owner's DM conversations
      const dmConversations = await ctx.db
        .select({
          conversationId: conversationParticipants.conversationId,
        })
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

      if (dmConversations.length === 0) {
        return { messages: [] };
      }

      const convIds = dmConversations.map((c) => c.conversationId);

      // Fetch recent messages across all DM conversations
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
        .where(
          or(...convIds.map((id) => eq(messages.conversationId, id))),
        )
        .orderBy(desc(messages.createdAt))
        .limit(input.limit);

      // Reverse to chronological order
      rows.reverse();

      return { messages: rows };
    }),
});
