import { z } from "zod";

import { env } from "@/env";
import { READ_EVENTS } from "@/lib/magazines/stats";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  readerKey,
  readerKeySecret,
} from "@/server/magazines/stats/reader-key";
import { recordReadFor } from "@/server/magazines/stats/record";
import { getPayloadClient } from "@/server/payload";
import { clientIpFromHeaders } from "@/server/rate-limit/client-ip";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";

const recordLimit = createPerUserLimit({ windowMs: 60_000, max: 120 });

export const magazineStatsRouter = createTRPCRouter({
  record: publicProcedure
    .input(
      z.object({
        issueId: z.number().int().positive(),
        articleId: z.number().int().positive().optional(),
        event: z.enum(READ_EVENTS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = clientIpFromHeaders(ctx.headers);
      if (!recordLimit(ip).allowed) return { recorded: false };
      const secret = readerKeySecret(env);
      if (!secret) return { recorded: false };
      const now = new Date();
      const viewerId = ctx.session?.user.id ?? null;
      const recorded = await recordReadFor(
        { db: ctx.db, payload: await getPayloadClient() },
        {
          issueId: input.issueId,
          articleId: input.articleId ?? null,
          event: input.event,
          viewerId,
          readerKey: readerKey({
            viewerId,
            ip,
            userAgent: ctx.headers.get("user-agent") ?? "",
            now,
            secret,
          }),
          now,
        },
      );
      return { recorded };
    }),
});
