"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import type { SectionStatus } from "@/components/dashboard/dashboard-section";
import {
  type CatalogTitleMaps,
  type RunName,
  runName,
} from "@/lib/collectors/run-name";
import { api } from "@/trpc/react";

type NamedRun = Parameters<typeof runName>[0];

export type RunNamer = {
  /**
   * False until the names have loaded (or failed to): a screen shows no run
   * name before then, so a name never flashes by as a raw id.
   */
  ready: boolean;
  nameOf: (run: NamedRun) => RunName;
};

const NO_TITLES: CatalogTitleMaps = {
  presets: new Map(),
  collectors: new Map(),
};

/**
 * Names runs from the overview's presets and its full title lists (one cached
 * query), so a run whose preset or collector is switched off keeps its name.
 * If the overview fails, every run gets the neutral "Collection" label plus
 * its first address.
 */
export function useRunNamer(): RunNamer {
  const t = useTranslations("collectors.run");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const presets = overview.data?.presets;
  const titles = overview.data?.titles;
  const ready = overview.data !== undefined || overview.isError;
  const fallbackTitle = t("fallbackTitle");
  const nameOf = React.useMemo(() => {
    const maps: CatalogTitleMaps = titles
      ? {
          presets: new Map(Object.entries(titles.presets)),
          collectors: new Map(Object.entries(titles.collectors)),
        }
      : NO_TITLES;
    return (run: NamedRun) => runName(run, presets ?? [], maps, fallbackTitle);
  }, [presets, titles, fallbackTitle]);
  return { ready, nameOf };
}

/**
 * A section that shows run names stays loading until the names are ready;
 * every other state (error, empty) passes through.
 */
export function untilNamed(
  status: SectionStatus,
  namer: Pick<RunNamer, "ready">,
): SectionStatus {
  return status.kind === "ready" && !namer.ready ? { kind: "loading" } : status;
}
