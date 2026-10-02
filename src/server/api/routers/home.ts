import { z } from "zod";

import { routing } from "@/i18n/routing";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { composeNextUp } from "@/server/home/next-up/compose";
import { NEXT_UP_LOADERS } from "@/server/home/next-up/loaders";
import { getPayloadClient } from "@/server/payload";

/** Read models for the member dashboard's Home tab. */
export const homeRouter = createTRPCRouter({
  /**
   * What the member could do next: upcoming events, challenges, invites,
   * join requests to review and unread counts, already ordered. `partial`
   * is true when a source failed and its items are missing.
   */
  nextUp: protectedProcedure
    .input(z.object({ locale: z.enum(routing.locales) }))
    .query(({ ctx, input }) =>
      composeNextUp(NEXT_UP_LOADERS, {
        db: ctx.db,
        userId: ctx.session.user.id,
        locale: input.locale,
        now: new Date(),
        getPayload: getPayloadClient,
      }),
    ),
});
