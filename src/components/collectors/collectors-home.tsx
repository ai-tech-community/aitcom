"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { runTarget } from "@/lib/collectors/run-name";
import { runListPollInterval } from "@/lib/collectors/run-presentation";
import { COLLECTOR_ABOUT_PATH } from "@/server/collectors/identity";
import { api, type RouterOutputs } from "@/trpc/react";

type Overview = RouterOutputs["collectors"]["overview"];
type Summary = Overview["collectors"][number];

/**
 * One sample value as text. Sample items are flat scalars by the catalog's
 * contract; anything else is shown as JSON rather than "[object Object]".
 */
function sampleValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Data collectors tab: the catalog and the member's latest runs. */
export function CollectorsHome() {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery(
    { locale },
    {
      refetchInterval: (query) =>
        runListPollInterval(query.state.data?.recentRuns),
    },
  );
  const data = overview.data;
  const hasCollectors = (data?.collectors.length ?? 0) > 0;
  const titles = new Map(data?.collectors.map((c) => [c.id, c.title]));

  return (
    <div className="flex flex-col gap-10">
      <DashboardSection
        title={t("title")}
        status={statusFromQueries(overview, {
          isEmpty: data?.collectors.length === 0,
        })}
        empty={<EmptyState className="py-6" title={t("noCollectors")} />}
        action={
          data ? (
            <span className="text-muted-foreground font-mono text-xs">
              {t("usage", {
                used: data.usage.runsToday,
                limit: data.usage.runsPerDay,
              })}
            </span>
          ) : null
        }
      >
        <p className="max-w-prose text-[15px] leading-relaxed">
          {t("intro")}{" "}
          <Link
            href={COLLECTOR_ABOUT_PATH}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("aboutLink")}
          </Link>
        </p>
        <ul className="border-border mt-4 divide-y rounded-xl border shadow-sm">
          {data?.collectors.map((c) => (
            <CollectorRow key={c.id} collector={c} />
          ))}
        </ul>
      </DashboardSection>

      <DashboardSection
        title={t("recentRuns")}
        // Both sections read the same query: the catalog section above already
        // shows the failure with its retry, so this one stays out of the way.
        optional
        status={statusFromQueries(overview, {
          isEmpty: data?.recentRuns.length === 0,
        })}
        empty={
          <EmptyState
            className="py-6"
            title={t("noRecentRuns")}
            // The hint points at the collectors above; with none, it would
            // point at nothing.
            description={hasCollectors ? t("noRecentRunsHint") : undefined}
          />
        }
        action={
          <Link
            href="/dashboard/collectors/runs"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {t("seeAllRuns")}
          </Link>
        }
      >
        <ul className="divide-border divide-y">
          {data?.recentRuns.map((run) => {
            const target = runTarget(run.input);
            return (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <Link
                  href={`/dashboard/collectors/runs/${run.id}`}
                  className="min-w-0 flex-1 font-medium hover:underline"
                >
                  {titles.get(run.collectorId) ?? run.collectorId}
                  {target ? (
                    <span className="text-muted-foreground font-mono text-xs">
                      {" "}
                      · {target}
                    </span>
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
      </DashboardSection>
    </div>
  );
}

function CollectorRow({ collector }: { collector: Summary }) {
  const t = useTranslations("collectors");
  return (
    <li className="flex flex-wrap items-start gap-6 px-6 py-5">
      <div className="flex min-w-0 flex-1 basis-96 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-base font-semibold">{collector.title}</h3>
          <Badge variant="secondary">{t(`kind.${collector.kind}`)}</Badge>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {collector.description}
        </p>
        <p className="text-muted-foreground text-[13px]">
          <span>
            {t("youGive", {
              fields: collector.fields.map((f) => f.label).join(", "),
            })}
          </span>
          <span aria-hidden="true"> · </span>
          <span>{t("youGet", { count: collector.limits.maxItems })}</span>
        </p>
        <details className="mt-1">
          <summary className="cursor-pointer text-[13px]">
            {t("exampleRow")}
          </summary>
          <dl className="bg-sidebar border-border mt-2 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border p-3 font-mono text-xs">
            {Object.entries(collector.sampleItem).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="m-0 break-words">{sampleValue(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <Button asChild variant="outline">
        <Link href={`/dashboard/collectors/new/${collector.id}`}>
          {t("useCollector")}
        </Link>
      </Button>
    </li>
  );
}
