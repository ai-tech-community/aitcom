import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { loadReferralLeaderboard } from "@/server/communities/referral-queries";
import { referralBatchInput } from "@/lib/referral-invites";
import {
  personalReferralLink,
  queueReferralBatch,
  referralBatchResult,
  referralContext,
  referralWorkspace,
} from "@/server/communities/referral-email/service";
import { dispatchReferralEmails } from "@/server/communities/referral-email/dispatch";

export const referralRouter = createTRPCRouter({
  /** Get-or-create the caller's personal referral invite for this community. */
  myLink: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const context = await referralContext(
        ctx.db,
        ctx.session.user.id,
        input.slug,
      );
      if (!context.referralsEnabled) throw new TRPCError({ code: "FORBIDDEN" });
      return personalReferralLink(ctx.db, context);
    }),

  workspace: protectedProcedure
    .input(z.object({ slug: z.string().default("ait") }))
    .query(async ({ ctx, input }) =>
      referralWorkspace(
        ctx.db,
        await referralContext(ctx.db, ctx.session.user.id, input.slug),
      ),
    ),

  sendInvites: protectedProcedure
    .input(referralBatchInput)
    .mutation(async ({ ctx, input }) => {
      const context = await referralContext(
        ctx.db,
        ctx.session.user.id,
        input.slug,
      );
      const batch = await queueReferralBatch(ctx.db, context, input);
      await dispatchReferralEmails(ctx.db, batch.batchId);
      return referralBatchResult(
        ctx.db,
        ctx.session.user.id,
        batch.batchId,
        batch.skipped,
        input.emails,
      );
    }),

  leaderboard: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return loadReferralLeaderboard(ctx.db, input.limit);
    }),
});
