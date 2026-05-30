import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { notificationOptouts } from "@/server/db/schema";
import { resolvePrefs, type OptoutRow } from "@/server/notifications/prefs";

export const notificationPrefsRouter = createTRPCRouter({
  /** All opt-out rows for the current user, plus the resolved view. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        communityId: notificationOptouts.communityId,
        category: notificationOptouts.category,
      })
      .from(notificationOptouts)
      .where(eq(notificationOptouts.userId, ctx.session.user.id));

    const resolved = resolvePrefs(rows as OptoutRow[]);
    return {
      globalDigestOptOut: resolved.globalDigestOptOut,
      digestOptOutCommunityIds: [...resolved.digestOptOutCommunityIds],
      broadcastOptOutCommunityIds: [...resolved.broadcastOptOutCommunityIds],
    };
  }),

  /** Toggle one opt-out. optedOut=true inserts (if absent); false deletes. */
  setOptout: protectedProcedure
    .input(
      z.object({
        communityId: z.string().nullable(),
        category: z.enum(["digest", "broadcast"]),
        optedOut: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const match = and(
        eq(notificationOptouts.userId, userId),
        input.communityId === null
          ? isNull(notificationOptouts.communityId)
          : eq(notificationOptouts.communityId, input.communityId),
        eq(notificationOptouts.category, input.category),
      );

      if (input.optedOut) {
        const existing = await ctx.db
          .select({ id: notificationOptouts.id })
          .from(notificationOptouts)
          .where(match)
          .limit(1);
        if (existing.length === 0) {
          await ctx.db.insert(notificationOptouts).values({
            userId,
            communityId: input.communityId,
            category: input.category,
          });
        }
      } else {
        await ctx.db.delete(notificationOptouts).where(match);
      }
      return { ok: true };
    }),
});
