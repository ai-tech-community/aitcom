import { z } from "zod";
import { eq, and, desc, lt, asc, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  agentProcedure,
  requireScope,
} from "@/server/api/trpc";
import { notebookMessages, agentProfiles } from "@/server/db/schema";

// ── Router ───────────────────────────────────────────────────────────────────

export const notebookRouter = createTRPCRouter({
  // ═══════════════════════════════════════════════════════════════════════════
  // HUMAN-FACING PROCEDURES (protectedProcedure)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * getMessages — paginated conversation history for the human side.
   * Cursor is an ISO-8601 createdAt timestamp; returns messages oldest-first.
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        cursor: z.string().nullable().default(null),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        return { messages: [], nextCursor: null, hasAgent: false as const };
      }

      const conditions = [eq(notebookMessages.agentId, agent.id)];

      if (input.cursor) {
        conditions.push(lt(notebookMessages.createdAt, new Date(input.cursor)));
      }

      const rows = await ctx.db
        .select()
        .from(notebookMessages)
        .where(and(...conditions))
        .orderBy(desc(notebookMessages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;

      // The last item in the desc-ordered slice is the oldest — its createdAt
      // becomes the cursor for the next page.
      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      // Reverse so the client receives messages in chronological order.
      items.reverse();

      return { messages: items, nextCursor, hasAgent: true as const };
    }),

  /**
   * sendMessage — human sends a message to their agent.
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You don't have an agent yet",
        });
      }

      const [message] = await ctx.db
        .insert(notebookMessages)
        .values({
          agentId: agent.id,
          ownerId: userId,
          role: "human",
          content: input.content,
        })
        .returning();

      return message!;
    }),

  /**
   * markRead — mark all unread agent messages as read.
   */
  markRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      return { count: 0 };
    }

    const result = await ctx.db
      .update(notebookMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notebookMessages.agentId, agent.id),
          eq(notebookMessages.role, "agent"),
          isNull(notebookMessages.readAt),
        ),
      );

    return { count: result.rowCount ?? 0 };
  }),

  /**
   * unreadCount — number of unread agent messages for the current user.
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      return { count: 0 };
    }

    const [row] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(notebookMessages)
      .where(
        and(
          eq(notebookMessages.agentId, agent.id),
          eq(notebookMessages.role, "agent"),
          isNull(notebookMessages.readAt),
        ),
      );

    return { count: row?.count ?? 0 };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT-FACING PROCEDURES (agentProcedure)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * checkInbox — agent fetches (and marks read) all unread human messages.
   */
  checkInbox: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");

    // Fetch unread human messages in chronological order
    const rows = await ctx.db
      .select({
        id: notebookMessages.id,
        content: notebookMessages.content,
        createdAt: notebookMessages.createdAt,
      })
      .from(notebookMessages)
      .where(
        and(
          eq(notebookMessages.agentId, ctx.agent.agentId),
          eq(notebookMessages.role, "human"),
          isNull(notebookMessages.readAt),
        ),
      )
      .orderBy(asc(notebookMessages.createdAt));

    // Mark them as read
    if (rows.length > 0) {
      await ctx.db
        .update(notebookMessages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notebookMessages.agentId, ctx.agent.agentId),
            eq(notebookMessages.role, "human"),
            isNull(notebookMessages.readAt),
          ),
        );
    }

    return { messages: rows };
  }),

  /**
   * sendNotebookMessage — agent sends a message to its owner.
   */
  sendNotebookMessage: agentProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10000),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const [message] = await ctx.db
        .insert(notebookMessages)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          role: "agent",
          content: input.content,
          metadata: input.metadata,
        })
        .returning();

      return { messageId: message!.id };
    }),

  /**
   * getConversationHistory — agent fetches paginated conversation history.
   * Returns messages in chronological order (oldest first).
   */
  getConversationHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        before: z.string().optional(), // ISO-8601 date string
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const conditions = [eq(notebookMessages.agentId, ctx.agent.agentId)];

      if (input.before) {
        conditions.push(
          lt(notebookMessages.createdAt, new Date(input.before)),
        );
      }

      const rows = await ctx.db
        .select({
          id: notebookMessages.id,
          role: notebookMessages.role,
          content: notebookMessages.content,
          createdAt: notebookMessages.createdAt,
        })
        .from(notebookMessages)
        .where(and(...conditions))
        .orderBy(desc(notebookMessages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;

      // Reverse to chronological order
      items.reverse();

      return { messages: items, hasMore };
    }),
});
