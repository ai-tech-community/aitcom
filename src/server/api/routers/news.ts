import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { revalidateNewsTable } from "@/server/news/cache";
import { isNewsStaff } from "@/server/news/staff";
import {
  moderateNewsRumor,
  rumorDb,
  submitNewsRumor,
} from "@/server/news/rumors";
import { rumorInputSchema, submitterLabel } from "@/server/news/rumor-rules";

import { storylineInputSchema } from "@/lib/news/storylines";
import {
  findStoryline,
  listStorylines,
  saveStoryline,
  searchStorylineArticles,
  StorylineError,
} from "@/server/news/storylines";

const storylineStaffProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!(await isNewsStaff(ctx.session.user.email)))
      throw new TRPCError({ code: "FORBIDDEN" });
    return next();
  },
);

export const newsRouter = createTRPCRouter({
  listStorylines: storylineStaffProcedure
    .input(
      z.object({
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(({ input }) => listStorylines({ ...input, staff: true })),
  readStoryline: storylineStaffProcedure
    .input(z.object({ id: z.string().min(1).max(255) }))
    .query(({ input }) => findStoryline(input, true)),
  searchStorylineArticles: storylineStaffProcedure
    .input(
      z.object({
        q: z.string().max(200).default(""),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(({ input }) => searchStorylineArticles(input.q, input.page)),
  saveStoryline: storylineStaffProcedure
    .input(storylineInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveStoryline(input, ctx.session.user.id);
      } catch (err) {
        if (err instanceof StorylineError)
          throw new TRPCError({
            code:
              err.code === "missing"
                ? "NOT_FOUND"
                : err.code === "conflict"
                  ? "CONFLICT"
                  : "BAD_REQUEST",
            message: err.message,
          });
        const cause =
          err instanceof Error
            ? (err as Error & { cause?: { code?: string }; code?: string })
            : null;
        if (cause?.code === "23505" || cause?.cause?.code === "23505")
          throw new TRPCError({ code: "CONFLICT", message: "slugTaken" });
        throw err;
      }
    }),
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
      revalidateNewsTable();
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
      revalidateNewsTable();
      return { ok: true as const };
    }),
});
