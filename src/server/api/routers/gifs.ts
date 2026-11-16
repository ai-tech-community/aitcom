import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getGiphyClient } from "@/server/giphy/giphy";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

/**
 * GIF searches per member: GIPHY's quota is shared by the whole app, so
 * one member paging through results must not use it up for everyone.
 */
const checkGifSearchLimit = createPerUserLimit({
  windowMs: 3_600_000, // 1 hour
  max: 60,
});

export const gifsRouter = createTRPCRouter({
  /**
   * GIFs for any GIF picker (the post editor, a message): trending without
   * a query, otherwise a search in the member's language. Open to every
   * signed-in member; the per-member limit keeps the app's GIPHY quota safe.
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().max(50).default(""),
        /** The offset of the page, for infinite loading. */
        cursor: z.number().int().min(0).max(4999).nullish(),
        lang: z.enum(routing.locales).default("en"),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!checkGifSearchLimit(ctx.session.user.id).allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "GIF search is busy. Try again in a few minutes.",
        });
      }
      const giphy = getGiphyClient();
      const query = input.query.trim();
      const offset = input.cursor ?? 0;
      const page = query
        ? await giphy.search({ query, offset, lang: input.lang })
        : await giphy.trending({ offset });
      return { gifs: page.gifs, nextCursor: page.nextOffset };
    }),
});
