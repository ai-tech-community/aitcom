import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { isNewsStaff } from "@/server/news/staff";
import {
  moderateNewsRumor,
  rumorDb,
  submitNewsRumor,
} from "@/server/news/rumors";
import { rumorInputSchema, submitterLabel } from "@/server/news/rumor-rules";

export const newsRouter = createTRPCRouter({
  submitRumor: protectedProcedure
    .input(rumorInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await submitNewsRumor(rumorDb, {
        userId: ctx.session.user.id,
        submitterName: submitterLabel(ctx.session.user),
        input,
        now: new Date(),
      });
      if (!result.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "rate",
        });
      }
      return { id: result.id };
    }),

  moderateRumor: protectedProcedure
    .input(
      z.object({
        id: z.string().trim().min(1).max(255),
        action: z.enum(["hide", "show", "delete"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await isNewsStaff(ctx.session.user.email);
      const result = await moderateNewsRumor(rumorDb, {
        staff,
        action: input.action,
        id: input.id,
        now: new Date(),
      });
      if (result === "forbidden") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (result === "missing") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { ok: true as const };
    }),
});
