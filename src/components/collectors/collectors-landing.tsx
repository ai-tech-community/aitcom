"use client";

import { useLocale, useTranslations } from "next-intl";

import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { untilNamed, useRunNamer } from "@/components/collectors/use-run-namer";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { runListPollInterval } from "@/lib/collectors/run-presentation";
import { api } from "@/trpc/react";

/**
 * `/dashboard/collectors` with no preset open: one line that says how to
 * start (pick a site in the rail, or paste a link there) and the member's
 * last runs. No runs → only the line; the runs are supplementary, so a
 * failed load hides them, and they appear only once loaded (no skeleton
 * flash for a member who has none).
 */
export function CollectorsLanding() {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery(
    { locale },
    {
      refetchInterval: (query) =>
        runListPollInterval(query.state.data?.recentRuns),
    },
  );
  const namer = useRunNamer();
  const runs = overview.data?.recentRuns ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight text-balance">
        {t("workspace.landing")}
      </h2>
      <SectionBody
        status={untilNamed(
          statusFromQueries(overview, { isEmpty: runs.length === 0 }),
          namer,
        )}
        optional
        appearWhenReady
      >
        <ul
          aria-label={t("workspace.latestRuns")}
          className="divide-border border-border divide-y border-y"
        >
          {runs.map((run) => {
            const name = namer.nameOf(run);
            return (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <Link
                  href={`/dashboard/collectors/runs/${run.id}`}
                  className="min-w-0 flex-1 font-medium hover:underline"
                >
                  {name.title}
                  {name.detail ? (
                    <>
                      {/* Outside the span, so the link's accessible name
                          keeps the space before the dot. */}{" "}
                      <span className="text-muted-foreground font-mono text-xs">
                        · {name.detail}
                      </span>
                    </>
                  ) : null}
                </Link>
                <RunStatusBadge
                  status={run.status}
                  stopReason={run.stopReason}
                />
                <RelativeTime
                  date={run.createdAt}
                  className="text-muted-foreground w-28 text-right font-mono text-xs"
                />
              </li>
            );
          })}
        </ul>
      </SectionBody>
    </div>
  );
}
