"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { StartupsDirectoryTable } from "@/components/investigations/startups-directory-table";
import { StartupsMapSheet } from "@/components/investigations/startups-map-sheet";
import { StartupsPagination } from "@/components/investigations/startups-pagination";
import { StartupsSubmitDialog } from "@/components/investigations/startups-submit-dialog";
import {
  STARTUP_CATEGORY_IDS,
  STARTUP_CATEGORY_LABELS,
  STARTUP_EXIT_FILTER_IDS,
  STARTUP_EXIT_FILTER_LABELS,
  STARTUP_SORT_IDS,
  applyStartupDirectoryQuery,
  buildStartupDirectoryPath,
  paginateStartupCards,
  parseStartupDirectoryQuery,
  startupDirectoryFilterOptions,
  startupMapPins,
  type StartupCategoryId,
  type StartupDirectoryQuery,
  type StartupExitFilter,
  type StartupHiringFilter,
  type StartupLocale,
  type StartupPublicCard,
  type StartupSort,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

export function StartupsDirectory({
  companies,
  isModerator,
  locale,
  initialQuery,
}: {
  companies: StartupPublicCard[];
  isModerator: boolean;
  locale: StartupLocale;
  initialQuery: StartupDirectoryQuery;
}) {
  const t = useTranslations("investigationsStartups");
  const router = useRouter();
  const pathname = usePathname();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [editing, setEditing] = useState<StartupPublicCard | null>(null);
  const [query, setQuery] = useState(() =>
    parseStartupDirectoryQuery(initialQuery),
  );

  useEffect(() => {
    setQuery((current) =>
      current.page === initialQuery.page
        ? current
        : { ...current, page: initialQuery.page },
    );
  }, [initialQuery.page]);

  const filtered = useMemo(
    () => applyStartupDirectoryQuery(companies, query, locale),
    [companies, query, locale],
  );
  const pagination = useMemo(
    () => paginateStartupCards(filtered, query.page),
    [filtered, query.page],
  );
  const pins = useMemo(() => startupMapPins(filtered), [filtered]);
  const filterOptions = useMemo(
    () => startupDirectoryFilterOptions(companies),
    [companies],
  );
  const regionOptions = useMemo(() => {
    const current =
      query.region && query.region !== "all" ? query.region : null;
    if (current && !filterOptions.regions.includes(current)) {
      return [current, ...filterOptions.regions];
    }
    return filterOptions.regions;
  }, [filterOptions.regions, query.region]);
  const stageOptions = useMemo(() => {
    const current = query.stage && query.stage !== "all" ? query.stage : null;
    if (current && !filterOptions.stages.includes(current)) {
      return [current, ...filterOptions.stages];
    }
    return filterOptions.stages;
  }, [filterOptions.stages, query.stage]);

  function replaceQuery(next: Partial<StartupDirectoryQuery>) {
    const filterChanged =
      next.q !== undefined ||
      next.category !== undefined ||
      next.region !== undefined ||
      next.stage !== undefined ||
      next.status !== undefined ||
      next.hiring !== undefined ||
      next.sort !== undefined;
    const merged = parseStartupDirectoryQuery({
      ...query,
      ...next,
      page: next.page ?? (filterChanged ? 1 : query.page),
    });
    setQuery(merged);
    const path = buildStartupDirectoryPath(merged);
    const qs = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const emptyCatalog = companies.length === 0;
  const emptyFiltered = pagination.items.length === 0;
  const activeFilters = [
    query.category !== "all",
    Boolean(query.region && query.region !== "all"),
    Boolean(query.stage && query.stage !== "all"),
    Boolean(query.status && query.status !== "all"),
    query.hiring === "hiring",
  ].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilters > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="startup-search" className="sr-only">
              {t("searchPlaceholder")}
            </Label>
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id="startup-search"
              type="search"
              value={query.q}
              placeholder={t("searchPlaceholder")}
              onChange={(event) => replaceQuery({ q: event.target.value })}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="md:hidden"
              aria-expanded={filtersOpen}
              aria-controls="startup-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden="true" />
              {t("filtersToggle")}
              {activeFilters > 0 ? (
                <span className="bg-foreground text-background rounded-full px-1.5 font-mono text-xs tabular-nums">
                  {activeFilters}
                </span>
              ) : null}
            </Button>
            <Label htmlFor="startup-sort" className="sr-only">
              {t("sortNewest")}
            </Label>
            <Select
              value={query.sort ?? "newest"}
              onValueChange={(value) =>
                replaceQuery({ sort: value as StartupSort })
              }
            >
              <SelectTrigger
                id="startup-sort"
                className="min-w-0 flex-1 sm:w-40 sm:flex-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STARTUP_SORT_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id === "newest"
                        ? t("sortNewest")
                        : id === "name"
                          ? t("sortName")
                          : t("sortCategory")}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <StartupsMapSheet
              pins={pins}
              copy={{
                openMap: t("openMap"),
                title: t("mapTitle"),
                close: t("mapClose"),
                empty: t("mapEmpty"),
              }}
            />
            {isModerator ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setSubmitOpen(true);
                }}
              >
                {t("addCompany")}
              </Button>
            ) : null}
          </div>
        </div>
        <div
          id="startup-filters"
          className={cn(
            "grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5",
            !filtersOpen && "max-md:hidden",
          )}
        >
          <FilterSelect
            id="startup-filter"
            label={t("filterLabel")}
            allLabel={t("filterLabel")}
            value={query.category}
            options={STARTUP_CATEGORY_IDS.map((id) => ({
              value: id,
              label: STARTUP_CATEGORY_LABELS[id][locale],
            }))}
            onChange={(value) =>
              replaceQuery({ category: value as StartupCategoryId | "all" })
            }
          />
          <FilterSelect
            id="startup-region"
            label={t("filterRegion")}
            allLabel={t("filterRegion")}
            value={query.region ?? "all"}
            options={regionOptions.map((region) => ({
              value: region,
              label: region,
            }))}
            onChange={(value) => replaceQuery({ region: value })}
          />
          <FilterSelect
            id="startup-stage"
            label={t("filterStage")}
            allLabel={t("filterStage")}
            value={query.stage ?? "all"}
            options={stageOptions.map((stage) => ({
              value: stage,
              label: stage,
            }))}
            onChange={(value) => replaceQuery({ stage: value })}
          />
          <FilterSelect
            id="startup-status"
            label={t("filterExit")}
            allLabel={t("filterExitAll")}
            value={query.status ?? "all"}
            options={STARTUP_EXIT_FILTER_IDS.map((id) => ({
              value: id,
              label: STARTUP_EXIT_FILTER_LABELS[id][locale],
            }))}
            onChange={(value) =>
              replaceQuery({ status: value as StartupExitFilter | "all" })
            }
          />
          <FilterSelect
            id="startup-hiring"
            label={t("filterHiring")}
            allLabel={t("filterHiringAll")}
            value={query.hiring ?? "all"}
            options={[{ value: "hiring", label: t("filterHiringOpen") }]}
            onChange={(value) =>
              replaceQuery({ hiring: value as StartupHiringFilter })
            }
          />
        </div>
      </div>

      <div
        data-startup-results=""
        className="-mb-2 flex min-h-9 items-center justify-between gap-4"
      >
        <p
          aria-live="polite"
          className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase tabular-nums"
        >
          {t("resultsCount", { count: filtered.length })}
        </p>
        {activeFilters > 0 || query.q ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              replaceQuery({
                q: "",
                category: "all",
                region: "all",
                stage: "all",
                status: "all",
                hiring: "all",
              })
            }
          >
            <X aria-hidden="true" />
            {t("clearFilters")}
          </Button>
        ) : null}
      </div>

      {emptyFiltered ? (
        <EmptyState
          title={emptyCatalog ? t("empty") : t("emptyFiltered")}
          description={emptyCatalog ? t("emptyHelp") : undefined}
        />
      ) : (
        <StartupsDirectoryTable
          companies={pagination.items}
          locale={locale}
          isModerator={isModerator}
          copy={{
            companyColumn: t("companyColumn"),
            categoryColumn: t("categoryColumn"),
            regionColumn: t("regionColumn"),
            statusColumn: t("statusColumn"),
            sourcesColumn: t("sourcesColumn"),
            linksColumn: t("linksColumn"),
            foundersColumn: t("foundersColumn"),
            // The table fills {count} per row, so it needs the raw message.
            openRoles: t.raw("openRoles") as string,
            openHomepage: t("openHomepage"),
            edit: t("edit"),
            caption: t("tabDirectory"),
          }}
          onEdit={(next) => {
            setEditing(next);
            setSubmitOpen(true);
          }}
        />
      )}

      <StartupsPagination
        query={{ ...query, page: pagination.page }}
        totalPages={pagination.totalPages}
        prevLabel={t("paginationPrev")}
        nextLabel={t("paginationNext")}
        navLabel={t("paginationLabel")}
      />

      {isModerator ? (
        <StartupsSubmitDialog
          open={submitOpen}
          onOpenChange={(open) => {
            setSubmitOpen(open);
            if (!open) setEditing(null);
          }}
          locale={locale}
          editing={editing}
          copy={{
            title: t("submitTitle"),
            editTitle: t("editTitle"),
            help: t("submitHelp"),
            fieldName: t("fieldName"),
            fieldHomepage: t("fieldHomepage"),
            fieldCategory: t("fieldCategory"),
            fieldSources: t("fieldSources"),
            fieldSourcesHint: t("fieldSourcesHint"),
            fieldRegion: t("fieldRegion"),
            fieldLat: t("fieldLat"),
            fieldLng: t("fieldLng"),
            fieldStage: t("fieldStage"),
            fieldDescription: t("fieldDescription"),
            fieldLogo: t("fieldLogo"),
            fieldFounders: t("fieldFounders"),
            fieldFoundersHint: t("fieldFoundersHint"),
            fieldExit: t("fieldExit"),
            fieldExitNone: t("fieldExitNone"),
            fieldAcquirer: t("fieldAcquirer"),
            fieldExitOn: t("fieldExitOn"),
            fieldJobs: t("fieldJobs"),
            submit: t("submit"),
            save: t("save"),
            cancel: t("cancel"),
            success: t("submitSuccess"),
            updateSuccess: t("updateSuccess"),
          }}
        />
      ) : null}
    </div>
  );
}

/** A labelled filter menu whose first item resets it to "all". */
function FilterSelect({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
