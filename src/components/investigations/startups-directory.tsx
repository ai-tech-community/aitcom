"use client";

import { useEffect, useMemo, useState } from "react";
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="startup-search" className="sr-only">
              {t("searchPlaceholder")}
            </Label>
            <Input
              id="startup-search"
              value={query.q}
              placeholder={t("searchPlaceholder")}
              onChange={(event) => replaceQuery({ q: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-sort" className="sr-only">
              {t("sortNewest")}
            </Label>
            <Select
              value={query.sort ?? "newest"}
              onValueChange={(value) =>
                replaceQuery({ sort: value as StartupSort })
              }
            >
              <SelectTrigger id="startup-sort" className="w-full min-w-44">
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
          </div>
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
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-44 flex-1 flex-col gap-2">
            <Label htmlFor="startup-filter" className="sr-only">
              {t("filterLabel")}
            </Label>
            <Select
              value={query.category}
              onValueChange={(value) =>
                replaceQuery({
                  category: value as StartupCategoryId | "all",
                })
              }
            >
              <SelectTrigger id="startup-filter" className="w-full">
                <SelectValue placeholder={t("filterLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("filterLabel")}</SelectItem>
                  {STARTUP_CATEGORY_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {STARTUP_CATEGORY_LABELS[id][locale]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-44 flex-1 flex-col gap-2">
            <Label htmlFor="startup-region" className="sr-only">
              {t("filterRegion")}
            </Label>
            <Select
              value={query.region ?? "all"}
              onValueChange={(value) => replaceQuery({ region: value })}
            >
              <SelectTrigger id="startup-region" className="w-full">
                <SelectValue placeholder={t("filterRegion")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("filterRegion")}</SelectItem>
                  {regionOptions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-44 flex-1 flex-col gap-2">
            <Label htmlFor="startup-stage" className="sr-only">
              {t("filterStage")}
            </Label>
            <Select
              value={query.stage ?? "all"}
              onValueChange={(value) => replaceQuery({ stage: value })}
            >
              <SelectTrigger id="startup-stage" className="w-full">
                <SelectValue placeholder={t("filterStage")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("filterStage")}</SelectItem>
                  {stageOptions.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-44 flex-1 flex-col gap-2">
            <Label htmlFor="startup-status" className="sr-only">
              {t("filterExit")}
            </Label>
            <Select
              value={query.status ?? "all"}
              onValueChange={(value) =>
                replaceQuery({
                  status: value as StartupExitFilter | "all",
                })
              }
            >
              <SelectTrigger id="startup-status" className="w-full">
                <SelectValue placeholder={t("filterExit")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("filterExitAll")}</SelectItem>
                  {STARTUP_EXIT_FILTER_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {STARTUP_EXIT_FILTER_LABELS[id][locale]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-44 flex-1 flex-col gap-2">
            <Label htmlFor="startup-hiring" className="sr-only">
              {t("filterHiring")}
            </Label>
            <Select
              value={query.hiring ?? "all"}
              onValueChange={(value) =>
                replaceQuery({ hiring: value as StartupHiringFilter })
              }
            >
              <SelectTrigger id="startup-hiring" className="w-full">
                <SelectValue placeholder={t("filterHiring")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("filterHiringAll")}</SelectItem>
                  <SelectItem value="hiring">
                    {t("filterHiringOpen")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
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
            nameColumn: t("nameColumn"),
            foundersColumn: t("foundersColumn"),
            homepageColumn: t("homepageColumn"),
            categoryColumn: t("categoryColumn"),
            regionColumn: t("regionColumn"),
            stageColumn: t("stageColumn"),
            exitColumn: t("exitColumn"),
            sourcesColumn: t("sourcesColumn"),
            jobsColumn: t("jobsColumn"),
            openHomepage: t("openHomepage"),
            openJobs: t("openJobs"),
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
