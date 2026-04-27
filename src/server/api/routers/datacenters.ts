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
  DATACENTER_STATUS,
  POWER_SOURCE,
  COOLING_TYPE,
  SUPPLIER_CATEGORY,
  FINDING_STATUS,
  type DatacenterSource,
} from "@/server/db/schema";

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
          minMw: z.number().nonnegative().optional(),
          aiOnly: z.boolean().optional(),
          includeUnverified: z.boolean().optional(),
          q: z.string().min(1).max(100).optional(),
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
      if (i.minMw !== undefined) {
        conds.push(sql`${datacenters.capacityMw} >= ${i.minMw}`);
      }
      if (i.operatorSlug) {
        conds.push(
          sql`${datacenters.operatorId} = (SELECT id FROM "app"."brand" WHERE slug = ${i.operatorSlug} LIMIT 1)`,
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
