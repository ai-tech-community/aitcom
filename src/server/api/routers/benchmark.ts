// src/server/api/routers/benchmark.ts
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { logActivity } from "@/server/agent/activity";
import {
  benchmarkCategories,
  benchmarkIntents,
  benchmarkPrompts,
  benchmarkRuns,
  benchmarkBrandMentions,
  brands,
  aggBrandRankByPrompt,
  aggBrandTrendsByDay,
  aggModelBiasMatrix,
} from "@/server/db/schema";
import {
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_PROVIDERS,
  BENCHMARK_SENTIMENTS,
} from "@/lib/benchmark-constants";

export const benchmarkRouter = createTRPCRouter({
  listCategories: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(benchmarkCategories)
      .orderBy(asc(benchmarkCategories.name));
    return rows;
  }),

  listIntents: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(benchmarkIntents).orderBy(asc(benchmarkIntents.name));
  }),

  listApprovedPrompts: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid().optional(),
        intentId: z.string().uuid().optional(),
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(benchmarkPrompts.status, "approved")];
      if (input.categoryId) conds.push(eq(benchmarkPrompts.categoryId, input.categoryId));
      if (input.intentId) conds.push(eq(benchmarkPrompts.intentId, input.intentId));
      if (input.search) {
        conds.push(sql`lower(${benchmarkPrompts.text}) like ${"%" + input.search.toLowerCase() + "%"}`);
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await ctx.db
        .select()
        .from(benchmarkPrompts)
        .where(and(...conds))
        .orderBy(desc(benchmarkPrompts.approvedAt))
        .limit(input.pageSize)
        .offset(offset);
      return rows;
    }),

  submitPrompt: protectedProcedure
    .input(
      z.object({
        text: z.string().min(4).max(500),
        categoryId: z.string().uuid(),
        intentId: z.string().uuid(),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      try {
        const [row] = await ctx.db
          .insert(benchmarkPrompts)
          .values({
            text: input.text.trim(),
            categoryId: input.categoryId,
            intentId: input.intentId,
            locale: input.locale,
            submittedByUserId: userId,
            status: "pending",
          })
          .returning();
        return row;
      } catch (err) {
        if (String(err).includes("benchmark_prompt_dedupe_idx")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This prompt already exists for that category and intent.",
          });
        }
        throw err;
      }
    }),

  listMySubmissions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const myPrompts = await ctx.db
      .select()
      .from(benchmarkPrompts)
      .where(eq(benchmarkPrompts.submittedByUserId, userId))
      .orderBy(desc(benchmarkPrompts.createdAt))
      .limit(50);
    const myRuns = await ctx.db
      .select()
      .from(benchmarkRuns)
      .where(eq(benchmarkRuns.submittedByUserId, userId))
      .orderBy(desc(benchmarkRuns.createdAt))
      .limit(50);
    return { prompts: myPrompts, runs: myRuns };
  }),

  submitRun: protectedProcedure
    .input(
      z.object({
        promptId: z.string().uuid(),
        modelProvider: z.enum(BENCHMARK_MODEL_PROVIDERS),
        modelId: z.string().min(1).max(120),
        modelVersion: z.string().max(120).optional(),
        temperature: z.number().min(0).max(2).optional(),
        rawAnswer: z.string().min(1).max(50_000),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
        capturedAt: z.string().datetime().optional(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Confirm prompt exists and is approved
      const [prompt] = await ctx.db
        .select()
        .from(benchmarkPrompts)
        .where(eq(benchmarkPrompts.id, input.promptId))
        .limit(1);
      if (!prompt || prompt.status !== "approved") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Prompt not found or not approved.",
        });
      }

      const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

      try {
        const [run] = await ctx.db
          .insert(benchmarkRuns)
          .values({
            promptId: input.promptId,
            submittedByUserId: userId,
            agentId: input.agentId ?? null,
            modelProvider: input.modelProvider,
            modelId: input.modelId,
            modelVersion: input.modelVersion ?? null,
            temperature: input.temperature?.toString() ?? null,
            rawAnswer: input.rawAnswer,
            locale: input.locale,
            capturedAt,
            extractionStatus: "pending",
          })
          .returning();

        if (!run) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create benchmark run.",
          });
        }

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: input.agentId ? "agent" : "member",
          action: "benchmark.run.created",
          targetType: "benchmark_run",
          targetId: run.id,
          metadata: {
            promptId: input.promptId,
            modelId: input.modelId,
            modelProvider: input.modelProvider,
          },
        });

        return run;
      } catch (err) {
        if (String(err).includes("benchmark_run_dedupe_idx")) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "You already submitted this prompt/model combo today. Try again tomorrow.",
          });
        }
        throw err;
      }
    }),
});
