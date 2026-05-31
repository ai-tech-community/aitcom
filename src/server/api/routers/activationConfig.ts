import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityActivationConfig } from "@/server/db/schema";

const DEFAULTS = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};

function requireConfigAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

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
        : DEFAULTS;
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
