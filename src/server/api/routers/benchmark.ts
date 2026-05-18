// src/server/api/routers/benchmark.ts
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  agentProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  requireOwner,
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
  aggTopBrandByCategory,
} from "@/server/db/schema";
import {
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_PROVIDERS,
  BENCHMARK_SENTIMENTS,
} from "@/lib/benchmark-constants";
import { splitMentions } from "@/server/benchmark/ingest-extraction";
import { slugifyBrandName } from "@/server/benchmark/slugify";
import { extractRunInline } from "@/server/benchmark/extract-run";
import { suggestPromptsForBrand } from "@/server/benchmark/suggest-prompts";
import { checkSuggestPromptsRateLimit } from "@/server/benchmark/user-rate-limit";
import { after } from "next/server";
import {
  EXTRACTOR_VERSION,
  buildExtractorPrompt,
} from "@/server/benchmark/extractor-prompt";
import { buildSparkline } from "@/server/benchmark/build-sparkline";
import { benchmarkBrandsRouter } from "./benchmark-brands";

export const benchmarkRouter = createTRPCRouter({
  brands: benchmarkBrandsRouter,

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
        tag: z.string().min(1).max(40).optional(),
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
      if (input.tag) {
        conds.push(
          sql`${input.tag.toLowerCase()} = ANY(${benchmarkPrompts.tags})`,
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
        tags: z.array(z.string().min(1).max(40)).max(10).default([]),
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
            tags: input.tags
              .map((t) => t.trim().toLowerCase())
              .filter((t) => t.length > 0),
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

  suggestPrompts: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rl = checkSuggestPromptsRateLimit(userId);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limited. Retry after ${rl.retryAfterSecs}s.`,
        });
      }

      const [brand] = await ctx.db
        .select({
          canonicalName: brands.canonicalName,
          aliases: brands.aliases,
        })
        .from(brands)
        .where(eq(brands.slug, input.brandSlug))
        .limit(1);
      if (!brand) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }

      const [cats, ints] = await Promise.all([
        ctx.db
          .select({
            slug: benchmarkCategories.slug,
            name: benchmarkCategories.name,
          })
          .from(benchmarkCategories),
        ctx.db
          .select({
            slug: benchmarkIntents.slug,
            name: benchmarkIntents.name,
            description: benchmarkIntents.description,
          })
          .from(benchmarkIntents),
      ]);

      const suggestions = await suggestPromptsForBrand({
        brand: {
          canonicalName: brand.canonicalName,
          aliases: brand.aliases ?? [],
        },
        categories: cats,
        intents: ints,
        limit: input.limit,
      });

      return { suggestions, remaining: rl.remaining };
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
      .select({
        id: benchmarkRuns.id,
        promptId: benchmarkRuns.promptId,
        promptText: benchmarkPrompts.text,
        modelProvider: benchmarkRuns.modelProvider,
        modelId: benchmarkRuns.modelId,
        extractionStatus: benchmarkRuns.extractionStatus,
        capturedAt: benchmarkRuns.capturedAt,
        createdAt: benchmarkRuns.createdAt,
        rawAnswer: benchmarkRuns.rawAnswer,
      })
      .from(benchmarkRuns)
      .innerJoin(
        benchmarkPrompts,
        eq(benchmarkPrompts.id, benchmarkRuns.promptId),
      )
      .where(eq(benchmarkRuns.submittedByUserId, userId))
      .orderBy(desc(benchmarkRuns.createdAt))
      .limit(50);

    const mentionCounts =
      myRuns.length === 0
        ? []
        : await ctx.db
            .select({
              runId: benchmarkBrandMentions.runId,
              total: sql<number>`count(*)::int`,
              resolved: sql<number>`count(${benchmarkBrandMentions.brandId})::int`,
            })
            .from(benchmarkBrandMentions)
            .where(
              inArray(
                benchmarkBrandMentions.runId,
                myRuns.map((r) => r.id),
              ),
            )
            .groupBy(benchmarkBrandMentions.runId);
    const countsByRun = new Map(mentionCounts.map((c) => [c.runId, c]));

    const runs = myRuns.map((r) => {
      const c = countsByRun.get(r.id);
      return {
        ...r,
        mentionsTotal: c?.total ?? 0,
        mentionsResolved: c?.resolved ?? 0,
      };
    });

    return { prompts: myPrompts, runs };
  }),

  // Retry extraction for a run that is stuck `pending` or that `failed`.
  // Owner-only. Re-kicks extractRunInline via after().
  retryRunExtraction: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [run] = await ctx.db
        .select({
          id: benchmarkRuns.id,
          submittedByUserId: benchmarkRuns.submittedByUserId,
          extractionStatus: benchmarkRuns.extractionStatus,
        })
        .from(benchmarkRuns)
        .where(eq(benchmarkRuns.id, input.runId))
        .limit(1);
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found." });
      }
      if (run.submittedByUserId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only retry your own runs.",
        });
      }
      if (
        run.extractionStatus !== "pending" &&
        run.extractionStatus !== "failed"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot retry a run in state "${run.extractionStatus}".`,
        });
      }
      // Reset attempts so the run has a fresh shot.
      await ctx.db
        .update(benchmarkRuns)
        .set({ extractionStatus: "pending", extractionAttempts: 0 })
        .where(eq(benchmarkRuns.id, run.id));
      const runId = run.id;
      after(async () => {
        try {
          await extractRunInline(ctx.db, runId);
        } catch (err) {
          console.error(`[extract-run] retry failure for ${runId}:`, err);
        }
      });
      return { ok: true };
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

        // Kick off extraction via Next's `after()` so the serverless
        // runtime waits for it to complete before tearing down. A bare
        // `void extractRunInline(...)` promise was getting killed on
        // Vercel after the response flushed, leaving runs stuck in
        // `pending` with no `processing` update.
        const runId = run.id;
        after(async () => {
          try {
            await extractRunInline(ctx.db, runId);
          } catch (err) {
            console.error(`[extract-run] after() failure for ${runId}:`, err);
          }
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

        // Fetch run's category so auto-created brands inherit it.
        const [runRow] = await ctx.db
          .select({ promptId: benchmarkRuns.promptId })
          .from(benchmarkRuns)
          .where(eq(benchmarkRuns.id, input.runId))
          .limit(1);
        const [promptRow] = runRow
          ? await ctx.db
              .select({ categoryId: benchmarkPrompts.categoryId })
              .from(benchmarkPrompts)
              .where(eq(benchmarkPrompts.id, runRow.promptId))
              .limit(1)
          : [];
        const categoryId = promptRow?.categoryId;

        // Auto-create unverified brands for unresolved mentions. Dedup within
        // the batch by normalized rawMention; admins can merge duplicates later.
        const autoResolved: Array<(typeof resolved)[number]> = [];
        const nameToBrandId = new Map<string, string>();
        for (const m of unresolved) {
          const key = m.rawMention.trim().toLowerCase();
          let brandId = nameToBrandId.get(key);
          if (!brandId) {
            const slug =
              slugifyBrandName(m.rawMention) || `brand-${Date.now()}`;
            const [inserted] = await ctx.db
              .insert(brands)
              .values({
                slug,
                canonicalName: m.rawMention.trim(),
                aliases: [],
                categoryIds: categoryId ? [categoryId] : [],
                verified: false,
              })
              .onConflictDoNothing({ target: brands.slug })
              .returning({ id: brands.id });
            if (inserted) {
              brandId = inserted.id;
            } else {
              // Slug collision on a race — look it up.
              const [existing] = await ctx.db
                .select({ id: brands.id })
                .from(brands)
                .where(eq(brands.slug, slug))
                .limit(1);
              brandId = existing?.id;
            }
            if (brandId) nameToBrandId.set(key, brandId);
          }
          if (brandId) {
            autoResolved.push({
              rawMention: m.rawMention,
              brandId,
              rank: m.rank,
              sentiment: m.sentiment,
              context: m.context,
              confidence: m.confidence,
            });
          }
        }

        const allResolved = [...resolved, ...autoResolved];
        if (allResolved.length > 0) {
          await ctx.db.insert(benchmarkBrandMentions).values(
            allResolved.map((m) => ({
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

        await ctx.db
          .update(benchmarkRuns)
          .set({ extractionStatus: "done" })
          .where(eq(benchmarkRuns.id, input.runId));

        return {
          resolved: resolved.length,
          autoCreated: autoResolved.length,
        };
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
      const result = await ctx.db.execute(sql`
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
      return (result.rows ?? result) as Array<{
        id: string;
        canonical_name: string;
        slug: string;
        total_weighted: string;
      }>;
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
      // Compute live from raw runs/mentions so it stays consistent with
      // the ranked list. The materialized agg table is still rebuilt by
      // cron for the homepage overview, but relying on it here caused
      // the hero to lag behind the list after new extractions.
      const totalsRes = (await ctx.db.execute(sql`
        SELECT
          COUNT(DISTINCT r.id)::int AS total_answers,
          COUNT(DISTINCT r.model_id)::int AS models_sampled
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        WHERE (
            p.category_id = ${input.categoryId}
            OR ${input.categoryId} = ANY(p.inferred_category_ids)
          )
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
      `)) as unknown as {
        rows?: Array<{ total_answers: number; models_sampled: number }>;
      };
      const totals = (totalsRes.rows ??
        (totalsRes as unknown as Array<{
          total_answers: number;
          models_sampled: number;
        }>))[0] ?? { total_answers: 0, models_sampled: 0 };
      const totalAnswers = totals.total_answers;
      const modelsSampled = totals.models_sampled;

      if (totalAnswers === 0) return null;

      const brandRowsRes = (await ctx.db.execute(sql`
        SELECT
          m.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          b.website AS brand_website,
          COUNT(DISTINCT r.id)::int AS mention_count
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        JOIN "app"."brand" b ON b.id = m.brand_id
        WHERE m.brand_id IS NOT NULL
          AND (
            p.category_id = ${input.categoryId}
            OR ${input.categoryId} = ANY(p.inferred_category_ids)
          )
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
        GROUP BY m.brand_id, b.slug, b.canonical_name, b.website
        ORDER BY mention_count DESC, b.canonical_name ASC
        LIMIT 2
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          brand_website: string | null;
          mention_count: number;
        }>;
      };
      const brandRows =
        brandRowsRes.rows ??
        (brandRowsRes as unknown as Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          brand_website: string | null;
          mention_count: number;
        }>);

      const top = brandRows[0];
      if (!top) return null;
      const runner = brandRows[1];

      return {
        brand: {
          id: top.brand_id,
          slug: top.brand_slug,
          canonicalName: top.brand_canonical_name,
          website: top.brand_website,
        },
        mentionCount: top.mention_count,
        totalAnswers,
        sharePct: (top.mention_count / totalAnswers) * 100,
        modelsSampled,
        runnerUp: runner
          ? {
              brandId: runner.brand_id,
              canonicalName: runner.brand_canonical_name,
              sharePct: (runner.mention_count / totalAnswers) * 100,
            }
          : null,
        windowDays: input.windowDays,
        updatedAt: new Date(),
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

  getCategoryBrandList: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const totalRow = (await ctx.db.execute(sql`
        SELECT COUNT(DISTINCT r.id)::int AS total
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        WHERE (
            p.category_id = ${input.categoryId}
            OR ${input.categoryId} = ANY(p.inferred_category_ids)
          )
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
          AND r.extraction_status = 'done'
      `)) as unknown as { rows?: Array<{ total: number }> };
      const totalAnswers =
        (totalRow.rows ?? (totalRow as unknown as Array<{ total: number }>))[0]
          ?.total ?? 0;

      // Live brand mention counts (COUNT DISTINCT run) so mentionCount
      // matches totalAnswers' window. The agg_brand_trends_by_day table
      // is rebuilt on cron and lags behind new extractions, so we only
      // use it for sparklines below.
      const brandCountsRes = (await ctx.db.execute(sql`
        SELECT
          m.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          COUNT(DISTINCT r.id)::int AS mention_count
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        JOIN "app"."brand" b ON b.id = m.brand_id
        WHERE m.brand_id IS NOT NULL
          AND (
            p.category_id = ${input.categoryId}
            OR ${input.categoryId} = ANY(p.inferred_category_ids)
          )
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
        GROUP BY m.brand_id, b.slug, b.canonical_name
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          mention_count: number;
        }>;
      };
      const brandCounts =
        brandCountsRes.rows ??
        (brandCountsRes as unknown as Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          mention_count: number;
        }>);

      const trendRows = (await ctx.db.execute(sql`
        SELECT
          t.brand_id,
          t.date::text AS day,
          AVG(t.mention_pct::numeric) AS mention_pct
        FROM "app"."agg_brand_trends_by_day" t
        WHERE t.category_id = ${input.categoryId}
          AND t.date >= (CURRENT_DATE - (${input.windowDays} || ' days')::interval)::date
        GROUP BY t.brand_id, t.date
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          day: string;
          mention_pct: string;
        }>;
      };
      const rows =
        trendRows.rows ??
        (trendRows as unknown as Array<{
          brand_id: string;
          day: string;
          mention_pct: string;
        }>);

      type Accum = {
        brandId: string;
        slug: string;
        canonicalName: string;
        mentionCount: number;
        points: Array<{ date: string; value: number }>;
      };
      const byBrand = new Map<string, Accum>();
      for (const bc of brandCounts) {
        byBrand.set(bc.brand_id, {
          brandId: bc.brand_id,
          slug: bc.brand_slug,
          canonicalName: bc.brand_canonical_name,
          mentionCount: bc.mention_count,
          points: [],
        });
      }
      for (const r of rows) {
        const a = byBrand.get(r.brand_id);
        if (!a) continue;
        a.points.push({ date: r.day, value: Number(r.mention_pct) });
      }

      const brands = [...byBrand.values()]
        .map((a) => ({
          brandId: a.brandId,
          slug: a.slug,
          canonicalName: a.canonicalName,
          // Share = runs-that-mention-brand / total-runs-in-category-window.
          // (Not the average of daily mention_pct values: that averages a
          // string of 100%s when each day has one run, so every brand
          // trivially reads 100%.)
          sharePct:
            totalAnswers > 0 ? (a.mentionCount / totalAnswers) * 100 : 0,
          mentionCount: a.mentionCount,
          sparkline: buildSparkline(a.points, input.windowDays, 30),
          rank: 0,
        }))
        .sort((x, y) => {
          if (y.mentionCount !== x.mentionCount)
            return y.mentionCount - x.mentionCount;
          return x.canonicalName.localeCompare(y.canonicalName);
        });

      brands.forEach((b, i) => {
        b.rank = i + 1;
      });

      return {
        brands,
        totalAnswers,
        lowData: totalAnswers < 5,
      };
    }),

  getCategoryBrandTrend: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const trendRows = (await ctx.db.execute(sql`
        SELECT
          t.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          t.date::text AS day,
          AVG(t.mention_pct::numeric) AS mention_pct
        FROM "app"."agg_brand_trends_by_day" t
        JOIN "app"."brand" b ON b.id = t.brand_id
        WHERE t.category_id = ${input.categoryId}
          AND t.date >= (CURRENT_DATE - (${input.windowDays} || ' days')::interval)::date
        GROUP BY t.brand_id, b.slug, b.canonical_name, t.date
        ORDER BY t.brand_id, t.date
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          day: string;
          mention_pct: string;
        }>;
      };
      const rows =
        trendRows.rows ??
        (trendRows as unknown as Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          day: string;
          mention_pct: string;
        }>);

      type Series = {
        brandId: string;
        slug: string;
        canonicalName: string;
        rawPoints: Array<{ date: string; value: number }>;
      };
      const byBrand = new Map<string, Series>();
      for (const r of rows) {
        let s = byBrand.get(r.brand_id);
        if (!s) {
          s = {
            brandId: r.brand_id,
            slug: r.brand_slug,
            canonicalName: r.brand_canonical_name,
            rawPoints: [],
          };
          byBrand.set(r.brand_id, s);
        }
        s.rawPoints.push({ date: r.day, value: Number(r.mention_pct) });
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const dayMs = 86_400_000;

      const allDates: string[] = [];
      for (let i = input.windowDays - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * dayMs);
        allDates.push(d.toISOString().slice(0, 10));
      }

      const series = [...byBrand.values()].map((s) => {
        const byDate = new Map(s.rawPoints.map((p) => [p.date, p.value]));
        const points = allDates.map((d) => ({
          date: d,
          value: byDate.get(d) ?? 0,
        }));
        return {
          brandId: s.brandId,
          slug: s.slug,
          canonicalName: s.canonicalName,
          points,
        };
      });

      series.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

      return { series };
    }),

  // Brand × Model share matrix for a category+window. Cell =
  // mentions(brand,model) / total_runs(model). Used by the heatmap.
  getCategoryBrandModelMatrix: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
        topBrands: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const modelsRes = (await ctx.db.execute(sql`
        SELECT
          r.model_id,
          r.model_provider,
          COUNT(DISTINCT r.id)::int AS total_runs
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        WHERE (
            p.category_id = ${input.categoryId}
            OR ${input.categoryId} = ANY(p.inferred_category_ids)
          )
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
        GROUP BY r.model_id, r.model_provider
        ORDER BY total_runs DESC, r.model_id ASC
      `)) as unknown as {
        rows?: Array<{
          model_id: string;
          model_provider: string;
          total_runs: number;
        }>;
      };
      const modelRows =
        modelsRes.rows ??
        (modelsRes as unknown as Array<{
          model_id: string;
          model_provider: string;
          total_runs: number;
        }>);

      const cellsRes = (await ctx.db.execute(sql`
        SELECT
          m.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          r.model_id,
          COUNT(DISTINCT r.id)::int AS mention_count
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        JOIN "app"."brand" b ON b.id = m.brand_id
        WHERE (
            p.category_id = ${input.categoryId}
            OR ${input.categoryId} = ANY(p.inferred_category_ids)
          )
          AND r.extraction_status = 'done'
          AND m.brand_id IS NOT NULL
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
        GROUP BY m.brand_id, b.slug, b.canonical_name, r.model_id
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          model_id: string;
          mention_count: number;
        }>;
      };
      const cellRows =
        cellsRes.rows ??
        (cellsRes as unknown as Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          model_id: string;
          mention_count: number;
        }>);

      const models = modelRows.map((m) => ({
        modelId: m.model_id,
        modelProvider: m.model_provider,
        totalRuns: m.total_runs,
      }));
      const totalRunsByModel = new Map(
        models.map((m) => [m.modelId, m.totalRuns]),
      );

      type Agg = {
        brandId: string;
        slug: string;
        canonicalName: string;
        totalMentions: number;
        cells: Map<string, number>;
      };
      const byBrand = new Map<string, Agg>();
      for (const c of cellRows) {
        let a = byBrand.get(c.brand_id);
        if (!a) {
          a = {
            brandId: c.brand_id,
            slug: c.brand_slug,
            canonicalName: c.brand_canonical_name,
            totalMentions: 0,
            cells: new Map(),
          };
          byBrand.set(c.brand_id, a);
        }
        a.totalMentions += c.mention_count;
        a.cells.set(c.model_id, c.mention_count);
      }

      const brandsAgg = [...byBrand.values()]
        .sort((x, y) => {
          if (y.totalMentions !== x.totalMentions)
            return y.totalMentions - x.totalMentions;
          return x.canonicalName.localeCompare(y.canonicalName);
        })
        .slice(0, input.topBrands);

      const brands = brandsAgg.map((a) => ({
        brandId: a.brandId,
        slug: a.slug,
        canonicalName: a.canonicalName,
        totalMentions: a.totalMentions,
        cells: models.map((m) => {
          const mentions = a.cells.get(m.modelId) ?? 0;
          const total = totalRunsByModel.get(m.modelId) ?? 0;
          return {
            modelId: m.modelId,
            mentions,
            totalRuns: total,
            sharePct: total > 0 ? (mentions / total) * 100 : 0,
          };
        }),
      }));

      return { models, brands };
    }),

  // Per-model time series for a single brand in a category. Used by the
  // "Per model" overlay on the trend chart.
  getBrandModelTrend: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        brandSlug: z.string().min(1).max(120),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rowsRes = (await ctx.db.execute(sql`
        SELECT
          t.model_id,
          t.date::text AS day,
          t.mention_pct::numeric AS mention_pct
        FROM "app"."agg_brand_trends_by_day" t
        JOIN "app"."brand" b ON b.id = t.brand_id
        WHERE t.category_id = ${input.categoryId}
          AND b.slug = ${input.brandSlug}
          AND t.date >= (CURRENT_DATE - (${input.windowDays} || ' days')::interval)::date
      `)) as unknown as {
        rows?: Array<{ model_id: string; day: string; mention_pct: string }>;
      };
      const rows =
        rowsRes.rows ??
        (rowsRes as unknown as Array<{
          model_id: string;
          day: string;
          mention_pct: string;
        }>);

      type S = {
        modelId: string;
        raw: Map<string, number>;
      };
      const byModel = new Map<string, S>();
      for (const r of rows) {
        let s = byModel.get(r.model_id);
        if (!s) {
          s = { modelId: r.model_id, raw: new Map() };
          byModel.set(r.model_id, s);
        }
        s.raw.set(r.day, Number(r.mention_pct));
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const dayMs = 86_400_000;
      const allDates: string[] = [];
      for (let i = input.windowDays - 1; i >= 0; i--) {
        allDates.push(
          new Date(today.getTime() - i * dayMs).toISOString().slice(0, 10),
        );
      }

      const series = [...byModel.values()].map((s) => ({
        modelId: s.modelId,
        points: allDates.map((d) => ({ date: d, value: s.raw.get(d) ?? 0 })),
      }));
      series.sort((a, b) => a.modelId.localeCompare(b.modelId));

      return { series };
    }),

  // ── Agent (API-key) procedures — consumed by MCP tools ──────────────────

  agentListApprovedPrompts: agentProcedure
    .input(
      z.object({
        categorySlug: z.string().optional(),
        intentSlug: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(benchmarkPrompts.status, "approved")];
      if (input.categorySlug) {
        const [cat] = await ctx.db
          .select()
          .from(benchmarkCategories)
          .where(eq(benchmarkCategories.slug, input.categorySlug))
          .limit(1);
        if (cat) conds.push(eq(benchmarkPrompts.categoryId, cat.id));
      }
      if (input.intentSlug) {
        const [intent] = await ctx.db
          .select()
          .from(benchmarkIntents)
          .where(eq(benchmarkIntents.slug, input.intentSlug))
          .limit(1);
        if (intent) conds.push(eq(benchmarkPrompts.intentId, intent.id));
      }
      const rows = await ctx.db
        .select({
          id: benchmarkPrompts.id,
          text: benchmarkPrompts.text,
          categoryId: benchmarkPrompts.categoryId,
          intentId: benchmarkPrompts.intentId,
          locale: benchmarkPrompts.locale,
          approvedAt: benchmarkPrompts.approvedAt,
        })
        .from(benchmarkPrompts)
        .where(and(...conds))
        .orderBy(desc(benchmarkPrompts.approvedAt))
        .limit(input.limit);
      return rows;
    }),

  agentSubmitRun: agentProcedure
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ownerId = requireOwner(ctx.agent.ownerId);

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
            eq(benchmarkRuns.submittedByUserId, ownerId),
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

      const [run] = await ctx.db
        .insert(benchmarkRuns)
        .values({
          promptId: input.promptId,
          submittedByUserId: ownerId,
          agentId: ctx.agent.agentId,
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
        actorId: ownerId,
        actorType: "agent",
        action: "benchmark.run.created",
        targetType: "benchmark_run",
        targetId: run.id,
        metadata: {
          promptId: input.promptId,
          modelId: input.modelId,
          modelProvider: input.modelProvider,
          agentId: ctx.agent.agentId,
        },
      });

      const runId = run.id;
      after(async () => {
        try {
          await extractRunInline(ctx.db, runId);
        } catch (err) {
          console.error(`[extract-run] after() failure for ${runId}:`, err);
        }
      });

      return {
        runId: run.id,
        extractionStatus: run.extractionStatus,
      };
    }),
});
