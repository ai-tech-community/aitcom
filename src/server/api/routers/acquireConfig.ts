import { z } from "zod";
import { eq } from "drizzle-orm";

import {
  createTRPCRouter,
  communityProcedure,
  requireConfigAdmin,
} from "@/server/api/trpc";
import { communityAcquireConfig } from "@/server/db/schema";

const DEFAULTS = {
  crossPromote: true,
  referralsEnabled: true,
};

export const acquireConfigRouter = createTRPCRouter({
  get: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      const [row] = await ctx.db
        .select()
        .from(communityAcquireConfig)
        .where(eq(communityAcquireConfig.communityId, ctx.community.id))
        .limit(1);
      return row
        ? {
            crossPromote: row.crossPromote,
            referralsEnabled: row.referralsEnabled,
          }
        : DEFAULTS;
    }),

  set: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        crossPromote: z.boolean(),
        referralsEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const values = {
        crossPromote: input.crossPromote,
        referralsEnabled: input.referralsEnabled,
        updatedAt: new Date(),
      };
      await ctx.db
        .insert(communityAcquireConfig)
        .values({ communityId: ctx.community.id, ...values })
        .onConflictDoUpdate({
          target: communityAcquireConfig.communityId,
          set: values,
        });
      return { ok: true };
    }),
});
