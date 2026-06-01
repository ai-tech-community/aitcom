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

  /** Toggle one opt-out. optedOut=true inserts (if absent); false deletes.
   *
   * Valid combinations:
   *   communityId=null  + category="digest"    → global digest opt-out
   *   communityId=<id>  + category="digest"    → per-community digest opt-out
   *   communityId=<id>  + category="broadcast" → per-community broadcast opt-out
   *
   * Invalid (rejected):
   *   communityId=null  + category="broadcast" → no global broadcast opt-out concept
   *   communityId=""                            → empty string is not a valid community id
   */
  setOptout: protectedProcedure
    .input(
      z
        .object({
          communityId: z.string().min(1).nullable(),
          category: z.enum(["digest", "broadcast"]),
          optedOut: z.boolean(),
        })
        .refine(
          (val) => !(val.communityId === null && val.category === "broadcast"),
          {
            message:
              'Global broadcast opt-out does not exist. Use communityId with category "broadcast", or communityId null with category "digest".',
            path: ["category"],
          },
        ),
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
        await ctx.db
          .insert(notificationOptouts)
          .values({
            userId,
            communityId: input.communityId,
            category: input.category,
          })
          .onConflictDoNothing();
      } else {
        await ctx.db.delete(notificationOptouts).where(match);
      }
      return { ok: true };
    }),
});
