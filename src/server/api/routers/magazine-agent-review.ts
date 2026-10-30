import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  approveAgentMagazineIssue,
  readAgentIssueReview,
  rejectAgentMagazineIssue,
} from "@/server/magazines/agent-magazine";
import { getPayloadClient } from "@/server/payload";

const draftId = z.object({ draftId: z.string().min(1).max(255) });

async function depsOf(ctx: {
  db: Parameters<typeof approveAgentMagazineIssue>[0]["db"];
}) {
  return { db: ctx.db, payload: await getPayloadClient() };
}

/** Human approval. Agents do not get this router. */
export const magazineAgentReviewRouter = createTRPCRouter({
  read: protectedProcedure.input(draftId).query(async ({ ctx, input }) => {
    const review = await readAgentIssueReview(
      await depsOf(ctx),
      ctx.session.user.id,
      input.draftId,
    );
    if (!review) return null;
    return review;
  }),
  approve: protectedProcedure
    .input(draftId)
    .mutation(async ({ ctx, input }) => {
      return approveAgentMagazineIssue(
        await depsOf(ctx),
        ctx.session.user.id,
        input.draftId,
      );
    }),
  reject: protectedProcedure.input(draftId).mutation(async ({ ctx, input }) => {
    return rejectAgentMagazineIssue(
      await depsOf(ctx),
      ctx.session.user.id,
      input.draftId,
    );
  }),
});
