import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { sendCommunityBroadcast } from "@/server/notifications/broadcast-send";

export const broadcastRouter = createTRPCRouter({
  /** Compose and send a PROMOTIONAL broadcast to a community's active members.
   *  In-app notification is always created; email is ceiling-gated per member.
   *  Transactional class is system-reserved (event reminders) — not sendable here. */
  send: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return sendCommunityBroadcast(ctx.db, {
        communityId: ctx.community.id,
        authorId: ctx.session.user.id,
        subject: input.subject,
        body: input.body,
      });
    }),
});
