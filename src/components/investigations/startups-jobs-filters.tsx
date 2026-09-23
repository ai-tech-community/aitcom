"use client";

import { useState, type ReactNode } from "react";
import { Globe, Search, SlidersHorizontal, X } from "lucide-react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterSelect } from "@/components/investigations/startups-filter-select";
import { buildStartupJobsPath } from "@/lib/investigations/startups";
import {
  STARTUP_JOBS_REMOTE,
  STARTUP_JOBS_SORTS,
  STARTUP_WORK_TYPE_LABELS,
  parseStartupJobsQuery,
  type StartupJobsQuery,
  type StartupJobsSort,
  type StartupWorkType,
} from "@/lib/investigations/startup-roles";
import { cn } from "@/lib/utils";

/**
 * Title words to start a search from. They are search terms, not a
 * classification: a chip only fills the search box.
 */
const QUICK_SEARCHES = ["Engineer", "Research", "Sales", "Design", "Product"];

export type StartupsJobsFiltersLabels = {
  search: string;
  company: string;
  companyAll: string;
  location: string;
  locationAll: string;
  locationRemote: string;
  workType: string;
  workTypeAll: string;
  sortRole: string;
  sortCompany: string;
  sortLocation: string;
  filters: string;
  remoteToggle: string;
  tryLabel: string;
  results: string;
  clear: string;
};

export function StartupsJobsFilters({
  query,
  locale,
  companies,
  locations,
  workTypes,
  labels,
  aside,
}: {
  query: StartupJobsQuery;
  locale: "en" | "nl";
  companies: { slug: string; name: string }[];
  locations: string[];
  workTypes: StartupWorkType[];
  labels: StartupsJobsFiltersLabels;
  /** Extra result-bar action, e.g. Follow this search. */
  aside?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const activeFilters = [query.company, query.location, query.workType].filter(
    Boolean,
  ).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilters > 0);
  const remoteOn = query.location === STARTUP_JOBS_REMOTE;

  function replaceQuery(next: Partial<StartupJobsQuery>) {
    const filterChanged =
      next.q !== undefined ||
      next.company !== undefined ||
      next.location !== undefined ||
      next.workType !== undefined ||
      next.sort !== undefined;
    const merged = parseStartupJobsQuery({
      ...query,
      ...next,
      page: next.page ?? (filterChanged ? 1 : query.page),
    });
    const path = buildStartupJobsPath(merged);
    const qs = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const sortLabel: Record<StartupJobsSort, string> = {
    role: labels.sortRole,
    company: labels.sortCompany,
    location: labels.sortLocation,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor="jobs-search" className="sr-only">
            {labels.search}
          </Label>
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="jobs-search"
            type="search"
            value={query.q}
            placeholder={labels.search}
            onChange={(event) => replaceQuery({ q: event.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-pressed={remoteOn}
            data-jobs-remote=""
            onClick={() =>
              replaceQuery({ location: remoteOn ? "" : STARTUP_JOBS_REMOTE })
            }
            className={cn(
              remoteOn &&
                "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
            )}
          >
            <Globe aria-hidden="true" />
            {labels.remoteToggle}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="md:hidden"
            aria-expanded={filtersOpen}
            aria-controls="jobs-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            <span className="max-sm:sr-only">{labels.filters}</span>
            {activeFilters > 0 ? (
              <span className="bg-foreground text-background rounded-full px-1.5 font-mono text-xs tabular-nums">
                {activeFilters}
              </span>
            ) : null}
          </Button>
          <Label htmlFor="jobs-sort" className="sr-only">
            {labels.sortCompany}
          </Label>
          <Select
            value={query.sort}
            onValueChange={(value) =>
              replaceQuery({ sort: value as StartupJobsSort })
            }
          >
            <SelectTrigger
              id="jobs-sort"
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STARTUP_JOBS_SORTS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {sortLabel[id]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.q ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {labels.tryLabel}
          </span>
          {QUICK_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              data-jobs-quick-search={term}
              onClick={() => replaceQuery({ q: term })}
              className="border-border hover:bg-muted/60 focus-visible:ring-ring/50 rounded-full border px-2.5 py-0.5 text-xs transition-colors outline-none focus-visible:ring-[3px]"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      <div
        id="jobs-filters"
        className={cn(
          "grid grid-cols-1 gap-2 sm:grid-cols-3",
          !filtersOpen && "max-md:hidden",
        )}
      >
        <FilterSelect
          id="jobs-company"
          label={labels.company}
          allLabel={labels.companyAll}
          value={query.company || "all"}
          options={companies.map((company) => ({
            value: company.slug,
            label: company.name,
          }))}
          onChange={(value) =>
            replaceQuery({ company: value === "all" ? "" : value })
          }
        />
        <FilterSelect
          id="jobs-location"
          label={labels.location}
          allLabel={labels.locationAll}
          value={query.location || "all"}
          options={[
            { value: STARTUP_JOBS_REMOTE, label: labels.locationRemote },
            ...locations.map((location) => ({
              value: location,
              label: location,
            })),
          ]}
          onChange={(value) =>
            replaceQuery({ location: value === "all" ? "" : value })
          }
        />
        <FilterSelect
          id="jobs-work-type"
          label={labels.workType}
          allLabel={labels.workTypeAll}
          value={query.workType || "all"}
          options={workTypes.map((id) => ({
            value: id,
            label: STARTUP_WORK_TYPE_LABELS[id][locale],
          }))}
          onChange={(value) =>
            replaceQuery({ workType: value === "all" ? "" : value })
          }
        />
      </div>

      <div
        data-jobs-results=""
        className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        <p
          aria-live="polite"
          className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase tabular-nums"
        >
          {labels.results}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {aside}
          {activeFilters > 0 || query.q ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                replaceQuery({ q: "", company: "", location: "", workType: "" })
              }
            >
              <X aria-hidden="true" />
              {labels.clear}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
