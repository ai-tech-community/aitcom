import { getLocale, getTranslations } from "next-intl/server";

import { api } from "@/trpc/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DatacentersMap } from "@/components/datacenters-map";
import {
  FacilitiesLink,
  FacilitiesNavigationProvider,
  FacilitiesResults,
} from "@/components/datacenters/facilities/facilities-navigation";
import { FacilitiesPagination } from "@/components/datacenters/facilities/facilities-pagination";
import { FacilitiesTable } from "@/components/datacenters/facilities/facilities-table";
import { FacilitiesToolbar } from "@/components/datacenters/facilities/facilities-toolbar";
import { createRegionNamer } from "@/lib/intl/region-name";
import {
  FACILITY_FILTER_PARAMS,
  FACILITY_PARAM,
  clearFiltersPatch,
  hasActiveFacilityFilters,
  patchSearchParams,
} from "@/lib/investigations/facilities-query";
import { DATACENTER_STATUS, POWER_SOURCE } from "@/server/db/schema";
import {
  facilityFiltersSchema,
  parseFacilitiesSearchParams,
} from "@/server/datacenters/facility-query";
import { datacenterTabMetadata } from "@/server/datacenters/tab-metadata";

export const revalidate = 300;

/** The map plots every match up to this many; beyond it, the largest. */
const MAP_LIMIT = 500;

export function generateMetadata() {
  return datacenterTabMetadata("facilities");
}

type RawSearchParams = Record<string, string | string[] | undefined>;

export default async function DatacenterFacilitiesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const input = parseFacilitiesSearchParams(raw);
  // The same filters drive the map; sort and paging only apply to the table.
  const filters = facilityFiltersSchema.parse(input);
  const query = toQueryString(raw);

  const [t, locale, result, mapRows, countryRows] = await Promise.all([
    getTranslations("datacenterInvestigation"),
    getLocale(),
    api.datacenters.facilities(input),
    api.datacenters.list({ ...filters, limit: MAP_LIMIT }),
    api.datacenters.facilityCountries({
      includeUnverified: filters.includeUnverified,
    }),
  ]);

  const regionName = createRegionNamer(locale);
  const collator = new Intl.Collator(locale);
  const countries = countryRows
    .map((c) => ({ value: c.country, label: regionName(c.country) }))
    .sort((a, b) => collator.compare(a.label, b.label));

  const mapPoints = mapRows.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    status: d.status,
    aiDedicated: d.aiDedicated,
    lat: Number(d.lat),
    lng: Number(d.lng),
    city: d.city,
    region: d.region,
    country: d.country,
    capacityMw: d.capacityMw == null ? null : Number(d.capacityMw),
    capacityMwPlanned:
      d.capacityMwPlanned == null ? null : Number(d.capacityMwPlanned),
    primaryPowerSource: d.primaryPowerSource,
    coolingType: d.coolingType,
    verified: d.verified,
    supplierCount: d.supplierCount,
    operator: {
      slug: d.operator.slug,
      canonicalName: d.operator.canonicalName,
    },
  }));

  const hasResults = result.total > 0;

  return (
    <FacilitiesNavigationProvider>
      <div className="flex flex-col gap-5">
        <FacilitiesToolbar
          statuses={DATACENTER_STATUS.map((s) => ({
            value: s,
            label: t(`status.${s}`),
          }))}
          countries={countries}
          powerSources={POWER_SOURCE.map((p) => ({
            value: p,
            label: t(`powerSource.${p}`),
          }))}
          focus={result.focus}
        />

        <FacilitiesResults>
          {hasResults ? (
            <>
              <section aria-label={t("facilities.mapLabel")}>
                <DatacentersMap
                  // Remount on a new filter set so the map re-fits its bounds.
                  key={filterKey(raw)}
                  datacenters={mapPoints}
                  className="h-[45vh] max-h-[480px] min-h-80"
                />
                {mapRows.length < result.total && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t("facilities.mapCapped", {
                      shown: mapRows.length,
                      total: result.total,
                    })}
                  </p>
                )}
              </section>

              <h2 className="text-lg font-semibold">
                {t("facilities.count", { total: result.total })}
              </h2>

              <FacilitiesTable
                rows={result.rows}
                sort={result.sort}
                dir={result.dir}
                query={query}
                locale={locale}
                t={t}
              />

              <FacilitiesPagination
                page={result.page}
                pageCount={result.pageCount}
                pageSize={result.pageSize}
                total={result.total}
                query={query}
                locale={locale}
                t={(key, values) => t(`facilities.${key}`, values)}
              />
            </>
          ) : (
            <div className="border-border rounded-xl border border-dashed">
              <EmptyState
                title={t("facilities.emptyTitle")}
                description={
                  filters.includeUnverified
                    ? t("facilities.emptyDefault")
                    : t("facilities.emptyUnverified")
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {!filters.includeUnverified && (
                      <Button asChild variant="outline" size="sm">
                        <FacilitiesLink
                          query={patchSearchParams(query, {
                            [FACILITY_PARAM.includeUnverified]: "1",
                          })}
                        >
                          {t("facilities.includeUnverified")}
                        </FacilitiesLink>
                      </Button>
                    )}
                    {hasActiveFacilityFilters(query) && (
                      <Button asChild variant="ghost" size="sm">
                        <FacilitiesLink
                          query={patchSearchParams(query, clearFiltersPatch())}
                        >
                          {t("facilities.clearFilters")}
                        </FacilitiesLink>
                      </Button>
                    )}
                  </div>
                }
              />
            </div>
          )}
        </FacilitiesResults>
      </div>
    </FacilitiesNavigationProvider>
  );
}

function toQueryString(raw: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v?.trim()) params.append(key, v);
    }
  }
  return params.toString();
}

/** Only the params that change which facilities match, in a stable order. */
function filterKey(raw: RawSearchParams): string {
  return FACILITY_FILTER_PARAMS.map((key) => {
    const v = raw[key];
    return `${key}=${Array.isArray(v) ? v[0] : (v ?? "")}`;
  }).join("&");
}
