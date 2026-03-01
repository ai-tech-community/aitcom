import { z } from "zod";
import { eq, and, isNull, isNotNull, desc, lt, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { notifications } from "@/server/db/schema";

export const notificationsRouter = createTRPCRouter({
  /**
   * list - paginated list of notifications for the current user, newest first.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [eq(notifications.userId, userId)];
      if (input.cursor) {
        conditions.push(lt(notifications.createdAt, new Date(input.cursor)));
      }
      const rows = await ctx.db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      return { notifications: items, nextCursor };
    }),

  /**
   * unreadCount - number of unread notifications for the bell badge.
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [row] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { count: row?.count ?? 0 };
  }),

  /**
   * markRead - mark one notification as read, or all if no id provided.
   */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [eq(notifications.userId, userId)];
      if (input.id) conditions.push(eq(notifications.id, input.id));
      await ctx.db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));
    }),

  /**
   * markUnread - mark one notification as unread.
   */
  markUnread: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db
        .update(notifications)
        .set({ readAt: null })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, userId)));
    }),

  /**
   * delete - hard delete one notification.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db
        .delete(notifications)
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, userId)));
    }),

  /**
   * deleteAll - hard delete all notifications for the user.
   */
  deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db.delete(notifications).where(eq(notifications.userId, userId));
  }),

  /**
   * deleteAllRead - hard delete only already-read notifications.
   */
  deleteAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db
      .delete(notifications)
      .where(and(eq(notifications.userId, userId), isNotNull(notifications.readAt)));
  }),
});
