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
  benchmarkAssignments,
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
  aggCoverageByCell,
} from "@/server/db/schema";
import {
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_PROVIDERS,
  BENCHMARK_MODEL_SURFACES,
  BENCHMARK_SENTIMENTS,
  BENCHMARK_SURFACE_THRESHOLD_CONTRIBUTORS,
  providerForSurface,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";
import { splitMentions } from "@/server/benchmark/ingest-extraction";
import { slugifyBrandName } from "@/server/benchmark/slugify";
import { extractRunInline } from "@/server/benchmark/extract-run";
import { computeContributorWeight } from "@/server/benchmark/contributor-weight";
import { suggestPromptsForBrand } from "@/server/benchmark/suggest-prompts";
import { checkSuggestPromptsRateLimit } from "@/server/benchmark/user-rate-limit";
import { after } from "next/server";
import {
  EXTRACTOR_VERSION,
  buildExtractorPrompt,
} from "@/server/benchmark/extractor-prompt";
import { buildSparkline } from "@/server/benchmark/build-sparkline";
import { benchmarkBrandsRouter } from "./benchmark-brands";
import {
  AssignmentFilterNotFoundError,
  AssignmentMetadataMismatchError,
  buildAssignmentInstructions,
  requireAssignmentFilter,
  selectAssignmentPrompts,
  validateAssignmentRunMetadata,
} from "@/server/benchmark/assignment";

function requireBenchmarkAssignmentFilter<T>(
  label: string,
  slug: string | undefined,
  row: T | undefined,
): T | undefined {
  try {
    return requireAssignmentFilter(label, slug, row);
  } catch (err) {
    if (err instanceof AssignmentFilterNotFoundError) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: err.message,
      });
    }
    throw err;
  }
}

function requireBenchmarkAssignmentRunMetadata(
  assignment: {
    modelProvider: string | null;
    modelId: string | null;
    locale: string | null;
  },
  run: {
    modelProvider: string;
    modelId: string | null;
    locale: string;
  },
): void {
  try {
    validateAssignmentRunMetadata(assignment, run);
  } catch (err) {
    if (err instanceof AssignmentMetadataMismatchError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err.message,
      });
    }
    throw err;
  }
}

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

  // Coverage status per (prompt, model_surface) cell. Used by the
  // coverage map UI on the run-prompts tab and (later) the brand page.
  // Returns one row per surface for each requested prompt, including
  // surfaces with zero submissions (synthesised on the read side so the
  // UI always shows the full surface matrix).
  // See [[adr-0007-byoa-trust-model]] decision 2 and
  // [[adr-0008-byoa-coverage-strategy]].
  listPromptCoverage: publicProcedure
    .input(
      z.object({
        promptIds: z.array(z.string().uuid()).min(1).max(100),
        windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          promptId: aggCoverageByCell.promptId,
          modelSurface: aggCoverageByCell.modelSurface,
          distinctContributors: aggCoverageByCell.distinctContributors,
          runsTotal: aggCoverageByCell.runsTotal,
          meetsThreshold: aggCoverageByCell.meetsThreshold,
        })
        .from(aggCoverageByCell)
        .where(
          and(
            inArray(aggCoverageByCell.promptId, input.promptIds),
            eq(aggCoverageByCell.windowDays, input.windowDays),
          ),
        );

      const byPrompt = new Map<
        string,
        Map<
          BenchmarkModelSurface,
          {
            modelSurface: BenchmarkModelSurface;
            distinctContributors: number;
            runsTotal: number;
            meetsThreshold: boolean;
          }
        >
      >();
      for (const r of rows) {
        const surface = r.modelSurface as BenchmarkModelSurface;
        if (surface === ("legacy_unverified" as BenchmarkModelSurface)) continue;
        const inner =
          byPrompt.get(r.promptId) ??
          new Map<BenchmarkModelSurface, never>();
        inner.set(surface, {
          modelSurface: surface,
          distinctContributors: r.distinctContributors,
          runsTotal: r.runsTotal,
          meetsThreshold: r.meetsThreshold,
        });
        byPrompt.set(r.promptId, inner);
      }

      const threshold = BENCHMARK_SURFACE_THRESHOLD_CONTRIBUTORS;
      const result: Record<
        string,
        Array<{
          modelSurface: BenchmarkModelSurface;
          distinctContributors: number;
          runsTotal: number;
          meetsThreshold: boolean;
          needed: number;
        }>
      > = {};
      for (const promptId of input.promptIds) {
        const inner = byPrompt.get(promptId);
        result[promptId] = BENCHMARK_MODEL_SURFACES.map((surface) => {
          const cell = inner?.get(surface);
          const distinctContributors = cell?.distinctContributors ?? 0;
          const runsTotal = cell?.runsTotal ?? 0;
          const meetsThreshold = cell?.meetsThreshold ?? false;
          return {
            modelSurface: surface,
            distinctContributors,
            runsTotal,
            meetsThreshold,
            needed: Math.max(0, threshold - distinctContributors),
          };
        });
      }

      return { threshold, byPrompt: result };
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

  createAssignment: protectedProcedure
    .input(
      z.object({
        categorySlug: z.string().optional(),
        intentSlug: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(5),
        modelProvider: z.enum(BENCHMARK_MODEL_PROVIDERS).optional(),
        modelId: z.string().min(1).max(120).optional(),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conds = [
        eq(benchmarkPrompts.status, "approved"),
        sql`${benchmarkPrompts.approvedAt} IS NOT NULL`,
      ];

      if (input.categorySlug) {
        const [categoryRow] = await ctx.db
          .select({ id: benchmarkCategories.id })
          .from(benchmarkCategories)
          .where(eq(benchmarkCategories.slug, input.categorySlug))
          .limit(1);
        const category = requireBenchmarkAssignmentFilter(
          "Category",
          input.categorySlug,
          categoryRow,
        );
        if (category) {
          conds.push(eq(benchmarkPrompts.categoryId, category.id));
        }
      }

      if (input.intentSlug) {
        const [intentRow] = await ctx.db
          .select({ id: benchmarkIntents.id })
          .from(benchmarkIntents)
          .where(eq(benchmarkIntents.slug, input.intentSlug))
          .limit(1);
        const intent = requireBenchmarkAssignmentFilter(
          "Intent",
          input.intentSlug,
          intentRow,
        );
        if (intent) {
          conds.push(eq(benchmarkPrompts.intentId, intent.id));
        }
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
        .orderBy(desc(benchmarkPrompts.approvedAt), asc(benchmarkPrompts.id))
        .limit(100);

      const approvedPromptRows = rows.flatMap((prompt) =>
        prompt.approvedAt ? [{ ...prompt, approvedAt: prompt.approvedAt }] : [],
      );
      const prompts = selectAssignmentPrompts(approvedPromptRows, input.limit);

      if (prompts.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No approved prompts matched this assignment.",
        });
      }

      const [assignment] = await ctx.db
        .insert(benchmarkAssignments)
        .values({
          userId,
          promptIds: prompts.map((prompt) => prompt.id),
          modelProvider: input.modelProvider ?? null,
          modelId: input.modelId ?? null,
          locale: input.locale,
          status: "held",
        })
        .returning();

      if (!assignment) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create benchmark assignment.",
        });
      }

      return {
        assignment,
        prompts,
        instructions: buildAssignmentInstructions({
          assignmentId: assignment.id,
          prompts,
          modelProvider: assignment.modelProvider,
          modelId: assignment.modelId,
          locale: assignment.locale,
        }),
      };
    }),

  getAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [assignment] = await ctx.db
        .select()
        .from(benchmarkAssignments)
        .where(eq(benchmarkAssignments.id, input.assignmentId))
        .limit(1);

      if (assignment?.userId !== userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assignment not found.",
        });
      }

      const prompts =
        assignment.promptIds.length === 0
          ? []
          : await ctx.db
              .select({
                id: benchmarkPrompts.id,
                text: benchmarkPrompts.text,
                categoryId: benchmarkPrompts.categoryId,
                intentId: benchmarkPrompts.intentId,
                locale: benchmarkPrompts.locale,
              })
              .from(benchmarkPrompts)
              .where(inArray(benchmarkPrompts.id, assignment.promptIds));
      const promptOrder = new Map(
        assignment.promptIds.map((id, index) => [id, index]),
      );
      prompts.sort(
        (a, b) =>
          (promptOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (promptOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );

      return {
        assignment,
        prompts,
        instructions: buildAssignmentInstructions({
          assignmentId: assignment.id,
          prompts,
          modelProvider: assignment.modelProvider,
          modelId: assignment.modelId,
          locale: assignment.locale,
        }),
      };
    }),

  listMyAssignments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.db
      .select()
      .from(benchmarkAssignments)
      .where(eq(benchmarkAssignments.userId, userId))
      .orderBy(desc(benchmarkAssignments.createdAt))
      .limit(50);
  }),

  // Virtual pool of open assignments derived from coverage gaps. Each
  // returned item bundles a small set of under-covered prompts on a
  // single surface; contributors can `grabAssignment` to materialise
  // it as a held row. See ADR-0008 Step 5.
  listOpenAssignments: protectedProcedure
    .input(
      z.object({
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
        promptsPerBundle: z.number().int().min(1).max(10).default(5),
        maxBundles: z.number().int().min(1).max(20).default(8),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Cells that don't yet meet the threshold (i.e. still need
      // contributors). Excludes legacy_unverified by construction
      // (the coverage rebuild excludes those rows).
      const gaps = await ctx.db
        .select({
          promptId: aggCoverageByCell.promptId,
          modelSurface: aggCoverageByCell.modelSurface,
          distinctContributors: aggCoverageByCell.distinctContributors,
        })
        .from(aggCoverageByCell)
        .where(
          and(
            eq(aggCoverageByCell.windowDays, input.windowDays),
            eq(aggCoverageByCell.meetsThreshold, false),
          ),
        );

      // Rank surfaces by what this contributor has previously
      // submitted to (ADR-0008 decision 3: simple self-serve heuristic).
      const myRecentSurfaces = await ctx.db
        .select({
          modelSurface: benchmarkRuns.modelSurface,
          n: sql<number>`count(*)`.mapWith(Number),
        })
        .from(benchmarkRuns)
        .where(eq(benchmarkRuns.submittedByUserId, userId))
        .groupBy(benchmarkRuns.modelSurface);
      const surfaceAffinity = new Map<string, number>();
      for (const r of myRecentSurfaces) {
        surfaceAffinity.set(r.modelSurface, r.n);
      }

      // Fetch prompt text for gap cells in a single round-trip.
      const promptIds = Array.from(new Set(gaps.map((g) => g.promptId)));
      const promptRows =
        promptIds.length === 0
          ? []
          : await ctx.db
              .select({
                id: benchmarkPrompts.id,
                text: benchmarkPrompts.text,
              })
              .from(benchmarkPrompts)
              .where(
                and(
                  inArray(benchmarkPrompts.id, promptIds),
                  eq(benchmarkPrompts.status, "approved"),
                ),
              );
      const promptText = new Map(promptRows.map((p) => [p.id, p.text]));

      // Group gap cells by surface; within each surface, take the most-
      // under-covered prompts first (smallest distinct_contributors).
      const bySurface = new Map<
        string,
        Array<{ promptId: string; distinctContributors: number }>
      >();
      for (const g of gaps) {
        if (!promptText.has(g.promptId)) continue;
        const arr = bySurface.get(g.modelSurface) ?? [];
        arr.push({
          promptId: g.promptId,
          distinctContributors: g.distinctContributors,
        });
        bySurface.set(g.modelSurface, arr);
      }

      const bundles: Array<{
        pseudoId: string;
        modelSurface: BenchmarkModelSurface;
        promptIds: string[];
        prompts: Array<{ id: string; text: string }>;
        gapSummary: string;
      }> = [];
      for (const [surface, cells] of bySurface) {
        cells.sort((a, b) => a.distinctContributors - b.distinctContributors);
        const chunk = cells.slice(0, input.promptsPerBundle);
        if (chunk.length === 0) continue;
        const chunkPromptIds = chunk.map((c) => c.promptId);
        bundles.push({
          pseudoId: `${surface}:${chunkPromptIds.slice().sort().join(",")}`,
          modelSurface: surface as BenchmarkModelSurface,
          promptIds: chunkPromptIds,
          prompts: chunkPromptIds.map((id) => ({
            id,
            text: promptText.get(id) ?? "",
          })),
          gapSummary: `${chunk.length} prompts on this surface need more contributors`,
        });
      }
      bundles.sort(
        (a, b) =>
          (surfaceAffinity.get(b.modelSurface) ?? 0) -
          (surfaceAffinity.get(a.modelSurface) ?? 0),
      );

      return { bundles: bundles.slice(0, input.maxBundles) };
    }),

  grabAssignment: protectedProcedure
    .input(
      z.object({
        modelSurface: z.enum(BENCHMARK_MODEL_SURFACES),
        promptIds: z.array(z.string().uuid()).min(1).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const approved = await ctx.db
        .select({ id: benchmarkPrompts.id })
        .from(benchmarkPrompts)
        .where(
          and(
            inArray(benchmarkPrompts.id, input.promptIds),
            eq(benchmarkPrompts.status, "approved"),
          ),
        );
      if (approved.length !== input.promptIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more prompts are not approved.",
        });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [assignment] = await ctx.db
        .insert(benchmarkAssignments)
        .values({
          userId,
          promptIds: input.promptIds,
          modelSurface: input.modelSurface,
          modelProvider: providerForSurface(input.modelSurface),
          locale: BENCHMARK_DEFAULT_LOCALE,
          status: "held",
          expiresAt,
        })
        .returning();
      if (!assignment) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to grab assignment.",
        });
      }
      return { assignment };
    }),

  releaseAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const result = await ctx.db
        .update(benchmarkAssignments)
        .set({ status: "expired" })
        .where(
          and(
            eq(benchmarkAssignments.id, input.assignmentId),
            eq(benchmarkAssignments.userId, userId),
            eq(benchmarkAssignments.status, "held"),
          ),
        )
        .returning({ id: benchmarkAssignments.id });
      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assignment not found or not held by you.",
        });
      }
      return { ok: true as const };
    }),

  submitRun: protectedProcedure
    .input(
      z.object({
        promptId: z.string().uuid(),
        modelSurface: z.enum(BENCHMARK_MODEL_SURFACES),
        modelId: z.string().min(1).max(120).optional(),
        modelVersion: z.string().max(120).optional(),
        temperature: z.number().min(0).max(2).optional(),
        rawAnswer: z.string().min(1).max(50_000),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
        capturedAt: z.string().datetime().optional(),
        agentId: z.string().uuid().optional(),
        assignmentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const modelProvider = providerForSurface(input.modelSurface);
      const modelId = input.modelId?.trim() || null;

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

      if (input.assignmentId) {
        const [assignment] = await ctx.db
          .select()
          .from(benchmarkAssignments)
          .where(eq(benchmarkAssignments.id, input.assignmentId))
          .limit(1);
        if (
          assignment?.userId !== userId ||
          assignment.status !== "held" ||
          !assignment.promptIds.includes(input.promptId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Assignment not found for this prompt.",
          });
        }
        requireBenchmarkAssignmentRunMetadata(assignment, {
          modelProvider,
          modelId,
          locale: input.locale,
        });
      }

      const capturedAt = input.capturedAt
        ? new Date(input.capturedAt)
        : new Date();

      // Per ADR-0007 decision 3: no dedup. Every submission is a separate
      // evidence point. The surface threshold (≥3 distinct contributors)
      // prevents a single contributor from flooding a cell into visibility.

      const weight = await computeContributorWeight(ctx.db, userId);

      try {
        const [run] = await ctx.db
          .insert(benchmarkRuns)
          .values({
            promptId: input.promptId,
            submittedByUserId: userId,
            agentId: input.agentId ?? null,
            assignmentId: input.assignmentId ?? null,
            modelProvider,
            modelId,
            modelVersion: input.modelVersion ?? null,
            modelSurface: input.modelSurface,
            temperature: input.temperature?.toString() ?? null,
            rawAnswer: input.rawAnswer,
            locale: input.locale,
            capturedAt,
            extractionStatus: "pending",
            weight: weight.toString(),
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
            modelSurface: input.modelSurface,
            modelProvider,
            modelId,
            assignmentId: input.assignmentId ?? null,
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
        modelSurface: z.enum(BENCHMARK_MODEL_SURFACES),
        modelId: z.string().min(1).max(120).optional(),
        modelVersion: z.string().max(120).optional(),
        temperature: z.number().min(0).max(2).optional(),
        rawAnswer: z.string().min(1).max(50_000),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
        capturedAt: z.string().datetime().optional(),
        assignmentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ownerId = requireOwner(ctx.agent.ownerId);
      const modelProvider = providerForSurface(input.modelSurface);
      const modelId = input.modelId?.trim() || null;

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

      if (input.assignmentId) {
        const [assignment] = await ctx.db
          .select()
          .from(benchmarkAssignments)
          .where(eq(benchmarkAssignments.id, input.assignmentId))
          .limit(1);
        if (
          assignment?.userId !== ownerId ||
          assignment.status !== "held" ||
          (assignment.agentId !== null &&
            assignment.agentId !== ctx.agent.agentId) ||
          !assignment.promptIds.includes(input.promptId)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Assignment not found for this agent and prompt.",
          });
        }
        requireBenchmarkAssignmentRunMetadata(assignment, {
          modelProvider,
          modelId,
          locale: input.locale,
        });
      }

      const capturedAt = input.capturedAt
        ? new Date(input.capturedAt)
        : new Date();

      // Per ADR-0007 decision 3: no dedup. See submitRun above.

      const weight = await computeContributorWeight(ctx.db, ownerId);

      const [run] = await ctx.db
        .insert(benchmarkRuns)
        .values({
          promptId: input.promptId,
          submittedByUserId: ownerId,
          agentId: ctx.agent.agentId,
          assignmentId: input.assignmentId ?? null,
          modelProvider,
          modelId,
          modelVersion: input.modelVersion ?? null,
          modelSurface: input.modelSurface,
          temperature: input.temperature?.toString() ?? null,
          rawAnswer: input.rawAnswer,
          locale: input.locale,
          capturedAt,
          extractionStatus: "pending",
          weight: weight.toString(),
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
          modelSurface: input.modelSurface,
          modelProvider,
          modelId,
          agentId: ctx.agent.agentId,
          assignmentId: input.assignmentId ?? null,
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
