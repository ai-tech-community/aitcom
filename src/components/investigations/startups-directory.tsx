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
import { StartupsCard } from "@/components/investigations/startups-card";
import { StartupsMap } from "@/components/investigations/startups-map";
import { StartupsPagination } from "@/components/investigations/startups-pagination";
import { StartupsSubmitDialog } from "@/components/investigations/startups-submit-dialog";
import {
  STARTUP_CATEGORY_IDS,
  STARTUP_CATEGORY_LABELS,
  applyStartupDirectoryQuery,
  buildStartupDirectoryPath,
  paginateStartupCards,
  parseStartupDirectoryQuery,
  startupMapPins,
  type StartupCategoryId,
  type StartupDirectoryQuery,
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

  function replaceQuery(next: Partial<StartupDirectoryQuery>) {
    const filterChanged =
      next.q !== undefined ||
      next.category !== undefined ||
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
            <SelectTrigger id="startup-filter" className="w-full min-w-56">
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
                <SelectItem value="newest">{t("sortNewest")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
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

      <StartupsMap pins={pins} />

      {emptyFiltered ? (
        <EmptyState
          title={emptyCatalog ? t("empty") : t("emptyFiltered")}
          description={emptyCatalog ? t("emptyHelp") : undefined}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pagination.items.map((card) => (
            <li key={card.id} id={card.id}>
              <StartupsCard
                card={card}
                locale={locale}
                isModerator={isModerator}
                copy={{
                  openHomepage: t("openHomepage"),
                  openJobs: t("openJobs"),
                  sources: t("sources"),
                  founders: t("founders"),
                  edit: t("edit"),
                }}
                onEdit={(next) => {
                  setEditing(next);
                  setSubmitOpen(true);
                }}
              />
            </li>
          ))}
        </ul>
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
