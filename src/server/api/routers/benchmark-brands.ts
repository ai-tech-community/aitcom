import { z } from "zod";
import { eq, or, sql } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { brands, benchmarkCategories } from "@/server/db/schema";

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

      const rawRows = ((result as { rows?: unknown }).rows ??
        result) as Array<{
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
});
