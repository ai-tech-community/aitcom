import { z } from "zod";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

import {
  brands,
  datacenters,
  DATACENTER_STATUS,
  POWER_SOURCE,
} from "@/server/db/schema";
import {
  DEFAULT_FACILITY_PAGE_SIZE,
  DEFAULT_FACILITY_SORT,
  FACILITY_PAGE_SIZES,
  FACILITY_PARAM,
  FACILITY_SORT_KEYS,
  defaultSortDir,
  type FacilitySortKey,
  type SortDir,
} from "@/lib/investigations/facilities-query";

/** Filters shared by the map (`datacenters.list`) and the table (`datacenters.facilities`). */
export const facilityFiltersSchema = z.object({
  country: z.string().length(2).toUpperCase().optional(),
  status: z.enum(DATACENTER_STATUS).optional(),
  powerSource: z.enum(POWER_SOURCE).optional(),
  operatorSlug: z.string().optional(),
  supplierSlug: z.string().optional(),
  minMw: z.number().nonnegative().optional(),
  aiOnly: z.boolean().optional(),
  includeUnverified: z.boolean().optional(),
  q: z.string().min(1).max(100).optional(),
  withSuppliers: z.boolean().optional(),
});
export type FacilityFilters = z.infer<typeof facilityFiltersSchema>;

export const facilitiesPageSchema = facilityFiltersSchema.extend({
  sort: z.enum(FACILITY_SORT_KEYS).default(DEFAULT_FACILITY_SORT),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .refine((n) => (FACILITY_PAGE_SIZES as readonly number[]).includes(n))
    .default(DEFAULT_FACILITY_PAGE_SIZE),
});
export type FacilitiesPageInput = z.input<typeof facilitiesPageSchema>;

export const supplierCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM "app"."datacenter_supplier" s
  WHERE s.datacenter_id = ${datacenters.id}
)`;

/** WHERE clauses for a facility query. Expects `brands` joined as the operator. */
export function facilityConditions(f: FacilityFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.country) conds.push(eq(datacenters.country, f.country));
  if (f.status) conds.push(eq(datacenters.status, f.status));
  if (f.powerSource)
    conds.push(eq(datacenters.primaryPowerSource, f.powerSource));
  if (f.aiOnly) conds.push(eq(datacenters.aiDedicated, true));
  if (!f.includeUnverified) conds.push(eq(datacenters.verified, true));
  if (f.withSuppliers) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM "app"."datacenter_supplier" s WHERE s.datacenter_id = ${datacenters.id})`,
    );
  }
  if (f.minMw !== undefined) {
    conds.push(sql`${datacenters.capacityMw} >= ${f.minMw}`);
  }
  if (f.operatorSlug) {
    conds.push(
      sql`${datacenters.operatorId} = (SELECT id FROM "app"."brand" WHERE slug = ${f.operatorSlug} LIMIT 1)`,
    );
  }
  if (f.supplierSlug) {
    conds.push(
      sql`EXISTS (
        SELECT 1 FROM "app"."datacenter_supplier" s
        JOIN "app"."brand" b ON b.id = s.supplier_id
        WHERE s.datacenter_id = ${datacenters.id} AND b.slug = ${f.supplierSlug}
      )`,
    );
  }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conds.push(
      or(
        ilike(datacenters.name, like),
        ilike(datacenters.city, like),
        ilike(datacenters.region, like),
        ilike(brands.canonicalName, like),
      )!,
    );
  }
  return conds;
}

export function facilityWhere(f: FacilityFilters): SQL | undefined {
  const conds = facilityConditions(f);
  return conds.length ? and(...conds) : undefined;
}

const SORT_COLUMN: Record<FacilitySortKey, SQL | AnyColumn> = {
  name: sql`lower(${datacenters.name})`,
  operator: sql`lower(${brands.canonicalName})`,
  country: datacenters.country,
  // Lifecycle order (announced → … → cancelled), not alphabetical.
  status: sql`array_position(ARRAY[${sql.join(
    DATACENTER_STATUS.map((status) => sql`${status}`),
    sql`, `,
  )}]::text[], ${datacenters.status})`,
  capacity: datacenters.capacityMw,
  planned: datacenters.capacityMwPlanned,
  power: datacenters.primaryPowerSource,
  suppliers: supplierCountSql,
};

/** ORDER BY for the table. Missing values always sink; name and id break ties so paging is stable. */
export function facilityOrderBy(sort: FacilitySortKey, dir: SortDir): SQL[] {
  const column = SORT_COLUMN[sort];
  const primary =
    dir === "asc"
      ? sql`${column} ASC NULLS LAST`
      : sql`${column} DESC NULLS LAST`;
  return [primary, asc(datacenters.name), desc(datacenters.id)];
}

type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Lenient parse of page search params into a table query: an invalid value
 * (a typo'd status, `?page=abc`) falls back to its default instead of
 * erroring, because these URLs are hand-edited and shared.
 */
export function parseFacilitiesSearchParams(
  raw: RawSearchParams,
): z.output<typeof facilitiesPageSchema> {
  const read = (key: string): string | undefined => {
    const v = raw[key];
    const s = Array.isArray(v) ? v[0] : v;
    return s?.trim() ? s.trim() : undefined;
  };
  const pick = <T extends z.ZodType>(
    schema: T,
    value: unknown,
  ): z.output<T> | undefined => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  };
  const shape = facilitiesPageSchema.shape;
  const int = (key: string) => {
    const s = read(key);
    return s && /^\d+$/.test(s) ? Number(s) : undefined;
  };

  const sort =
    pick(shape.sort, read(FACILITY_PARAM.sort)) ?? DEFAULT_FACILITY_SORT;
  return {
    q: pick(shape.q, read(FACILITY_PARAM.q)),
    status: pick(shape.status, read(FACILITY_PARAM.status)),
    country: pick(shape.country, read(FACILITY_PARAM.country)),
    powerSource: pick(shape.powerSource, read(FACILITY_PARAM.power)),
    operatorSlug: read(FACILITY_PARAM.operator),
    supplierSlug: read(FACILITY_PARAM.supplier),
    aiOnly: read(FACILITY_PARAM.aiOnly) === "1" || undefined,
    withSuppliers: read(FACILITY_PARAM.withSuppliers) === "1" || undefined,
    includeUnverified:
      read(FACILITY_PARAM.includeUnverified) === "1" || undefined,
    minMw: undefined,
    sort,
    dir: pick(shape.dir, read(FACILITY_PARAM.dir)) ?? defaultSortDir(sort),
    page: pick(shape.page, int(FACILITY_PARAM.page)) ?? 1,
    pageSize:
      pick(shape.pageSize, int(FACILITY_PARAM.pageSize)) ??
      DEFAULT_FACILITY_PAGE_SIZE,
  };
}

/** Escape `%`, `_` and `\` so a search for "50%" matches literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
