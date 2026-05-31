import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { rankCommunitiesForMember } from "@/server/communities/discovery";
import {
  loadDiscoveryCandidates,
  loadMemberCommunityIds,
} from "@/server/communities/discovery-queries";

export const discoveryRouter = createTRPCRouter({
  /** Liveness-ranked communities the caller is not yet in. */
  recommendedForMe: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(6) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const [candidates, memberCommunityIds] = await Promise.all([
        loadDiscoveryCandidates(ctx.db, now),
        loadMemberCommunityIds(ctx.db, ctx.session.user.id),
      ]);
      return rankCommunitiesForMember({
        candidates,
        memberCommunityIds,
        limit: input.limit,
      });
    }),
});
