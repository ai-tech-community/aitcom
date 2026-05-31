import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityInvites } from "@/server/db/schema";

export const referralRouter = createTRPCRouter({
  /** Get-or-create the caller's personal referral invite for this community. */
  myLink: communityProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx }) => {
      if (!ctx.communityRole) {
        // Only active members can refer into a community they belong to.
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = await ctx.db
        .select({ code: communityInvites.code })
        .from(communityInvites)
        .where(
          and(
            eq(communityInvites.communityId, ctx.community.id),
            eq(communityInvites.createdBy, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (existing[0]) return { code: existing[0].code };

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      await ctx.db.insert(communityInvites).values({
        communityId: ctx.community.id,
        code,
        createdBy: ctx.session.user.id,
        maxUses: null,
        expiresAt: null,
      });
      return { code };
    }),
});
