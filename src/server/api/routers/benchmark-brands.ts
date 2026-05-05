import { z } from "zod";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  brands,
  benchmarkCategories,
  aggBrandVisibilityByModel,
  aggBrandVisibilityByDay,
  aggCitationByBrand,
  brandWatches,
} from "@/server/db/schema";
import { parseCountry } from "@/server/benchmark/locale";
import {
  generateStrategy,
  type Recommendation,
} from "@/server/benchmark/strategy";
import { checkStrategyRateLimit } from "@/server/benchmark/user-rate-limit";
import {
  computeBrandMetricSummary,
  computeVisibility,
  deriveOwnedDomains,
} from "@/server/benchmark/brand-metrics";

const WINDOWS = z.union([z.literal(7), z.literal(30), z.literal(90)]);

const strategyCache = new Map<
  string,
  { data: Recommendation[]; expiresAt: number }
>();
const STRATEGY_CACHE_MS = 60 * 60 * 1000; // 1 hour

export const benchmarkBrandsRouter = createTRPCRouter({
  search: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(25).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const like = `%${input.q.toLowerCase()}%`;
      const prefix = `${input.q.toLowerCase()}%`;
      const rows = await ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          categoryIds: brands.categoryIds,
        })
        .from(brands)
        .where(
          or(
            sql`lower(${brands.canonicalName}) like ${like}`,
            sql`lower(${brands.slug}) like ${like}`,
            sql`EXISTS (SELECT 1 FROM unnest(${brands.aliases}) a WHERE lower(a) like ${like})`,
          ),
        )
        .orderBy(
          sql`CASE WHEN lower(${brands.canonicalName}) like ${prefix} THEN 0 ELSE 1 END`,
          brands.canonicalName,
        )
        .limit(input.limit);
      return { brands: rows };
    }),

  list: publicProcedure
    .input(
      z.object({
        categorySlug: z.string().optional(),
        sort: z.enum(["visibility", "alpha", "recent"]).default("visibility"),
        includeUnverified: z.boolean().default(false),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      let categoryId: string | undefined;
      if (input.categorySlug) {
        const [cat] = await ctx.db
          .select({ id: benchmarkCategories.id })
          .from(benchmarkCategories)
          .where(eq(benchmarkCategories.slug, input.categorySlug))
          .limit(1);
        if (!cat) return { brands: [], nextCursor: undefined };
        categoryId = cat.id;
      }

      const offset = input.cursor ? Number(input.cursor) : 0;
      const includeUnverified = input.includeUnverified;
      const sortKey = input.sort;

      // Raw SQL keeps the multi-sort easier than composing through drizzle's
      // builder for three independent sort modes.
      const result = await ctx.db.execute(sql`
        WITH brand_totals AS (
          SELECT
            brand_id,
            SUM(mentions_count)::int AS mentions,
            SUM(runs_total)::int AS runs,
            AVG(visibility_pct)::numeric(10,2) AS visibility_pct,
            MAX(updated_at) AS updated_at
          FROM "app"."agg_brand_visibility_by_model"
          WHERE window_days = 30
          GROUP BY brand_id
        )
        SELECT
          b.id, b.slug, b.canonical_name, b.verified, b.category_ids,
          COALESCE(bt.visibility_pct, 0) AS visibility_pct,
          COALESCE(bt.mentions, 0) AS mentions,
          bt.updated_at AS last_aggregated_at
        FROM "app"."brand" b
        LEFT JOIN brand_totals bt ON bt.brand_id = b.id
        WHERE
          (${includeUnverified} OR b.verified = true)
          AND (${categoryId ?? null}::uuid IS NULL OR ${categoryId ?? null}::uuid = ANY(b.category_ids))
        ORDER BY
          CASE WHEN ${sortKey} = 'visibility' THEN COALESCE(bt.visibility_pct, 0) ELSE 0 END DESC,
          CASE WHEN ${sortKey} = 'alpha' THEN b.canonical_name END ASC,
          CASE WHEN ${sortKey} = 'recent' THEN b.updated_at END DESC,
          b.canonical_name ASC
        LIMIT ${input.limit + 1}
        OFFSET ${offset}
      `);

      const rawRows = ((result as { rows?: unknown }).rows ?? result) as Array<{
        id: string;
        slug: string;
        canonical_name: string;
        verified: boolean;
        category_ids: string[];
        visibility_pct: string;
        mentions: number;
      }>;

      const items = rawRows.slice(0, input.limit);
      const nextCursor =
        rawRows.length > input.limit ? String(offset + input.limit) : undefined;

      return {
        brands: items.map((r) => ({
          id: r.id,
          slug: r.slug,
          canonicalName: r.canonical_name,
          verified: r.verified,
          categoryIds: r.category_ids,
          visibilityPct: Number(r.visibility_pct),
          mentions: r.mentions,
        })),
        nextCursor,
      };
    }),

  stats: publicProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        window: WINDOWS.default(30),
        modelId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [brand] = await ctx.db
        .select()
        .from(brands)
        .where(eq(brands.slug, input.slug))
        .limit(1);
      if (!brand) return null;

      const w = input.window;

      const perModel = await ctx.db
        .select()
        .from(aggBrandVisibilityByModel)
        .where(
          and(
            eq(aggBrandVisibilityByModel.brandId, brand.id),
            eq(aggBrandVisibilityByModel.windowDays, w),
          ),
        );

      const primaryCategoryId =
        perModel.find((r) => r.primaryCategoryId)?.primaryCategoryId ?? null;

      const filteredPerModel = input.modelId
        ? perModel.filter((r) => r.modelId === input.modelId)
        : perModel;

      const totalMentions = filteredPerModel.reduce(
        (a, r) => a + r.mentionsCount,
        0,
      );
      const totalRuns = filteredPerModel.reduce((a, r) => a + r.runsTotal, 0);
      const visibilityPct = computeVisibility({
        mentions: totalMentions,
        totalRuns,
      });

      const metricCategoryId = primaryCategoryId ?? brand.categoryIds[0] ?? null;
      const ownedDomains = deriveOwnedDomains(brand.website);
      const metricRowsResult = await ctx.db.execute(sql`
        WITH category_runs AS (
          SELECT r.id
          FROM "app"."benchmark_run" r
          JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
          WHERE r.extraction_status = 'done'
            AND r.captured_at >= now() - (${w} || ' days')::interval
            AND (
              ${metricCategoryId}::uuid IS NULL
              OR p.category_id = ${metricCategoryId}::uuid
              OR ${metricCategoryId}::uuid = ANY(p.inferred_category_ids)
            )
            AND (${input.modelId ?? null}::text IS NULL OR r.model_id = ${input.modelId ?? null})
        )
        SELECT
          (SELECT COUNT(*)::int FROM category_runs) AS category_runs,
          (
            SELECT COUNT(*)::int
            FROM "app"."benchmark_brand_mention" m
            JOIN category_runs cr ON cr.id = m.run_id
            WHERE m.brand_id IS NOT NULL
          ) AS total_mentions,
          (
            SELECT COUNT(*)::int
            FROM "app"."benchmark_brand_mention" m
            JOIN category_runs cr ON cr.id = m.run_id
            WHERE m.brand_id = ${brand.id}
          ) AS brand_mentions,
          (
            SELECT ARRAY_REMOVE(ARRAY_AGG(m.rank), NULL)::int[]
            FROM "app"."benchmark_brand_mention" m
            JOIN category_runs cr ON cr.id = m.run_id
            WHERE m.brand_id = ${brand.id}
          ) AS brand_ranks,
          (
            SELECT COUNT(DISTINCT cr.id)::int
            FROM category_runs cr
            JOIN "app"."benchmark_citation" c ON c.run_id = cr.id
            WHERE ${ownedDomains.length > 0}
              AND regexp_replace(lower(c.domain), '^www\.', '') = ANY(${ownedDomains}::text[])
          ) AS owned_source_runs,
          (
            SELECT COUNT(DISTINCT cr.id)::int
            FROM category_runs cr
            JOIN "app"."benchmark_brand_mention" m
              ON m.run_id = cr.id AND m.brand_id = ${brand.id}
            JOIN "app"."benchmark_citation" c ON c.run_id = cr.id
          ) AS cited_runs
      `);
      const metricRows = ((metricRowsResult as { rows?: unknown }).rows ??
        metricRowsResult) as Array<{
        category_runs: number | string | null;
        total_mentions: number | string | null;
        brand_mentions: number | string | null;
        brand_ranks: Array<number | string | null> | null;
        owned_source_runs: number | string | null;
        cited_runs: number | string | null;
      }>;
      const metricRow = metricRows[0];
      const eligibleRuns = Number(metricRow?.category_runs ?? 0);
      const totalCategoryMentions = Number(metricRow?.total_mentions ?? 0);
      const brandCategoryMentions = Number(
        metricRow?.brand_mentions ?? totalMentions,
      );
      const brandRanks = (metricRow?.brand_ranks ?? []).map((rank) =>
        rank === null ? null : Number(rank),
      );
      const ownedSourceRuns = Number(metricRow?.owned_source_runs ?? 0);
      const citedRuns = Number(metricRow?.cited_runs ?? 0);
      const sentimentScore =
        totalMentions === 0
          ? 0
          : Number(
              (
                filteredPerModel.reduce(
                  (a, r) =>
                    a +
                    (Number(r.sentimentPosPct) - Number(r.sentimentNegPct)) *
                      r.mentionsCount,
                  0,
                ) / totalMentions
              ).toFixed(2),
            );
      const metricSummary = computeBrandMetricSummary({
        brandMentions: brandCategoryMentions,
        totalMentions: totalCategoryMentions,
        eligibleRuns,
        ranks: brandRanks,
        sentimentScore,
        ownedSourceRuns,
        citedRuns,
      });

      // Δ vs prior-window: only meaningful if prior window aggregate was stored.
      // Windows are 7/30/90 only, so for w=7 there is no prior; for w=30 look at 7;
      // for w=90 look at 30. Best-effort — plan's caveat acknowledges this.
      const priorW: 7 | 30 | null = w === 90 ? 30 : w === 30 ? 7 : null;
      let priorVisibility = 0;
      if (priorW !== null) {
        const priorRows = await ctx.db
          .select({
            mentions: aggBrandVisibilityByModel.mentionsCount,
            runs: aggBrandVisibilityByModel.runsTotal,
          })
          .from(aggBrandVisibilityByModel)
          .where(
            and(
              eq(aggBrandVisibilityByModel.brandId, brand.id),
              eq(aggBrandVisibilityByModel.windowDays, priorW),
            ),
          );
        const pMentions = priorRows.reduce((a, r) => a + r.mentions, 0);
        const pRuns = priorRows.reduce((a, r) => a + r.runs, 0);
        priorVisibility = pRuns === 0 ? 0 : (pMentions / pRuns) * 100;
      }
      const deltaPct = visibilityPct - priorVisibility;

      const trendDays = await ctx.db
        .select()
        .from(aggBrandVisibilityByDay)
        .where(eq(aggBrandVisibilityByDay.brandId, brand.id))
        .orderBy(aggBrandVisibilityByDay.date);

      // Country breakdown — raw query over runs + mentions, joined to parse locale.
      const byCountryRaw = await ctx.db.execute(sql`
        SELECT
          r.locale,
          COUNT(DISTINCT r.id)::int AS runs_total,
          COUNT(DISTINCT CASE WHEN m.brand_id = ${brand.id} THEN r.id ELSE NULL END)::int AS mentions_count
        FROM "app"."benchmark_run" r
        LEFT JOIN "app"."benchmark_brand_mention" m
          ON m.run_id = r.id AND m.brand_id = ${brand.id}
        WHERE r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.locale
      `);

      type CountryRow = {
        locale: string;
        runs_total: number;
        mentions_count: number;
      };
      const countryRows = ((byCountryRaw as { rows?: unknown }).rows ??
        byCountryRaw) as CountryRow[];

      const byCountryMap = new Map<
        string,
        { mentionsCount: number; runsTotal: number }
      >();
      for (const r of countryRows) {
        const country = parseCountry(r.locale) ?? "UNKNOWN";
        const cur = byCountryMap.get(country) ?? {
          mentionsCount: 0,
          runsTotal: 0,
        };
        cur.mentionsCount += r.mentions_count;
        cur.runsTotal += r.runs_total;
        byCountryMap.set(country, cur);
      }
      const byCountry = [...byCountryMap.entries()]
        .map(([country, v]) => ({
          country,
          mentionsCount: v.mentionsCount,
          runsTotal: v.runsTotal,
          visibilityPct:
            v.runsTotal === 0 ? 0 : (v.mentionsCount / v.runsTotal) * 100,
        }))
        .filter((r) => r.mentionsCount > 0)
        .sort((a, b) => b.mentionsCount - a.mentionsCount);

      const competitorsResult = primaryCategoryId
        ? await ctx.db.execute(sql`
            WITH totals AS (
              SELECT
                v.brand_id,
                SUM(v.mentions_count) AS mentions,
                SUM(v.runs_total) AS runs,
                AVG(v.visibility_pct) AS visibility_pct,
                AVG(v.avg_rank) AS avg_rank,
                AVG(v.sentiment_pos_pct) AS sent_pos
              FROM "app"."agg_brand_visibility_by_model" v
              WHERE v.window_days = ${w}
                AND v.primary_category_id = ${primaryCategoryId}
                AND v.brand_id <> ${brand.id}
              GROUP BY v.brand_id
            )
            SELECT b.id, b.slug, b.canonical_name,
                   t.visibility_pct, t.avg_rank, t.sent_pos
            FROM totals t
            JOIN "app"."brand" b ON b.id = t.brand_id
            ORDER BY t.visibility_pct DESC
            LIMIT 5
          `)
        : [];
      const competitors = ((competitorsResult as { rows?: unknown }).rows ??
        competitorsResult) as Array<{
        id: string;
        slug: string;
        canonical_name: string;
        visibility_pct: string | number;
        avg_rank: string | number | null;
        sent_pos: string | number;
      }>;

      const citationRows = await ctx.db
        .select({
          domain: aggCitationByBrand.domain,
          count: sql<number>`SUM(${aggCitationByBrand.citationCount})::int`,
          lastSeenAt: sql<Date>`MAX(${aggCitationByBrand.lastSeenAt})`,
        })
        .from(aggCitationByBrand)
        .where(
          and(
            eq(aggCitationByBrand.brandId, brand.id),
            eq(aggCitationByBrand.windowDays, w),
          ),
        )
        .groupBy(aggCitationByBrand.domain)
        .orderBy(desc(sql`SUM(${aggCitationByBrand.citationCount})`))
        .limit(10);

      const topPromptsResult = await ctx.db.execute(sql`
        SELECT
          p.id AS prompt_id,
          p.text,
          p.category_id,
          SUM(a.mention_count)::int AS mentions,
          AVG(a.avg_rank) AS avg_rank
        FROM "app"."agg_brand_rank_by_prompt" a
        JOIN "app"."benchmark_prompt" p ON p.id = a.prompt_id
        WHERE a.brand_id = ${brand.id} AND a.window_days = ${w}
        GROUP BY p.id, p.text, p.category_id
        ORDER BY mentions DESC
        LIMIT 10
      `);
      const topPrompts = ((topPromptsResult as { rows?: unknown }).rows ??
        topPromptsResult) as Array<{
        prompt_id: string;
        text: string;
        category_id: string;
        mentions: number;
        avg_rank: string | number | null;
      }>;

      return {
        brand: {
          id: brand.id,
          slug: brand.slug,
          canonicalName: brand.canonicalName,
          website: brand.website,
          aliases: brand.aliases,
          categoryIds: brand.categoryIds,
          verified: brand.verified,
        },
        window: w,
        modelIdFilter: input.modelId ?? null,
        primaryCategoryId,
        hero: {
          visibilityPct: Number(visibilityPct.toFixed(2)),
          deltaPct: Number(deltaPct.toFixed(2)),
          totalMentions,
          totalRuns,
        },
        metricSummary,
        perModel: perModel.map((r) => ({
          modelId: r.modelId,
          mentionsCount: r.mentionsCount,
          runsTotal: r.runsTotal,
          visibilityPct: Number(r.visibilityPct),
          avgRank: r.avgRank ? Number(r.avgRank) : null,
          sentimentPosPct: Number(r.sentimentPosPct),
          sentimentNeuPct: Number(r.sentimentNeuPct),
          sentimentNegPct: Number(r.sentimentNegPct),
        })),
        trendDays: trendDays.map((r) => ({
          date: (r.date as unknown as string).slice(0, 10),
          modelId: r.modelId,
          mentionsCount: r.mentionsCount,
          runsTotal: r.runsTotal,
        })),
        competitors,
        citations: citationRows,
        topPrompts,
        byCountry,
      };
    }),

  watch: protectedProcedure
    .input(z.object({ brandSlug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [brand] = await ctx.db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, input.brandSlug))
        .limit(1);
      if (!brand) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }
      await ctx.db
        .insert(brandWatches)
        .values({ userId, brandId: brand.id })
        .onConflictDoNothing({
          target: [brandWatches.userId, brandWatches.brandId],
        });
      return { watched: true };
    }),

  unwatch: protectedProcedure
    .input(z.object({ brandSlug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [brand] = await ctx.db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, input.brandSlug))
        .limit(1);
      if (!brand) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }
      await ctx.db
        .delete(brandWatches)
        .where(
          and(
            eq(brandWatches.userId, userId),
            eq(brandWatches.brandId, brand.id),
          ),
        );
      return { watched: false };
    }),

  isWatched: protectedProcedure
    .input(z.object({ brandSlug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [brand] = await ctx.db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, input.brandSlug))
        .limit(1);
      if (!brand) return { watched: false };
      const [row] = await ctx.db
        .select({ id: brandWatches.id })
        .from(brandWatches)
        .where(
          and(
            eq(brandWatches.userId, userId),
            eq(brandWatches.brandId, brand.id),
          ),
        )
        .limit(1);
      return { watched: Boolean(row) };
    }),

  listMyWatches: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select({
        id: brandWatches.id,
        createdAt: brandWatches.createdAt,
        lastNotifiedAt: brandWatches.lastNotifiedAt,
        slug: brands.slug,
        canonicalName: brands.canonicalName,
      })
      .from(brandWatches)
      .innerJoin(brands, eq(brands.id, brandWatches.brandId))
      .where(eq(brandWatches.userId, userId))
      .orderBy(desc(brandWatches.createdAt));
    return { watches: rows };
  }),

  getStrategy: protectedProcedure
    .input(
      z.object({
        brandSlug: z.string().min(1),
        window: WINDOWS.default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const cacheKey = `${input.brandSlug}|${input.window}`;
      const cached = strategyCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { recommendations: cached.data, cached: true };
      }

      const rl = checkStrategyRateLimit(userId);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limited. Retry after ${rl.retryAfterSecs}s.`,
        });
      }

      // Reuse the same caller to fetch stats (minor layering sin but keeps
      // this self-contained; `ctx.db` path would duplicate the stats query).
      const caller = (await import("@/server/api/root")).createCaller(ctx);
      const stats = await caller.benchmark.brands.stats({
        slug: input.brandSlug,
        window: input.window,
      });
      if (!stats) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }

      const recs = await generateStrategy({
        brandName: stats.brand.canonicalName,
        hero: {
          visibilityPct: stats.hero.visibilityPct,
          totalMentions: stats.hero.totalMentions,
          totalRuns: stats.hero.totalRuns,
        },
        perModel: stats.perModel.map((m) => ({
          modelId: m.modelId,
          visibilityPct: m.visibilityPct,
          sentimentPosPct: m.sentimentPosPct,
        })),
        competitors: stats.competitors.map(
          (c: { canonical_name: string; visibility_pct: string | number }) => ({
            canonical_name: c.canonical_name,
            visibility_pct: Number(c.visibility_pct),
          }),
        ),
        citations: stats.citations.map(
          (c: { domain: string; count: number | string }) => ({
            domain: c.domain,
            count: Number(c.count),
          }),
        ),
        topPrompts: stats.topPrompts.map(
          (p: { text: string; mentions: number | string }) => ({
            text: p.text,
            mentions: Number(p.mentions),
          }),
        ),
      });

      strategyCache.set(cacheKey, {
        data: recs,
        expiresAt: Date.now() + STRATEGY_CACHE_MS,
      });
      return { recommendations: recs, cached: false };
    }),
});
