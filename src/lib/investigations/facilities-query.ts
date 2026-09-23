/**
 * URL state for the facilities data table. The URL is the single source of
 * truth for filters, sort and pagination, so a table view is shareable and
 * works without JavaScript. Pure and client-safe: the server parses these
 * params (`src/server/datacenters/facility-query.ts`) and client controls
 * patch them with the helpers below.
 */

export const FACILITY_SORT_KEYS = [
  "name",
  "operator",
  "country",
  "status",
  "capacity",
  "planned",
  "power",
  "suppliers",
] as const;
export type FacilitySortKey = (typeof FACILITY_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

const NUMERIC_SORT_KEYS: ReadonlySet<FacilitySortKey> = new Set([
  "capacity",
  "planned",
  "suppliers",
]);

export const FACILITY_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_FACILITY_PAGE_SIZE = 25;
export const DEFAULT_FACILITY_SORT: FacilitySortKey = "capacity";

/** Search-param names. Filter names predate the table; keep them stable. */
export const FACILITY_PARAM = {
  q: "q",
  status: "status",
  country: "country",
  power: "power",
  operator: "operator",
  supplier: "supplier",
  aiOnly: "ai",
  withSuppliers: "suppliers",
  includeUnverified: "unverified",
  sort: "sort",
  dir: "dir",
  page: "page",
  pageSize: "size",
} as const;

/** Params that narrow the result set (as opposed to ordering or paging it). */
export const FACILITY_FILTER_PARAMS = [
  FACILITY_PARAM.q,
  FACILITY_PARAM.status,
  FACILITY_PARAM.country,
  FACILITY_PARAM.power,
  FACILITY_PARAM.operator,
  FACILITY_PARAM.supplier,
  FACILITY_PARAM.aiOnly,
  FACILITY_PARAM.withSuppliers,
  FACILITY_PARAM.includeUnverified,
] as const;

/** Numbers read best largest-first; text reads best A→Z. */
export function defaultSortDir(key: FacilitySortKey): SortDir {
  return NUMERIC_SORT_KEYS.has(key) ? "desc" : "asc";
}

export type ParamPatch = Record<string, string | null | undefined>;

/**
 * Apply a patch to a query string. `null`, `undefined` and `""` remove the key.
 * Any change that is not itself a page change resets to the first page, so a
 * new filter or sort never strands the reader on an empty page 9.
 */
export function patchSearchParams(
  current: string | URLSearchParams,
  patch: ParamPatch,
): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") next.delete(key);
    else next.set(key, value);
  }
  if (!(FACILITY_PARAM.page in patch)) next.delete(FACILITY_PARAM.page);
  return next.toString();
}

/** Patch for clicking a column header: toggle the active column, else start at its natural direction. */
export function sortPatch(
  active: { sort: FacilitySortKey; dir: SortDir },
  key: FacilitySortKey,
): ParamPatch {
  const dir =
    active.sort === key
      ? active.dir === "asc"
        ? "desc"
        : "asc"
      : defaultSortDir(key);
  const isDefault =
    key === DEFAULT_FACILITY_SORT && dir === defaultSortDir(key);
  return {
    [FACILITY_PARAM.sort]: isDefault ? null : key,
    [FACILITY_PARAM.dir]: isDefault ? null : dir,
  };
}

export function hasActiveFacilityFilters(
  params: string | URLSearchParams,
): boolean {
  const p = new URLSearchParams(params);
  return FACILITY_FILTER_PARAMS.some((key) => Boolean(p.get(key)?.trim()));
}

/** Patch that removes every filter but keeps sort and page size. */
export function clearFiltersPatch(): ParamPatch {
  return Object.fromEntries(FACILITY_FILTER_PARAMS.map((key) => [key, null]));
}

/**
 * Page numbers to render, with `"gap"` where pages are skipped.
 * Always shows the first and last page and `siblings` pages around the current one.
 */
export function paginationRange(
  page: number,
  pageCount: number,
  siblings = 1,
): (number | "gap")[] {
  if (pageCount <= 0) return [];
  const window = new Set<number>([1, pageCount]);
  for (let p = page - siblings; p <= page + siblings; p++) {
    if (p >= 1 && p <= pageCount) window.add(p);
  }
  const pages = [...window].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push("gap");
    out.push(p);
  });
  return out;
}
