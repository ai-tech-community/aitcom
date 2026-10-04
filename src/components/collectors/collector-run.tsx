"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { untilNamed, useRunNamer } from "@/components/collectors/use-run-namer";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import {
  emptyRunHint,
  isRunActive,
  presentRun,
} from "@/lib/collectors/run-presentation";
import { FAILURE_CODES, type FailureCode } from "@/server/collectors/errors";
import type { RunStatus } from "@/server/collectors/run-status";
import { api, type RouterOutputs } from "@/trpc/react";

type Run = RouterOutputs["collectors"]["run"];
type Row = RouterOutputs["collectors"]["items"]["items"][number];

export const ITEMS_PAGE = 50;
const POLL_MS = 3_000;
const MAX_RETRIES = 3;

/** Poll while a run is active (or not loaded yet); stop once it ends. */
export function runPollInterval(
  run: { status: RunStatus } | undefined,
): number | false {
  return !run || isRunActive(run.status) ? POLL_MS : false;
}

/**
 * A missing or foreign run will not appear later, so NOT_FOUND ends polling.
 * Any other error may pass (a deploy, a network blip): keep polling.
 */
function isNotFound(error: unknown): boolean {
  return (
    (error as { data?: { code?: string } } | null | undefined)?.data?.code ===
    "NOT_FOUND"
  );
}

const isFailureCode = (code: unknown): code is FailureCode =>
  (FAILURE_CODES as readonly unknown[]).includes(code);

/** Every column any row on the page has, in first-seen order. */
function columnsOf(rows: readonly Row[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number | boolean);
}

/** The one sentence that says where the run stands, in the member's words. */
function useStatusSentence(): (run: Run) => string {
  const t = useTranslations("collectors");
  return (run) => {
    if (run.status === "queued") return t("run.waiting");
    if (run.status === "running") return t("run.collecting");
    const view = presentRun(run);
    return view.stop ? t(`stop.${view.stop}`) : t(`status.${view.label}`);
  };
}

/**
 * Why a failed run failed, translated from its stable code. An unknown code
 * (a newer server) shows nothing extra; the server's English never shows.
 */
function useFailureDetail(): (run: Run) => string | null {
  const t = useTranslations("collectors");
  return (run) => {
    const detail = run.errorDetail;
    if (run.status !== "failed" || !detail || !isFailureCode(detail.code)) {
      return null;
    }
    return t(`failure.${detail.code}`, detail.params ?? {});
  };
}

/** The run page: live status, why it stopped, its rows, downloads and log. */
export function CollectorRun({ runId }: { runId: string }) {
  const t = useTranslations("collectors");
  const statusSentence = useStatusSentence();
  const failureDetail = useFailureDetail();
  const namer = useRunNamer();
  const locale = useLocale() === "nl" ? "nl" : "en";
  const run = api.collectors.run.useQuery(
    { runId },
    {
      // A missing or foreign run will not appear later: do not retry it or
      // poll it. Any other error keeps polling by the last known status.
      retry: (count, error) => !isNotFound(error) && count < MAX_RETRIES,
      refetchInterval: (query) =>
        isNotFound(query.state.error)
          ? false
          : runPollInterval(query.state.data),
    },
  );
  const overview = api.collectors.overview.useQuery({ locale });

  // Seq cursors of the pages visited so far; the last one is on screen.
  const [pageStarts, setPageStarts] = React.useState<number[]>([-1]);
  const afterSeq = pageStarts[pageStarts.length - 1] ?? -1;
  const data = run.data;
  const active = data ? isRunActive(data.status) : true;
  const items = api.collectors.items.useQuery(
    { runId, afterSeq, limit: ITEMS_PAGE },
    {
      enabled: (data?.itemCount ?? 0) > 0,
      refetchInterval: (query) =>
        !isNotFound(query.state.error) && active ? POLL_MS : false,
    },
  );

  // The rows stop polling when the run ends, so the last poll may predate the
  // final rows: fetch them once more on the transition, so the table agrees
  // with the final count and the download.
  // Only a run seen active counts: a first load of an ended run is not a
  // transition.
  const seenActive = data !== undefined && isRunActive(data.status);
  const ended = data !== undefined && !seenActive;
  const hasRows = (data?.itemCount ?? 0) > 0;
  const wasActive = React.useRef(seenActive);
  const refetchItems = items.refetch;
  React.useEffect(() => {
    if (wasActive.current && ended && hasRows) void refetchItems();
    if (seenActive || ended) wasActive.current = seenActive;
  }, [seenActive, ended, hasRows, refetchItems]);

  const runsLink = (
    <Button asChild variant="outline">
      <Link href="/dashboard/collectors/runs">{t("workspace.myRuns")}</Link>
    </Button>
  );

  if (run.isError && isNotFound(run.error)) {
    return <EmptyState title={t("run.notFound")} action={runsLink} />;
  }

  const summary = overview.data?.collectors.find(
    (c) => c.id === data?.collectorId,
  );
  const name = data ? namer.nameOf(data) : null;
  const emptyHint = data ? emptyRunHint(data, summary?.kind) : null;
  const detail = data ? failureDetail(data) : null;
  const rows = items.data?.items ?? [];
  const columns = columnsOf(rows);
  const nextSeq = items.data?.nextSeq ?? null;
  const from = afterSeq + 2;

  return (
    <SectionBody status={untilNamed(statusFromQueries(run), namer)}>
      {data && name ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
                {name.title}
                {/* The space sits outside the span, so the heading's
                    accessible name keeps it ("title · detail"). */}
                {name.detail ? (
                  <>
                    {" "}
                    <span className="text-muted-foreground font-mono text-base font-normal break-all">
                      {"· "}
                      {name.detail}
                    </span>
                  </>
                ) : null}
              </h2>
              <span role="status">
                <RunStatusBadge
                  status={data.status}
                  stopReason={data.stopReason}
                />
              </span>
            </div>
            <p className="text-muted-foreground font-mono text-xs">
              {t("run.started")} <RelativeTime date={data.createdAt} />
              {data.durationMs !== null ? (
                <>
                  {" · "}
                  {t("run.took", {
                    seconds: Math.max(1, Math.round(data.durationMs / 1000)),
                  })}
                </>
              ) : null}
              {" · "}
              {t("run.deleted")} <RelativeTime date={data.expiresAt} />
            </p>
          </div>

          <div className="border-border flex flex-col gap-1.5 rounded-xl border px-5 py-4">
            <p className="text-[15px] font-medium">{statusSentence(data)}</p>
            {detail ? (
              <p data-testid="failure-detail" className="text-sm">
                {detail}
              </p>
            ) : null}
            {active ? (
              <p className="text-muted-foreground text-sm">
                {t("run.collectingHelp")}
              </p>
            ) : null}
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {t("run.counts", {
                rows: data.itemCount,
                pages: data.pagesFetched,
                skipped: data.invalidItemCount,
              })}
            </p>
          </div>

          {data.itemCount > 0 ? (
            <div className="flex flex-col gap-3">
              {/* A file of a half-finished run would mislead: offer the
                  downloads once the run has ended. Two equal peers, so both
                  are ink (DESIGN.md One Voice Rule). */}
              {active ? null : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button asChild variant="ink" size="sm">
                    <a href={`/api/collectors/runs/${runId}/export?format=csv`}>
                      {t("run.downloadCsv")}
                    </a>
                  </Button>
                  <Button asChild variant="ink" size="sm">
                    <a
                      href={`/api/collectors/runs/${runId}/export?format=json`}
                    >
                      {t("run.downloadJson")}
                    </a>
                  </Button>
                </div>
              )}
              <SectionBody status={statusFromQueries(items)}>
                <div className="border-border overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] border-collapse text-[13px]">
                    <caption className="sr-only">{t("run.rows")}</caption>
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th
                            key={c}
                            scope="col"
                            className="text-muted-foreground border-border border-b px-3 py-2.5 text-left font-mono text-xs font-medium whitespace-nowrap"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={afterSeq + 1 + i}>
                          {columns.map((c) => (
                            <td
                              key={c}
                              className="border-border border-b px-3 py-2.5 align-top"
                            >
                              {cellText(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-muted-foreground font-mono text-xs">
                    {t("run.showing", {
                      from,
                      to: from + rows.length - 1,
                      total: data.itemCount,
                    })}
                  </span>
                  <div className="flex gap-2">
                    {pageStarts.length > 1 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageStarts([-1])}
                      >
                        {t("run.firstRows")}
                      </Button>
                    ) : null}
                    {nextSeq !== null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageStarts((s) => [...s, nextSeq])}
                      >
                        {t("run.nextRows")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SectionBody>
            </div>
          ) : active ? (
            <div
              aria-hidden="true"
              className="border-border flex flex-col gap-2.5 rounded-lg border p-4"
            >
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ) : (
            <div className="flex max-w-prose flex-col gap-1.5 text-sm">
              <p className="text-muted-foreground">{t("run.noRows")}</p>
              {emptyHint ? <p>{t(emptyHint)}</p> : null}
            </div>
          )}

          <details className="border-border border-t pt-3">
            <summary className="cursor-pointer text-[13px]">
              {t("run.log")}
            </summary>
            <pre className="bg-sidebar border-border mt-2.5 rounded-lg border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {data.log.length ? data.log.join("\n") : t("run.emptyLog")}
            </pre>
          </details>
        </div>
      ) : null}
    </SectionBody>
  );
}
