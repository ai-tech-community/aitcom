import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  brands,
  datacenters,
  datacenterSuppliers,
  energyDeals,
  datacenterFindings,
  datacenterFindingVotes,
  ownershipEdges,
  subsidies,
  permits,
  datacenterStatusHistory,
  DATACENTER_STATUS,
  POWER_SOURCE,
  COOLING_TYPE,
  SUPPLIER_CATEGORY,
  FINDING_STATUS,
  type DatacenterSource,
} from "@/server/db/schema";
import { opacityScore } from "@/server/datacenters/jurisdiction-secrecy";

function isAdmin(ctx: { session: { user: unknown } }): boolean {
  return (ctx.session.user as { role?: string }).role === "admin";
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const sourceSchema = z.object({
  url: z.string().url(),
  title: z.string().max(200).optional(),
  type: z
    .enum(["news", "pr", "filing", "permit", "operator", "other"])
    .optional(),
  publishedAt: z.string().optional(),
});

const gpuSchema = z.object({
  model: z.string().min(1).max(80),
  count: z.number().int().nonnegative().optional(),
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const datacentersRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          country: z.string().length(2).toUpperCase().optional(),
          status: z.enum(DATACENTER_STATUS).optional(),
          operatorSlug: z.string().optional(),
          supplierSlug: z.string().optional(),
          minMw: z.number().nonnegative().optional(),
          aiOnly: z.boolean().optional(),
          includeUnverified: z.boolean().optional(),
          q: z.string().min(1).max(100).optional(),
          withSuppliers: z.boolean().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const i = input ?? {};
      const limit = i.limit ?? 200;
      const conds = [] as ReturnType<typeof eq>[];
      if (i.country) conds.push(eq(datacenters.country, i.country));
      if (i.status) conds.push(eq(datacenters.status, i.status));
      if (i.aiOnly) conds.push(eq(datacenters.aiDedicated, true));
      if (!i.includeUnverified) conds.push(eq(datacenters.verified, true));
      if (i.withSuppliers) {
        conds.push(
          sql`EXISTS (SELECT 1 FROM "app"."datacenter_supplier" s WHERE s.datacenter_id = ${datacenters.id})`,
        );
      }
      if (i.minMw !== undefined) {
        conds.push(sql`${datacenters.capacityMw} >= ${i.minMw}`);
      }
      if (i.operatorSlug) {
        conds.push(
          sql`${datacenters.operatorId} = (SELECT id FROM "app"."brand" WHERE slug = ${i.operatorSlug} LIMIT 1)`,
        );
      }
      if (i.supplierSlug) {
        conds.push(
          sql`EXISTS (
            SELECT 1 FROM "app"."datacenter_supplier" s
            JOIN "app"."brand" b ON b.id = s.supplier_id
            WHERE s.datacenter_id = ${datacenters.id} AND b.slug = ${i.supplierSlug}
          )`,
        );
      }
      if (i.q) {
        const like = `%${i.q}%`;
        conds.push(
          or(
            ilike(datacenters.name, like),
            ilike(datacenters.city, like),
            ilike(datacenters.region, like),
          )!,
        );
      }

      const rows = await ctx.db
        .select({
          id: datacenters.id,
          slug: datacenters.slug,
          name: datacenters.name,
          status: datacenters.status,
          aiDedicated: datacenters.aiDedicated,
          lat: datacenters.lat,
          lng: datacenters.lng,
          city: datacenters.city,
          region: datacenters.region,
          country: datacenters.country,
          capacityMw: datacenters.capacityMw,
          capacityMwPlanned: datacenters.capacityMwPlanned,
          primaryPowerSource: datacenters.primaryPowerSource,
          coolingType: datacenters.coolingType,
          verified: datacenters.verified,
          operator: {
            id: brands.id,
            slug: brands.slug,
            canonicalName: brands.canonicalName,
          },
          supplierCount: sql<number>`(
            SELECT COUNT(*)::int FROM "app"."datacenter_supplier" s
            WHERE s.datacenter_id = ${datacenters.id}
          )`,
        })
        .from(datacenters)
        .innerJoin(brands, eq(brands.id, datacenters.operatorId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(datacenters.capacityMw), asc(datacenters.name))
        .limit(limit);

      return rows;
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dc] = await ctx.db
        .select()
        .from(datacenters)
        .where(eq(datacenters.slug, input.slug))
        .limit(1);
      if (!dc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Datacenter not found",
        });
      }

      const [operator] = await ctx.db
        .select()
        .from(brands)
        .where(eq(brands.id, dc.operatorId))
        .limit(1);

      const utility = dc.utilityId
        ? ((
            await ctx.db
              .select()
              .from(brands)
              .where(eq(brands.id, dc.utilityId))
              .limit(1)
          )[0] ?? null)
        : null;

      const suppliers = await ctx.db
        .select({
          link: datacenterSuppliers,
          supplier: brands,
        })
        .from(datacenterSuppliers)
        .innerJoin(brands, eq(brands.id, datacenterSuppliers.supplierId))
        .where(eq(datacenterSuppliers.datacenterId, dc.id))
        .orderBy(asc(datacenterSuppliers.category));

      const deals = await ctx.db
        .select()
        .from(energyDeals)
        .where(eq(energyDeals.datacenterId, dc.id))
        .orderBy(desc(energyDeals.signedDate));

      const findings = await ctx.db
        .select()
        .from(datacenterFindings)
        .where(eq(datacenterFindings.datacenterId, dc.id))
        .orderBy(
          desc(datacenterFindings.upvotes),
          desc(datacenterFindings.createdAt),
        )
        .limit(50);

      return { datacenter: dc, operator, utility, suppliers, deals, findings };
    }),

  stats: publicProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        count: sql<number>`COUNT(*)::int`,
        totalMw: sql<number>`COALESCE(SUM(${datacenters.capacityMw}),0)::float`,
        plannedMw: sql<number>`COALESCE(SUM(${datacenters.capacityMwPlanned}),0)::float`,
      })
      .from(datacenters)
      .where(eq(datacenters.verified, true));

    const byCountry = await ctx.db
      .select({
        country: datacenters.country,
        count: sql<number>`COUNT(*)::int`,
        mw: sql<number>`COALESCE(SUM(${datacenters.capacityMw}),0)::float`,
      })
      .from(datacenters)
      .where(eq(datacenters.verified, true))
      .groupBy(datacenters.country)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20);

    const byStatus = await ctx.db
      .select({
        status: datacenters.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(datacenters)
      .groupBy(datacenters.status);

    return {
      totals: totals ?? { count: 0, totalMw: 0, plannedMw: 0 },
      byCountry,
      byStatus,
    };
  }),

  investigationStats: publicProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        facilityCount: sql<number>`COUNT(*)::int`,
        totalMw: sql<number>`COALESCE(SUM(${datacenters.capacityMw}),0)::float`,
        plannedMw: sql<number>`COALESCE(SUM(${datacenters.capacityMwPlanned}),0)::float`,
        countries: sql<number>`COUNT(DISTINCT ${datacenters.country})::int`,
        aiDedicated: sql<number>`COUNT(*) FILTER (WHERE ${datacenters.aiDedicated})::int`,
      })
      .from(datacenters)
      .where(eq(datacenters.verified, true));

    const [supplierTotals] = await ctx.db
      .select({
        linkCount: sql<number>`COUNT(*)::int`,
        supplierCount: sql<number>`COUNT(DISTINCT ${datacenterSuppliers.supplierId})::int`,
        coveredFacilities: sql<number>`COUNT(DISTINCT ${datacenterSuppliers.datacenterId})::int`,
      })
      .from(datacenterSuppliers);

    const topOperators = await ctx.db
      .select({
        slug: brands.slug,
        canonicalName: brands.canonicalName,
        count: sql<number>`COUNT(*)::int`,
        mw: sql<number>`COALESCE(SUM(${datacenters.capacityMw}),0)::float`,
        plannedMw: sql<number>`COALESCE(SUM(${datacenters.capacityMwPlanned}),0)::float`,
      })
      .from(datacenters)
      .innerJoin(brands, eq(brands.id, datacenters.operatorId))
      .where(eq(datacenters.verified, true))
      .groupBy(brands.slug, brands.canonicalName)
      .orderBy(
        desc(sql`COALESCE(SUM(${datacenters.capacityMw}),0) + COALESCE(SUM(${datacenters.capacityMwPlanned}),0)`),
      )
      .limit(15);

    const topSupplierCategories = await ctx.db
      .select({
        category: datacenterSuppliers.category,
        count: sql<number>`COUNT(*)::int`,
        uniqueSuppliers: sql<number>`COUNT(DISTINCT ${datacenterSuppliers.supplierId})::int`,
      })
      .from(datacenterSuppliers)
      .groupBy(datacenterSuppliers.category)
      .orderBy(desc(sql`COUNT(*)`));

    const topSuppliers = await ctx.db
      .select({
        slug: brands.slug,
        canonicalName: brands.canonicalName,
        facilities: sql<number>`COUNT(DISTINCT ${datacenterSuppliers.datacenterId})::int`,
        categoryCount: sql<number>`COUNT(DISTINCT ${datacenterSuppliers.category})::int`,
      })
      .from(datacenterSuppliers)
      .innerJoin(brands, eq(brands.id, datacenterSuppliers.supplierId))
      .groupBy(brands.slug, brands.canonicalName)
      .orderBy(desc(sql`COUNT(DISTINCT ${datacenterSuppliers.datacenterId})`))
      .limit(15);

    const byPowerSource = await ctx.db
      .select({
        source: datacenters.primaryPowerSource,
        count: sql<number>`COUNT(*)::int`,
        mw: sql<number>`COALESCE(SUM(${datacenters.capacityMw}),0)::float`,
      })
      .from(datacenters)
      .where(eq(datacenters.verified, true))
      .groupBy(datacenters.primaryPowerSource)
      .orderBy(desc(sql`COUNT(*)`));

    const byCoolingType = await ctx.db
      .select({
        cooling: datacenters.coolingType,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(datacenters)
      .where(eq(datacenters.verified, true))
      .groupBy(datacenters.coolingType);

    // ── Concentration: HHI + top-3 share per country (operators by MW) ──
    const concentration = await ctx.db.execute<{
      country: string;
      total_mw: number;
      operator_count: number;
      hhi: number;
      top3_share: number;
    }>(sql`
      WITH op AS (
        SELECT
          d.country,
          d.operator_id,
          COALESCE(SUM(COALESCE(d.capacity_mw,0) + COALESCE(d.capacity_mw_planned,0)), 0) AS op_mw
        FROM "app"."datacenter" d
        WHERE d.verified = true
        GROUP BY d.country, d.operator_id
      ),
      country_total AS (
        SELECT country, SUM(op_mw) AS total_mw, COUNT(*) AS operator_count
        FROM op
        GROUP BY country
      ),
      shares AS (
        SELECT
          op.country,
          op.operator_id,
          op.op_mw,
          ct.total_mw,
          ct.operator_count,
          CASE WHEN ct.total_mw > 0 THEN op.op_mw / ct.total_mw ELSE 0 END AS share,
          ROW_NUMBER() OVER (PARTITION BY op.country ORDER BY op.op_mw DESC) AS rn
        FROM op
        JOIN country_total ct ON ct.country = op.country
        WHERE ct.total_mw > 0
      )
      SELECT
        country,
        MAX(total_mw)::float AS total_mw,
        MAX(operator_count)::int AS operator_count,
        ROUND(SUM(share * share * 10000)::numeric, 1)::float AS hhi,
        ROUND((SUM(CASE WHEN rn <= 3 THEN share ELSE 0 END) * 100)::numeric, 1)::float AS top3_share
      FROM shares
      GROUP BY country
      HAVING MAX(total_mw) > 0
      ORDER BY hhi DESC
      LIMIT 25;
    `);

    // ── Power mix per top operator (for stacked bar) ──
    const operatorPowerMix = await ctx.db
      .select({
        operatorSlug: brands.slug,
        operatorName: brands.canonicalName,
        source: datacenters.primaryPowerSource,
        mw: sql<number>`COALESCE(SUM(COALESCE(${datacenters.capacityMw},0) + COALESCE(${datacenters.capacityMwPlanned},0)), 0)::float`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(datacenters)
      .innerJoin(brands, eq(brands.id, datacenters.operatorId))
      .where(eq(datacenters.verified, true))
      .groupBy(brands.slug, brands.canonicalName, datacenters.primaryPowerSource);

    // ── Single-supplier dependency: facilities where one supplier covers ≥3 categories ──
    const singleSupplierDep = await ctx.db.execute<{
      datacenter_slug: string;
      datacenter_name: string;
      supplier_name: string;
      categories: number;
    }>(sql`
      SELECT
        d.slug AS datacenter_slug,
        d.name AS datacenter_name,
        b.canonical_name AS supplier_name,
        COUNT(DISTINCT s.category)::int AS categories
      FROM "app"."datacenter_supplier" s
      JOIN "app"."datacenter" d ON d.id = s.datacenter_id
      JOIN "app"."brand" b ON b.id = s.supplier_id
      GROUP BY d.slug, d.name, b.canonical_name
      HAVING COUNT(DISTINCT s.category) >= 3
      ORDER BY categories DESC
      LIMIT 25;
    `);

    // ── Greenwash gap: operator commitment vs actual carbon-free MW share ──
    // Carbon-free sources: solar, wind, hydro, geothermal, nuclear.
    const greenwashGap = await ctx.db.execute<{
      operator_slug: string;
      operator_name: string;
      commitment_pct: number | null;
      target_year: number | null;
      source_url: string | null;
      total_mw: number;
      carbon_free_mw: number;
      carbon_free_pct: number;
      gap_pp: number | null;
    }>(sql`
      WITH op AS (
        SELECT
          b.slug AS operator_slug,
          b.canonical_name AS operator_name,
          b.commitment_renewable_pct AS commitment_pct,
          b.commitment_target_year AS target_year,
          b.commitment_source_url AS source_url,
          COALESCE(SUM(COALESCE(d.capacity_mw,0) + COALESCE(d.capacity_mw_planned,0)), 0)::float AS total_mw,
          COALESCE(SUM(
            CASE WHEN d.primary_power_source IN ('solar','wind','hydro','geothermal','nuclear')
              THEN COALESCE(d.capacity_mw,0) + COALESCE(d.capacity_mw_planned,0)
              ELSE 0
            END
          ), 0)::float AS carbon_free_mw
        FROM "app"."brand" b
        JOIN "app"."datacenter" d ON d.operator_id = b.id
        WHERE d.verified = true AND b.commitment_renewable_pct IS NOT NULL
        GROUP BY b.slug, b.canonical_name, b.commitment_renewable_pct, b.commitment_target_year, b.commitment_source_url
        HAVING COALESCE(SUM(COALESCE(d.capacity_mw,0) + COALESCE(d.capacity_mw_planned,0)), 0) > 0
      )
      SELECT
        operator_slug,
        operator_name,
        commitment_pct,
        target_year,
        source_url,
        total_mw,
        carbon_free_mw,
        ROUND((carbon_free_mw / total_mw * 100)::numeric, 1)::float AS carbon_free_pct,
        ROUND((commitment_pct - (carbon_free_mw / total_mw * 100))::numeric, 1)::float AS gap_pp
      FROM op
      ORDER BY total_mw DESC;
    `);

    // ── Temporal: announcements per year (uses existing announced_date / online_date) ──
    const announceTrend = await ctx.db.execute<{
      year: number;
      announced: number;
      online: number;
    }>(sql`
      WITH years AS (
        SELECT EXTRACT(YEAR FROM announced_date)::int AS year
        FROM "app"."datacenter"
        WHERE announced_date IS NOT NULL AND verified = true
        UNION
        SELECT EXTRACT(YEAR FROM online_date)::int AS year
        FROM "app"."datacenter"
        WHERE online_date IS NOT NULL AND verified = true
      )
      SELECT
        year,
        (SELECT COUNT(*)::int FROM "app"."datacenter" d
          WHERE EXTRACT(YEAR FROM d.announced_date) = years.year AND d.verified) AS announced,
        (SELECT COUNT(*)::int FROM "app"."datacenter" d
          WHERE EXTRACT(YEAR FROM d.online_date) = years.year AND d.verified) AS online
      FROM years
      WHERE year >= 2018 AND year <= 2030
      ORDER BY year ASC;
    `);

    // ── Build/lag stats: avg days announced→online for facilities with both dates ──
    const [lagStats] = await ctx.db.execute<{
      sample_size: number;
      avg_lag_days: number;
      median_lag_days: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS sample_size,
        ROUND(AVG((online_date - announced_date)))::int AS avg_lag_days,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY (online_date - announced_date)))::int AS median_lag_days
      FROM "app"."datacenter"
      WHERE announced_date IS NOT NULL AND online_date IS NOT NULL AND verified = true;
    `).then((r) => ({ rows: r.rows.length ? r.rows : [{ sample_size: 0, avg_lag_days: 0, median_lag_days: 0 }] })).then((r) => r.rows);

    // ── Red flags: counts + sample slugs for top-of-dashboard panel ──
    const noSources = await ctx.db.execute<{
      count: number;
      samples: string[];
    }>(sql`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(ARRAY_AGG(slug ORDER BY name) FILTER (WHERE slug IS NOT NULL), ARRAY[]::text[]) AS samples
      FROM (
        SELECT slug, name FROM "app"."datacenter"
        WHERE verified = true AND COALESCE(jsonb_array_length(sources), 0) = 0
        ORDER BY name
        LIMIT 5
      ) t
      RIGHT JOIN (
        SELECT COUNT(*)::int AS c FROM "app"."datacenter"
        WHERE verified = true AND COALESCE(jsonb_array_length(sources), 0) = 0
      ) cnt ON true
      GROUP BY cnt.c;
    `);

    const stuckAnnounced = await ctx.db.execute<{
      count: number;
      samples: string[];
    }>(sql`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(ARRAY_AGG(slug ORDER BY announced_date), ARRAY[]::text[]) AS samples
      FROM (
        SELECT slug, announced_date FROM "app"."datacenter"
        WHERE verified = true
          AND announced_date IS NOT NULL
          AND announced_date < NOW() - INTERVAL '5 years'
          AND online_date IS NULL
          AND status NOT IN ('operational', 'cancelled', 'decommissioned')
        ORDER BY announced_date
        LIMIT 5
      ) t
      RIGHT JOIN (
        SELECT COUNT(*)::int AS c FROM "app"."datacenter"
        WHERE verified = true
          AND announced_date IS NOT NULL
          AND announced_date < NOW() - INTERVAL '5 years'
          AND online_date IS NULL
          AND status NOT IN ('operational', 'cancelled', 'decommissioned')
      ) cnt ON true
      GROUP BY cnt.c;
    `);

    const noPowerSource = await ctx.db.execute<{
      count: number;
      samples: string[];
    }>(sql`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(ARRAY_AGG(slug ORDER BY name), ARRAY[]::text[]) AS samples
      FROM (
        SELECT slug, name FROM "app"."datacenter"
        WHERE verified = true AND primary_power_source IS NULL
        ORDER BY name
        LIMIT 5
      ) t
      RIGHT JOIN (
        SELECT COUNT(*)::int AS c FROM "app"."datacenter"
        WHERE verified = true AND primary_power_source IS NULL
      ) cnt ON true
      GROUP BY cnt.c;
    `);

    const concentratedRows = (concentration.rows ?? []) as Array<{
      country: string;
      hhi: number;
    }>;
    const greenwashRows = (greenwashGap.rows ?? []) as Array<{
      operator_slug: string;
      operator_name: string;
      gap_pp: number | null;
    }>;
    const depRows = (singleSupplierDep.rows ?? []) as Array<{
      datacenter_slug: string;
      supplier_name: string;
      categories: number;
    }>;

    const redFlags = {
      noSources: {
        count: noSources.rows[0]?.count ?? 0,
        samples: noSources.rows[0]?.samples ?? [],
      },
      noPowerSource: {
        count: noPowerSource.rows[0]?.count ?? 0,
        samples: noPowerSource.rows[0]?.samples ?? [],
      },
      stuckAnnounced: {
        count: stuckAnnounced.rows[0]?.count ?? 0,
        samples: stuckAnnounced.rows[0]?.samples ?? [],
      },
      highConcentration: {
        count: concentratedRows.filter((c) => c.hhi >= 2500).length,
        samples: concentratedRows
          .filter((c) => c.hhi >= 2500)
          .slice(0, 5)
          .map((c) => c.country),
      },
      wideCommitmentGap: {
        count: greenwashRows.filter((g) => (g.gap_pp ?? 0) >= 30).length,
        samples: greenwashRows
          .filter((g) => (g.gap_pp ?? 0) >= 30)
          .slice(0, 5)
          .map((g) => g.operator_name),
      },
      singleSupplierDep: {
        count: depRows.length,
        samples: depRows.slice(0, 5).map((d) => d.datacenter_slug),
      },
    };

    return {
      totals: totals ?? {
        facilityCount: 0,
        totalMw: 0,
        plannedMw: 0,
        countries: 0,
        aiDedicated: 0,
      },
      supplierTotals: supplierTotals ?? {
        linkCount: 0,
        supplierCount: 0,
        coveredFacilities: 0,
      },
      topOperators,
      topSupplierCategories,
      topSuppliers,
      byPowerSource,
      byCoolingType,
      concentration: concentration.rows ?? [],
      singleSupplierDep: singleSupplierDep.rows ?? [],
      operatorPowerMix,
      greenwashGap: greenwashGap.rows ?? [],
      announceTrend: announceTrend.rows ?? [],
      lagStats: lagStats ?? { sample_size: 0, avg_lag_days: 0, median_lag_days: 0 },
      redFlags,
    };
  }),

  peerComparison: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dc] = await ctx.db
        .select({
          id: datacenters.id,
          slug: datacenters.slug,
          country: datacenters.country,
          capacityMw: datacenters.capacityMw,
          capacityMwPlanned: datacenters.capacityMwPlanned,
          announcedDate: datacenters.announcedDate,
          onlineDate: datacenters.onlineDate,
          aiDedicated: datacenters.aiDedicated,
        })
        .from(datacenters)
        .where(eq(datacenters.slug, input.slug))
        .limit(1);
      if (!dc) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const facMw =
        Number(dc.capacityMw ?? 0) + Number(dc.capacityMwPlanned ?? 0);

      const peers = await ctx.db.execute<{
        peer_count: number;
        median_mw: number;
        p75_mw: number;
        p95_mw: number;
        median_lag_days: number | null;
        ai_share_pct: number;
      }>(sql`
        WITH peer_pool AS (
          SELECT
            COALESCE(capacity_mw,0) + COALESCE(capacity_mw_planned,0) AS mw,
            (online_date - announced_date) AS lag_days,
            ai_dedicated::int AS ai
          FROM "app"."datacenter"
          WHERE country = ${dc.country}
            AND verified = true
            AND id <> ${dc.id}
        )
        SELECT
          COUNT(*)::int AS peer_count,
          ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY mw))::float AS median_mw,
          ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY mw))::float AS p75_mw,
          ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY mw))::float AS p95_mw,
          ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY lag_days))::int AS median_lag_days,
          ROUND(AVG(ai) * 100)::float AS ai_share_pct
        FROM peer_pool;
      `);

      const supplierCounts = await ctx.db.execute<{
        median: number;
        p75: number;
        this_count: number;
      }>(sql`
        WITH counts AS (
          SELECT d.id, COUNT(s.id)::int AS n
          FROM "app"."datacenter" d
          LEFT JOIN "app"."datacenter_supplier" s ON s.datacenter_id = d.id
          WHERE d.country = ${dc.country} AND d.verified = true
          GROUP BY d.id
        )
        SELECT
          ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY n))::int AS median,
          ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY n))::int AS p75,
          (SELECT n FROM counts WHERE id = ${dc.id})::int AS this_count
        FROM counts
        WHERE id <> ${dc.id};
      `);

      const peerStats = peers.rows[0] ?? {
        peer_count: 0,
        median_mw: 0,
        p75_mw: 0,
        p95_mw: 0,
        median_lag_days: null,
        ai_share_pct: 0,
      };
      const supStats = supplierCounts.rows[0] ?? {
        median: 0,
        p75: 0,
        this_count: 0,
      };

      const lagDays =
        dc.announcedDate && dc.onlineDate
          ? Math.round(
              (new Date(dc.onlineDate).getTime() -
                new Date(dc.announcedDate).getTime()) /
                86_400_000,
            )
          : null;

      return {
        country: dc.country,
        peerCount: peerStats.peer_count,
        thisFacility: {
          mw: facMw,
          lagDays,
          supplierCount: supStats.this_count ?? 0,
          aiDedicated: dc.aiDedicated,
        },
        countryStats: {
          medianMw: peerStats.median_mw,
          p75Mw: peerStats.p75_mw,
          p95Mw: peerStats.p95_mw,
          medianLagDays: peerStats.median_lag_days,
          aiSharePct: peerStats.ai_share_pct,
          medianSuppliers: supStats.median,
          p75Suppliers: supStats.p75,
        },
      };
    }),

  relationshipGraph: publicProcedure
    .input(
      z
        .object({
          minFacilities: z.number().int().min(1).max(10).optional(),
          category: z.enum(SUPPLIER_CATEGORY).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const i = input ?? {};
      const minFac = i.minFacilities ?? 2;

      // Operator nodes (brands acting as operator) with facility + MW counts
      const operatorRows = await ctx.db
        .select({
          slug: brands.slug,
          name: brands.canonicalName,
          facilityCount: sql<number>`COUNT(*)::int`,
          mw: sql<number>`COALESCE(SUM(COALESCE(${datacenters.capacityMw},0) + COALESCE(${datacenters.capacityMwPlanned},0)), 0)::float`,
        })
        .from(datacenters)
        .innerJoin(brands, eq(brands.id, datacenters.operatorId))
        .where(eq(datacenters.verified, true))
        .groupBy(brands.slug, brands.canonicalName)
        .having(sql`COUNT(*) >= ${minFac}`);

      // Supplier nodes (brands acting as supplier)
      const conds = i.category
        ? [eq(datacenterSuppliers.category, i.category)]
        : [];
      const supplierRows = await ctx.db
        .select({
          slug: brands.slug,
          name: brands.canonicalName,
          facilityCount: sql<number>`COUNT(DISTINCT ${datacenterSuppliers.datacenterId})::int`,
          categories: sql<string[]>`array_agg(DISTINCT ${datacenterSuppliers.category})`,
        })
        .from(datacenterSuppliers)
        .innerJoin(brands, eq(brands.id, datacenterSuppliers.supplierId))
        .where(conds.length ? and(...conds) : undefined)
        .groupBy(brands.slug, brands.canonicalName)
        .having(sql`COUNT(DISTINCT ${datacenterSuppliers.datacenterId}) >= ${minFac}`);

      // Edges: operator -> supplier (when both meet threshold), weighted by shared facility count
      const opSlugs = new Set(operatorRows.map((o) => o.slug));
      const supSlugs = new Set(supplierRows.map((s) => s.slug));

      const edgeRows = await ctx.db.execute<{
        operator_slug: string;
        supplier_slug: string;
        shared_facilities: number;
      }>(sql`
        SELECT
          op.slug AS operator_slug,
          sp.slug AS supplier_slug,
          COUNT(DISTINCT d.id)::int AS shared_facilities
        FROM "app"."datacenter" d
        JOIN "app"."brand" op ON op.id = d.operator_id
        JOIN "app"."datacenter_supplier" s ON s.datacenter_id = d.id
        JOIN "app"."brand" sp ON sp.id = s.supplier_id
        WHERE d.verified = true
        ${i.category ? sql`AND s.category = ${i.category}` : sql``}
        GROUP BY op.slug, sp.slug
        HAVING COUNT(DISTINCT d.id) >= 1
        ORDER BY shared_facilities DESC
        LIMIT 500;
      `);

      const edges = edgeRows.rows
        .filter(
          (e) => opSlugs.has(e.operator_slug) && supSlugs.has(e.supplier_slug),
        )
        .map((e) => ({
          source: `op:${e.operator_slug}`,
          target: `sp:${e.supplier_slug}`,
          weight: e.shared_facilities,
        }));

      const nodes = [
        ...operatorRows.map((o) => ({
          id: `op:${o.slug}`,
          slug: o.slug,
          name: o.name,
          kind: "operator" as const,
          weight: o.facilityCount,
          mw: Math.round(o.mw),
        })),
        ...supplierRows.map((s) => ({
          id: `sp:${s.slug}`,
          slug: s.slug,
          name: s.name,
          kind: "supplier" as const,
          weight: s.facilityCount,
          mw: 0,
          categories: s.categories ?? [],
        })),
      ];

      // Drop nodes with no edges to keep canvas readable
      const usedIds = new Set<string>();
      for (const e of edges) {
        usedIds.add(e.source);
        usedIds.add(e.target);
      }
      const filteredNodes = nodes.filter((n) => usedIds.has(n.id));

      return { nodes: filteredNodes, edges };
    }),

  // ───── Ownership chain (walk parent edges, compute opacity) ─────
  ownershipChain: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [start] = await ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          jurisdiction: brands.jurisdiction,
          jurisdictionRegion: brands.jurisdictionRegion,
          entityType: brands.entityType,
          ultimateBeneficialOwner: brands.ultimateBeneficialOwner,
        })
        .from(brands)
        .where(eq(brands.slug, input.slug))
        .limit(1);
      if (!start) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }

      type ChainNode = {
        id: string;
        slug: string;
        name: string;
        jurisdiction: string | null;
        entityType: string | null;
        ownershipPct: number | null;
        sourceUrl: string | null;
      };

      const chain: ChainNode[] = [
        {
          id: start.id,
          slug: start.slug,
          name: start.canonicalName,
          jurisdiction: start.jurisdiction,
          entityType: start.entityType,
          ownershipPct: null,
          sourceUrl: null,
        },
      ];

      // Walk up to 6 layers (cycle-safe via id set)
      const seen = new Set<string>([start.id]);
      let cursor = start.id;
      for (let depth = 0; depth < 6; depth++) {
        const [parent] = await ctx.db
          .select({
            id: brands.id,
            slug: brands.slug,
            canonicalName: brands.canonicalName,
            jurisdiction: brands.jurisdiction,
            entityType: brands.entityType,
            ownershipPct: ownershipEdges.ownershipPct,
            sourceUrl: ownershipEdges.sourceUrl,
          })
          .from(ownershipEdges)
          .innerJoin(brands, eq(brands.id, ownershipEdges.parentBrandId))
          .where(eq(ownershipEdges.childBrandId, cursor))
          .limit(1);
        if (!parent || seen.has(parent.id)) break;
        chain.push({
          id: parent.id,
          slug: parent.slug,
          name: parent.canonicalName,
          jurisdiction: parent.jurisdiction,
          entityType: parent.entityType,
          ownershipPct: parent.ownershipPct,
          sourceUrl: parent.sourceUrl,
        });
        seen.add(parent.id);
        cursor = parent.id;
      }

      const score = opacityScore(
        chain.map((c) => ({ jurisdiction: c.jurisdiction })),
      );
      return {
        chain,
        depth: chain.length,
        opacityScore: score,
        ultimateBeneficialOwner: start.ultimateBeneficialOwner,
      };
    }),

  // ───── Subsidies for a facility ─────
  subsidiesFor: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dc] = await ctx.db
        .select({ id: datacenters.id })
        .from(datacenters)
        .where(eq(datacenters.slug, input.slug))
        .limit(1);
      if (!dc) return [];
      return ctx.db
        .select()
        .from(subsidies)
        .where(eq(subsidies.datacenterId, dc.id))
        .orderBy(desc(subsidies.announcedDate));
    }),

  // ───── Permits for a facility ─────
  permitsFor: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dc] = await ctx.db
        .select({ id: datacenters.id })
        .from(datacenters)
        .where(eq(datacenters.slug, input.slug))
        .limit(1);
      if (!dc) return [];
      return ctx.db
        .select()
        .from(permits)
        .where(eq(permits.datacenterId, dc.id))
        .orderBy(asc(permits.appliedDate));
    }),

  // ───── Status history for a facility ─────
  statusHistoryFor: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dc] = await ctx.db
        .select({ id: datacenters.id })
        .from(datacenters)
        .where(eq(datacenters.slug, input.slug))
        .limit(1);
      if (!dc) return [];
      return ctx.db
        .select()
        .from(datacenterStatusHistory)
        .where(eq(datacenterStatusHistory.datacenterId, dc.id))
        .orderBy(asc(datacenterStatusHistory.effectiveDate));
    }),

  // ───── Subsidy flow (Sankey: jurisdiction → operator → datacenter) ─────
  subsidyFlow: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        jurisdiction: subsidies.jurisdiction,
        kind: subsidies.kind,
        recipient: brands.canonicalName,
        recipientSlug: brands.slug,
        datacenterName: datacenters.name,
        datacenterSlug: datacenters.slug,
        amountUsd: subsidies.amountUsd,
        announcedDate: subsidies.announcedDate,
      })
      .from(subsidies)
      .leftJoin(brands, eq(brands.id, subsidies.recipientBrandId))
      .leftJoin(datacenters, eq(datacenters.id, subsidies.datacenterId))
      .orderBy(desc(subsidies.amountUsd));
    return rows;
  }),

  // ───── Aggregate red-flag counts that depend on Phase 5 tables ─────
  phase5RedFlags: publicProcedure.query(async ({ ctx }) => {
    const [fastPermitRow] = await ctx.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM "app"."permit"
      WHERE applied_date IS NOT NULL
        AND issued_date IS NOT NULL
        AND (issued_date - applied_date) < 14
        AND verified = true;
    `).then((r) => r.rows);

    const [deepOwnershipRow] = await ctx.db.execute<{ count: number }>(sql`
      WITH RECURSIVE chain AS (
        SELECT child_brand_id, parent_brand_id, 1 AS depth
        FROM "app"."ownership_edge"
        UNION ALL
        SELECT c.child_brand_id, e.parent_brand_id, c.depth + 1
        FROM chain c
        JOIN "app"."ownership_edge" e ON e.child_brand_id = c.parent_brand_id
        WHERE c.depth < 6
      )
      SELECT COUNT(DISTINCT child_brand_id)::int AS count
      FROM chain
      WHERE depth >= 3;
    `).then((r) => r.rows);

    const [subsidyMismatchRow] = await ctx.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM "app"."subsidy"
      WHERE claimed_jobs IS NOT NULL
        AND claimed_jobs > 0
        AND amount_usd IS NOT NULL
        AND (amount_usd / NULLIF(claimed_jobs, 0)) > 1000000;
    `).then((r) => r.rows);

    return {
      fastPermitCount: fastPermitRow?.count ?? 0,
      deepOwnershipCount: deepOwnershipRow?.count ?? 0,
      subsidyMismatchCount: subsidyMismatchRow?.count ?? 0,
    };
  }),

  submit: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(200),
        slug: z.string().min(2).max(100).regex(SLUG_RE),
        operatorBrandId: z.string().uuid(),
        status: z.enum(DATACENTER_STATUS).default("announced"),
        aiDedicated: z.boolean().default(false),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().max(300).optional(),
        city: z.string().max(120).optional(),
        region: z.string().max(120).optional(),
        country: z.string().length(2).toUpperCase(),
        capacityMw: z.number().nonnegative().optional(),
        capacityMwPlanned: z.number().nonnegative().optional(),
        squareFootage: z.number().nonnegative().optional(),
        rackCount: z.number().int().nonnegative().optional(),
        gpus: z.array(gpuSchema).max(20).default([]),
        primaryPowerSource: z.enum(POWER_SOURCE).optional(),
        utilityBrandId: z.string().uuid().optional(),
        puePledged: z.number().positive().optional(),
        coolingType: z.enum(COOLING_TYPE).optional(),
        waterDrawMgd: z.number().nonnegative().optional(),
        waterDrawCubicM: z.number().nonnegative().optional(),
        wuePledged: z.number().nonnegative().optional(),
        announcedDate: z.string().optional(),
        groundbreakDate: z.string().optional(),
        onlineDate: z.string().optional(),
        fullCapacityDate: z.string().optional(),
        capexUsd: z.number().nonnegative().optional(),
        description: z.string().max(5000).optional(),
        sources: z.array(sourceSchema).min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: datacenters.id })
        .from(datacenters)
        .where(eq(datacenters.slug, input.slug))
        .limit(1);
      if (existing.length) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Slug already exists",
        });
      }

      const [op] = await ctx.db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.id, input.operatorBrandId))
        .limit(1);
      if (!op) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Operator brand not found",
        });
      }

      const [created] = await ctx.db
        .insert(datacenters)
        .values({
          name: input.name,
          slug: input.slug,
          operatorId: input.operatorBrandId,
          status: input.status,
          aiDedicated: input.aiDedicated,
          lat: input.lat,
          lng: input.lng,
          address: input.address,
          city: input.city,
          region: input.region,
          country: input.country,
          capacityMw: input.capacityMw,
          capacityMwPlanned: input.capacityMwPlanned,
          squareFootage: input.squareFootage,
          rackCount: input.rackCount,
          gpus: input.gpus,
          primaryPowerSource: input.primaryPowerSource,
          utilityId: input.utilityBrandId,
          puePledged: input.puePledged,
          coolingType: input.coolingType,
          waterDrawMgd: input.waterDrawMgd,
          waterDrawCubicM: input.waterDrawCubicM,
          wuePledged: input.wuePledged,
          announcedDate: input.announcedDate,
          groundbreakDate: input.groundbreakDate,
          onlineDate: input.onlineDate,
          fullCapacityDate: input.fullCapacityDate,
          capexUsd: input.capexUsd,
          description: input.description,
          sources: input.sources satisfies DatacenterSource[],
          submittedByUserId: ctx.session.user.id,
          verified: false,
        })
        .returning({ id: datacenters.id, slug: datacenters.slug });

      return created;
    }),

  // ───── Brand search/create (helper for supplier form) ─────
  searchBrands: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(80),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const like = `%${input.q.toLowerCase()}%`;
      const prefix = `${input.q.toLowerCase()}%`;
      return ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          website: brands.website,
        })
        .from(brands)
        .where(
          or(
            sql`lower(${brands.canonicalName}) like ${like}`,
            sql`lower(${brands.slug}) like ${like}`,
          ),
        )
        .orderBy(
          sql`CASE WHEN lower(${brands.canonicalName}) like ${prefix} THEN 0 ELSE 1 END`,
          brands.canonicalName,
        )
        .limit(input.limit);
    }),

  createBrand: protectedProcedure
    .input(
      z.object({
        canonicalName: z.string().min(2).max(120),
        website: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let slug = slugify(input.canonicalName);
      if (!slug)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid name" });
      const exists = await ctx.db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.slug, slug))
        .limit(1);
      if (exists.length) {
        slug = `${slug}-${Math.floor(Math.random() * 9999)}`;
      }
      const [row] = await ctx.db
        .insert(brands)
        .values({
          slug,
          canonicalName: input.canonicalName,
          website: input.website,
          verified: false,
        })
        .returning({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
        });
      return row;
    }),

  // ───── Supplier CRUD ─────
  addSupplier: protectedProcedure
    .input(
      z.object({
        datacenterId: z.string().uuid(),
        supplierBrandId: z.string().uuid(),
        category: z.enum(SUPPLIER_CATEGORY),
        role: z.string().max(200).optional(),
        contractValueUsd: z.number().nonnegative().optional(),
        isLocal: z.boolean().default(false),
        sources: z.array(sourceSchema).max(20).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dup = await ctx.db
        .select({ id: datacenterSuppliers.id })
        .from(datacenterSuppliers)
        .where(
          and(
            eq(datacenterSuppliers.datacenterId, input.datacenterId),
            eq(datacenterSuppliers.supplierId, input.supplierBrandId),
            eq(datacenterSuppliers.category, input.category),
          ),
        )
        .limit(1);
      if (dup.length) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Supplier already linked with that category",
        });
      }
      const [row] = await ctx.db
        .insert(datacenterSuppliers)
        .values({
          datacenterId: input.datacenterId,
          supplierId: input.supplierBrandId,
          category: input.category,
          role: input.role,
          contractValueUsd: input.contractValueUsd,
          isLocal: input.isLocal,
          sources: input.sources satisfies DatacenterSource[],
          verified: false,
        })
        .returning({ id: datacenterSuppliers.id });
      return row;
    }),

  removeSupplier: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Anyone can delete their own; admin can delete any. Suppliers don't track submitter,
      // so for now only admin can remove. (TODO: track submittedBy on supplier rows.)
      if (!isAdmin(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      await ctx.db
        .delete(datacenterSuppliers)
        .where(eq(datacenterSuppliers.id, input.id));
      return { ok: true };
    }),

  verifySupplier: protectedProcedure
    .input(z.object({ id: z.string().uuid(), verified: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      await ctx.db
        .update(datacenterSuppliers)
        .set({ verified: input.verified, updatedAt: new Date() })
        .where(eq(datacenterSuppliers.id, input.id));
      return { ok: true };
    }),

  // ───── Findings (community feedback) ─────
  submitFinding: protectedProcedure
    .input(
      z.object({
        datacenterId: z.string().uuid(),
        title: z.string().min(4).max(200),
        claim: z.string().max(500).optional(),
        body: z.string().max(5000).optional(),
        evidenceUrls: z.array(z.string().url()).min(1).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(datacenterFindings)
        .values({
          datacenterId: input.datacenterId,
          userId: ctx.session.user.id,
          title: input.title,
          claim: input.claim,
          body: input.body,
          evidenceUrls: input.evidenceUrls,
          status: "review",
          upvotes: 0,
        })
        .returning({ id: datacenterFindings.id });
      return row;
    }),

  upvoteFinding: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Toggle upvote: if user already voted, remove; else insert.
      const existing = await ctx.db
        .select({ findingId: datacenterFindingVotes.findingId })
        .from(datacenterFindingVotes)
        .where(
          and(
            eq(datacenterFindingVotes.findingId, input.id),
            eq(datacenterFindingVotes.userId, ctx.session.user.id),
          ),
        )
        .limit(1);

      if (existing.length) {
        await ctx.db
          .delete(datacenterFindingVotes)
          .where(
            and(
              eq(datacenterFindingVotes.findingId, input.id),
              eq(datacenterFindingVotes.userId, ctx.session.user.id),
            ),
          );
      } else {
        await ctx.db.insert(datacenterFindingVotes).values({
          findingId: input.id,
          userId: ctx.session.user.id,
          vote: 1,
        });
      }

      // Recount
      const [agg] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(datacenterFindingVotes)
        .where(eq(datacenterFindingVotes.findingId, input.id));
      const newCount = agg?.count ?? 0;
      await ctx.db
        .update(datacenterFindings)
        .set({ upvotes: newCount, updatedAt: new Date() })
        .where(eq(datacenterFindings.id, input.id));
      return { upvotes: newCount, voted: !existing.length };
    }),

  setFindingStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(FINDING_STATUS) }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      await ctx.db
        .update(datacenterFindings)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(datacenterFindings.id, input.id));
      return { ok: true };
    }),

  removeFinding: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ userId: datacenterFindings.userId })
        .from(datacenterFindings)
        .where(eq(datacenterFindings.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.userId !== ctx.session.user.id && !isAdmin(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db
        .delete(datacenterFindings)
        .where(eq(datacenterFindings.id, input.id));
      return { ok: true };
    }),
});
