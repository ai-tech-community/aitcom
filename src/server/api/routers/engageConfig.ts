import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityEngageConfig } from "@/server/db/schema";

const DEFAULTS = {
  ritualRecap: true,
  ritualReminder: true,
  atRiskLine: false,
};

function requireConfigAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const engageConfigRouter = createTRPCRouter({
  get: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      const [row] = await ctx.db
        .select()
        .from(communityEngageConfig)
        .where(eq(communityEngageConfig.communityId, ctx.community.id))
        .limit(1);
      return row
        ? {
            ritualRecap: row.ritualRecap,
            ritualReminder: row.ritualReminder,
            atRiskLine: row.atRiskLine,
          }
        : DEFAULTS;
    }),

  set: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        ritualRecap: z.boolean(),
        ritualReminder: z.boolean(),
        atRiskLine: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      await ctx.db
        .insert(communityEngageConfig)
        .values({
          communityId: ctx.community.id,
          ritualRecap: input.ritualRecap,
          ritualReminder: input.ritualReminder,
          atRiskLine: input.atRiskLine,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: communityEngageConfig.communityId,
          set: {
            ritualRecap: input.ritualRecap,
            ritualReminder: input.ritualReminder,
            atRiskLine: input.atRiskLine,
            updatedAt: new Date(),
          },
        });
      return { ok: true };
    }),
});
