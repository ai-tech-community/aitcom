"use client";

import * as React from "react";
import { useLocale } from "next-intl";

import { type RunName, runName } from "@/lib/collectors/run-name";
import { api } from "@/trpc/react";

type NamedRun = Parameters<typeof runName>[0];

/**
 * Names runs from the overview's presets and its full title lists (one cached
 * query), so a run whose preset or collector is switched off keeps its name.
 */
export function useRunNamer(): (run: NamedRun) => RunName {
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const presets = overview.data?.presets;
  const titles = overview.data?.titles;
  return React.useMemo(() => {
    const maps = {
      presets: new Map(Object.entries(titles?.presets ?? {})),
      collectors: new Map(Object.entries(titles?.collectors ?? {})),
    };
    return (run: NamedRun) => runName(run, presets ?? [], maps);
  }, [presets, titles]);
}
