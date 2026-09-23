import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import {
  patchSearchParams,
  sortPatch,
  type FacilitySortKey,
  type SortDir,
} from "@/lib/investigations/facilities-query";
import { createRegionNamer } from "@/lib/intl/region-name";
import { cn } from "@/lib/utils";
import { FacilitiesLink } from "./facilities-navigation";

export type FacilityRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  aiDedicated: boolean;
  verified: boolean;
  city: string | null;
  region: string | null;
  country: string;
  capacityMw: string | number | null;
  capacityMwPlanned: string | number | null;
  primaryPowerSource: string | null;
  operator: { slug: string; canonicalName: string };
  supplierCount: number;
};

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

type BadgeVariant = "secondary" | "success" | "warning" | "info" | "outline";

/** Facility lifecycle as status color; the label always carries the meaning too. */
const STATUS_BADGE: Record<string, BadgeVariant> = {
  announced: "secondary",
  "under-construction": "warning",
  operational: "success",
  expanding: "info",
  decommissioned: "outline",
  cancelled: "outline",
};

type Column = {
  key: FacilitySortKey;
  align: "left" | "right";
  /** Hide below this breakpoint; the most identifying columns always show. */
  from?: "sm" | "md" | "lg";
};

const COLUMNS: Column[] = [
  { key: "name", align: "left" },
  { key: "operator", align: "left", from: "sm" },
  { key: "country", align: "left" },
  { key: "status", align: "left", from: "md" },
  { key: "capacity", align: "right" },
  { key: "planned", align: "right", from: "lg" },
  { key: "power", align: "left", from: "lg" },
  { key: "suppliers", align: "right", from: "md" },
];

const SHOW_FROM = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

/**
 * The facilities data table. Server-rendered from one page of results; sorting
 * is a link per header, so every view has a URL.
 */
export function FacilitiesTable({
  rows,
  sort,
  dir,
  query,
  locale,
  t,
}: {
  rows: FacilityRow[];
  sort: FacilitySortKey;
  dir: SortDir;
  /** The current query string, which sort links patch. */
  query: string;
  locale: string;
  /** Translator scoped to `datacenterInvestigation`. */
  t: Translate;
}) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const regionName = createRegionNamer(locale);
  const mw = (v: string | number | null) =>
    v == null ? null : number.format(Number(v));

  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {t("facilities.caption", {
            column: t(`facilities.columns.${sort}`),
            direction: t(
              dir === "asc" ? "facilities.ascending" : "facilities.descending",
            ),
          })}
        </caption>
        <thead className="bg-muted/40 text-muted-foreground text-xs">
          <tr>
            {COLUMNS.map((col) => {
              const active = sort === col.key;
              const Icon = !active
                ? ArrowUpDownIcon
                : dir === "asc"
                  ? ArrowUpIcon
                  : ArrowDownIcon;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cn(
                    "px-3 py-2 font-medium whitespace-nowrap",
                    col.align === "right" ? "text-right" : "text-left",
                    col.from && SHOW_FROM[col.from],
                  )}
                >
                  <FacilitiesLink
                    query={patchSearchParams(
                      query,
                      sortPatch({ sort, dir }, col.key),
                    )}
                    className={cn(
                      "group hover:text-foreground focus-visible:ring-ring/50 -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-[3px]",
                      col.align === "right" && "flex-row-reverse",
                      active && "text-foreground",
                    )}
                  >
                    {t(`facilities.columns.${col.key}`)}
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0",
                        !active &&
                          "opacity-40 transition-opacity group-hover:opacity-100",
                      )}
                    />
                  </FacilitiesLink>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const place = [d.city, d.region].filter(Boolean).join(", ");
            const capacity = mw(d.capacityMw);
            const planned = mw(d.capacityMwPlanned);
            return (
              <tr
                key={d.id}
                className="border-border hover:bg-muted/40 border-t transition-colors"
              >
                <th
                  scope="row"
                  className="min-w-52 px-3 py-2.5 text-left align-top font-normal"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/investigations/datacenters/${d.slug}`}
                      className="font-medium hover:underline"
                    >
                      {d.name}
                    </Link>
                    {d.aiDedicated && (
                      <Badge
                        variant="secondary"
                        title={t("facilities.aiBadgeTitle")}
                      >
                        {t("facilities.aiBadge")}
                      </Badge>
                    )}
                    {!d.verified && (
                      <Badge variant="outline">
                        {t("facilities.unverified")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    <span className="sm:hidden">
                      {d.operator.canonicalName}
                      {place ? " · " : ""}
                    </span>
                    {place}
                  </div>
                </th>
                <td className={cn(cellBase, SHOW_FROM.sm)}>
                  <Link
                    href={`/investigations/operators/${d.operator.slug}`}
                    className="hover:underline"
                  >
                    {d.operator.canonicalName}
                  </Link>
                </td>
                <td className={cellBase}>
                  <abbr
                    title={regionName(d.country)}
                    className="font-mono text-xs no-underline"
                  >
                    {d.country}
                  </abbr>
                </td>
                <td className={cn(cellBase, SHOW_FROM.md)}>
                  <Badge variant={STATUS_BADGE[d.status] ?? "outline"}>
                    {t(`status.${d.status}`)}
                  </Badge>
                </td>
                <td className={cn(cellBase, numericCell)}>
                  {capacity ?? <Missing />}
                </td>
                <td
                  className={cn(
                    cellBase,
                    numericCell,
                    "text-muted-foreground",
                    SHOW_FROM.lg,
                  )}
                >
                  {planned ?? <Missing />}
                </td>
                <td className={cn(cellBase, "whitespace-nowrap", SHOW_FROM.lg)}>
                  {d.primaryPowerSource ? (
                    t(`powerSource.${d.primaryPowerSource}`)
                  ) : (
                    <Missing />
                  )}
                </td>
                <td
                  className={cn(
                    cellBase,
                    numericCell,
                    d.supplierCount === 0 && "text-muted-foreground",
                    SHOW_FROM.md,
                  )}
                >
                  {number.format(d.supplierCount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const cellBase = "px-3 py-2.5 align-top";
const numericCell = "text-right font-mono tabular-nums";

function Missing() {
  return <span className="text-muted-foreground">—</span>;
}
