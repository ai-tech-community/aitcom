// src/server/api/routers/benchmark.ts
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
  brandAliasQueue,
  aggBrandRankByPrompt,
  aggBrandTrendsByDay,
  aggModelBiasMatrix,
  aggTopBrandByCategory,
} from "@/server/db/schema";
import {
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_PROVIDERS,
  BENCHMARK_SENTIMENTS,
} from "@/lib/benchmark-constants";
import { splitMentions } from "@/server/benchmark/ingest-extraction";
import {
  EXTRACTOR_VERSION,
  buildExtractorPrompt,
} from "@/server/benchmark/extractor-prompt";

export const benchmarkRouter = createTRPCRouter({
  listCategories: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(benchmarkCategories)
      .orderBy(asc(benchmarkCategories.name));
    return rows;
  }),

  listIntents: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(benchmarkIntents)
      .orderBy(asc(benchmarkIntents.name));
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
      if (input.categoryId)
        conds.push(eq(benchmarkPrompts.categoryId, input.categoryId));
      if (input.intentId)
        conds.push(eq(benchmarkPrompts.intentId, input.intentId));
      if (input.search) {
        conds.push(
          sql`lower(${benchmarkPrompts.text}) like ${"%" + input.search.toLowerCase() + "%"}`,
        );
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
      if (prompt?.status !== "approved") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Prompt not found or not approved.",
        });
      }

      const capturedAt = input.capturedAt
        ? new Date(input.capturedAt)
        : new Date();

      const dayStart = new Date(capturedAt);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const [existing] = await ctx.db
        .select({ id: benchmarkRuns.id })
        .from(benchmarkRuns)
        .where(
          and(
            eq(benchmarkRuns.submittedByUserId, userId),
            eq(benchmarkRuns.promptId, input.promptId),
            eq(benchmarkRuns.modelId, input.modelId),
            sql`${benchmarkRuns.capturedAt} >= ${dayStart.toISOString()}`,
            sql`${benchmarkRuns.capturedAt} < ${dayEnd.toISOString()}`,
          ),
        )
        .limit(1);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "You already submitted this prompt/model combo today. Try again tomorrow.",
        });
      }

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
        throw err;
      }
    }),

  getRunForExtraction: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(benchmarkRuns)
        .where(eq(benchmarkRuns.id, input.runId))
        .limit(1);
      if (!run)
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });

      const [prompt] = await ctx.db
        .select()
        .from(benchmarkPrompts)
        .where(eq(benchmarkPrompts.id, run.promptId))
        .limit(1);
      if (!prompt)
        throw new TRPCError({ code: "NOT_FOUND", message: "Prompt missing" });

      const brandRows = await ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          aliases: brands.aliases,
          categoryIds: brands.categoryIds,
        })
        .from(brands)
        .where(sql`${prompt.categoryId} = ANY(${brands.categoryIds})`);

      return {
        runId: run.id,
        promptText: prompt.text,
        rawAnswer: run.rawAnswer,
        knownBrands: brandRows.map((b) => ({
          slug: b.slug,
          canonicalName: b.canonicalName,
          aliases: b.aliases ?? [],
        })),
        extractorVersion: EXTRACTOR_VERSION,
        renderedPrompt: buildExtractorPrompt({
          promptText: prompt.text,
          rawAnswer: run.rawAnswer,
          knownBrands: brandRows.map((b) => ({
            slug: b.slug,
            canonicalName: b.canonicalName,
            aliases: b.aliases ?? [],
          })),
        }),
      };
    }),

  submitExtraction: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        extractorVersion: z.string().min(1).max(40),
        mentions: z
          .array(
            z.object({
              rawMention: z.string().min(1).max(500),
              suggestedBrandSlug: z.string().max(200).nullable(),
              rank: z.number().int().min(1).max(100).nullable(),
              sentiment: z.enum(BENCHMARK_SENTIMENTS),
              context: z.string().max(280),
              confidence: z.number().min(0).max(1),
            }),
          )
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(benchmarkRuns)
        .set({ extractionStatus: "processing" })
        .where(eq(benchmarkRuns.id, input.runId));

      try {
        const brandRows = await ctx.db
          .select({
            id: brands.id,
            slug: brands.slug,
            canonicalName: brands.canonicalName,
            aliases: brands.aliases,
          })
          .from(brands);

        const brandsByKey = new Map<string, { id: string; slug: string }>();
        for (const b of brandRows) {
          brandsByKey.set(b.slug.toLowerCase(), { id: b.id, slug: b.slug });
          brandsByKey.set(b.canonicalName.toLowerCase(), {
            id: b.id,
            slug: b.slug,
          });
          for (const a of b.aliases ?? []) {
            brandsByKey.set(a.toLowerCase(), { id: b.id, slug: b.slug });
          }
        }

        const { resolved, unresolved } = splitMentions(
          input.mentions,
          brandsByKey,
        );

        if (resolved.length > 0) {
          await ctx.db.insert(benchmarkBrandMentions).values(
            resolved.map((m) => ({
              runId: input.runId,
              rawMention: m.rawMention,
              brandId: m.brandId,
              rank: m.rank,
              sentiment: m.sentiment,
              context: m.context,
              confidence: m.confidence.toString(),
              extractorVersion: input.extractorVersion,
            })),
          );
        }

        if (unresolved.length > 0) {
          await ctx.db.insert(benchmarkBrandMentions).values(
            unresolved.map((m) => ({
              runId: input.runId,
              rawMention: m.rawMention,
              brandId: null,
              rank: m.rank,
              sentiment: m.sentiment,
              context: m.context,
              confidence: m.confidence.toString(),
              extractorVersion: input.extractorVersion,
            })),
          );
          for (const m of unresolved) {
            const [existing] = await ctx.db
              .select({ id: brandAliasQueue.id })
              .from(brandAliasQueue)
              .where(
                sql`lower(${brandAliasQueue.rawMention}) = lower(${m.rawMention})`,
              )
              .limit(1);
            if (existing) {
              await ctx.db
                .update(brandAliasQueue)
                .set({
                  occurrenceCount: sql`${brandAliasQueue.occurrenceCount} + 1`,
                })
                .where(eq(brandAliasQueue.id, existing.id));
            } else {
              await ctx.db.insert(brandAliasQueue).values({
                rawMention: m.rawMention,
                runId: input.runId,
                occurrenceCount: 1,
                status: "pending",
              });
            }
          }
        }

        await ctx.db
          .update(benchmarkRuns)
          .set({ extractionStatus: "done" })
          .where(eq(benchmarkRuns.id, input.runId));

        return { resolved: resolved.length, unresolved: unresolved.length };
      } catch (err) {
        await ctx.db
          .update(benchmarkRuns)
          .set({
            extractionStatus: sql`CASE WHEN ${benchmarkRuns.extractionAttempts} >= 2 THEN 'failed' ELSE 'pending' END`,
            extractionAttempts: sql`${benchmarkRuns.extractionAttempts} + 1`,
          })
          .where(eq(benchmarkRuns.id, input.runId));
        throw err;
      }
    }),

  getPromptDashboard: publicProcedure
    .input(
      z.object({
        promptId: z.string().uuid(),
        windowDays: z.number().int().min(1).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rankRows = await ctx.db
        .select()
        .from(aggBrandRankByPrompt)
        .where(
          and(
            eq(aggBrandRankByPrompt.promptId, input.promptId),
            eq(aggBrandRankByPrompt.windowDays, input.windowDays),
          ),
        );
      const matrixRows = await ctx.db
        .select()
        .from(aggModelBiasMatrix)
        .where(eq(aggModelBiasMatrix.promptId, input.promptId));
      return { rankRows, matrixRows };
    }),

  getTrend: publicProcedure
    .input(
      z.object({
        brandId: z.string().uuid(),
        modelIds: z.array(z.string()).max(10).optional(),
        windowDays: z.number().int().min(7).max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.windowDays * 86_400_000);
      const conds = [
        eq(aggBrandTrendsByDay.brandId, input.brandId),
        sql`${aggBrandTrendsByDay.date} >= ${since.toISOString().slice(0, 10)}`,
      ];
      if (input.modelIds?.length)
        conds.push(inArray(aggBrandTrendsByDay.modelId, input.modelIds));
      return ctx.db
        .select()
        .from(aggBrandTrendsByDay)
        .where(and(...conds))
        .orderBy(asc(aggBrandTrendsByDay.date));
    }),

  getCategoryLeaderboard: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z.number().int().min(7).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.execute(sql`
        SELECT b.id, b.canonical_name, b.slug,
               SUM(r.weighted_score) AS total_weighted
        FROM ${aggBrandRankByPrompt} r
        JOIN ${benchmarkPrompts} p ON p.id = r.prompt_id
        JOIN ${brands} b ON b.id = r.brand_id
        WHERE p.category_id = ${input.categoryId}
          AND r.window_days = ${input.windowDays}
        GROUP BY b.id, b.canonical_name, b.slug
        ORDER BY total_weighted DESC
        LIMIT 10
      `);
    }),

  getBrandProfile: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const [brand] = await ctx.db
        .select()
        .from(brands)
        .where(eq(brands.slug, input.slug))
        .limit(1);
      if (!brand)
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      const mentions = await ctx.db
        .select({
          runId: benchmarkBrandMentions.runId,
          modelId: benchmarkRuns.modelId,
          modelProvider: benchmarkRuns.modelProvider,
          sentiment: benchmarkBrandMentions.sentiment,
          context: benchmarkBrandMentions.context,
          capturedAt: benchmarkRuns.capturedAt,
        })
        .from(benchmarkBrandMentions)
        .innerJoin(
          benchmarkRuns,
          eq(benchmarkRuns.id, benchmarkBrandMentions.runId),
        )
        .where(eq(benchmarkBrandMentions.brandId, brand.id))
        .orderBy(desc(benchmarkRuns.capturedAt))
        .limit(100);
      return { brand, mentions };
    }),

  getLatestRunsFeed: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: benchmarkRuns.id,
          promptId: benchmarkRuns.promptId,
          modelId: benchmarkRuns.modelId,
          modelProvider: benchmarkRuns.modelProvider,
          capturedAt: benchmarkRuns.capturedAt,
          extractionStatus: benchmarkRuns.extractionStatus,
        })
        .from(benchmarkRuns)
        .orderBy(desc(benchmarkRuns.capturedAt))
        .limit(input.limit);
    }),

  getHeroTopBrand: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
        modelScope: z.string().max(32).default("all"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(aggTopBrandByCategory)
        .where(
          and(
            eq(aggTopBrandByCategory.categoryId, input.categoryId),
            eq(aggTopBrandByCategory.windowDays, input.windowDays),
            eq(aggTopBrandByCategory.modelScope, input.modelScope),
          ),
        )
        .limit(1);

      if (!row) return null;

      const [brand] = await ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          website: brands.website,
        })
        .from(brands)
        .where(eq(brands.id, row.brandId))
        .limit(1);

      if (!brand) return null;

      return {
        brand,
        mentionCount: row.mentionCount,
        totalAnswers: row.totalAnswers,
        sharePct: Number(row.sharePct),
        modelsSampled: row.modelsSampled,
        runnerUp: row.runnerUpBrandId
          ? {
              brandId: row.runnerUpBrandId,
              canonicalName: row.runnerUpCanonicalName,
              sharePct:
                row.runnerUpSharePct !== null
                  ? Number(row.runnerUpSharePct)
                  : null,
            }
          : null,
        windowDays: row.windowDays as 7 | 30 | 90,
        updatedAt: row.updatedAt,
      };
    }),

  getHeroOverview: publicProcedure
    .input(
      z.object({
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
        modelScope: z.string().max(32).default("all"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          categoryId: aggTopBrandByCategory.categoryId,
          sharePct: aggTopBrandByCategory.sharePct,
        })
        .from(aggTopBrandByCategory)
        .where(
          and(
            eq(aggTopBrandByCategory.windowDays, input.windowDays),
            eq(aggTopBrandByCategory.modelScope, input.modelScope),
          ),
        );
      return rows.map((r) => ({
        categoryId: r.categoryId,
        sharePct: Number(r.sharePct),
      }));
    }),
});
