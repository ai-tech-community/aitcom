import { z } from "zod";
import { eq } from "drizzle-orm";

import {
  createTRPCRouter,
  communityProcedure,
  requireConfigAdmin,
} from "@/server/api/trpc";
import { communityActivationConfig } from "@/server/db/schema";
import { DEFAULT_ACTIVATION_CONFIG } from "@/server/communities/activation";

export const activationConfigRouter = createTRPCRouter({
  get: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      const [row] = await ctx.db
        .select()
        .from(communityActivationConfig)
        .where(eq(communityActivationConfig.communityId, ctx.community.id))
        .limit(1);
      return row
        ? {
            requireResponse: row.requireResponse,
            requireProfileComplete: row.requireProfileComplete,
            windowDays: row.windowDays,
          }
        : DEFAULT_ACTIVATION_CONFIG;
    }),

  set: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        requireResponse: z.boolean(),
        requireProfileComplete: z.boolean(),
        windowDays: z.number().int().min(1).max(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      const values = {
        requireResponse: input.requireResponse,
        requireProfileComplete: input.requireProfileComplete,
        windowDays: input.windowDays,
        updatedAt: new Date(),
      };
      await ctx.db
        .insert(communityActivationConfig)
        .values({ communityId: ctx.community.id, ...values })
        .onConflictDoUpdate({
          target: communityActivationConfig.communityId,
          set: values,
        });
      return { ok: true };
    }),
});
