"use client";

import * as React from "react";
import { ListIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { useRunNamer } from "@/components/collectors/use-run-namer";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import {
  presentRun,
  runListPollInterval,
} from "@/lib/collectors/run-presentation";
import type { RunName } from "@/lib/collectors/run-name";
import { api, type RouterOutputs } from "@/trpc/react";

const PAGE = 20;
type Run = RouterOutputs["collectors"]["runs"]["runs"][number];
const COLUMNS = [
  "collector",
  "started",
  "status",
  "rows",
  "why",
  "deleted",
] as const;

/**
 * My runs. The first page and every "older runs" page are separate queries
 * keyed by cursor, so loaded pages stay on screen and stay cached.
 */
export function RunHistory() {
  const t = useTranslations("collectors");
  const nameOf = useRunNamer();
  const first = api.collectors.runs.useQuery(
    { limit: PAGE },
    {
      refetchInterval: (query) => runListPollInterval(query.state.data?.runs),
    },
  );
  // Cursors of the older pages loaded so far, oldest last.
  const [cursors, setCursors] = React.useState<string[]>([]);
  // The last loaded page's next cursor; undefined while that page loads.
  const [tailNext, setTailNext] = React.useState<string | null | undefined>(
    undefined,
  );
  // Older pages are cut relative to the first page. When a new run lands on
  // top, the first page shifts and a run could fall between it and the
  // loaded older pages, so paging starts again from the new first page.
  const newestId = first.data?.runs[0]?.id;
  const [pagedFrom, setPagedFrom] = React.useState(newestId);
  if (newestId !== pagedFrom) {
    setPagedFrom(newestId);
    setCursors([]);
    setTailNext(undefined);
  }
  const ignore = React.useCallback(() => undefined, []);
  const nextCursor = cursors.length ? tailNext : first.data?.nextCursor;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("history.title")}
        </h2>
        <span className="text-muted-foreground text-xs">
          {t("history.retention")}
        </span>
      </div>
      <SectionBody
        status={statusFromQueries(first, {
          isEmpty: first.data?.runs.length === 0,
        })}
        empty={
          <EmptyState
            icon={<ListIcon aria-hidden="true" />}
            title={t("history.emptyTitle")}
            description={t("history.emptyText")}
            action={
              // The screen's one orange action (DESIGN.md One Voice Rule).
              <Button asChild>
                <Link href="/dashboard/collectors">
                  {t("history.chooseCollector")}
                </Link>
              </Button>
            }
          />
        }
      >
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr>
                {COLUMNS.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="text-muted-foreground border-border border-b px-3 py-2.5 text-left font-mono text-xs font-medium whitespace-nowrap"
                  >
                    {t(`history.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <HistoryRows runs={first.data?.runs ?? []} nameOf={nameOf} />
              {cursors.map((cursor, i) => (
                <HistoryPage
                  key={cursor}
                  cursor={cursor}
                  nameOf={nameOf}
                  onNext={i === cursors.length - 1 ? setTailNext : ignore}
                />
              ))}
            </tbody>
          </table>
        </div>
        {typeof nextCursor === "string" ? (
          <div className="flex justify-end pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCursors((s) => [...s, nextCursor]);
                setTailNext(undefined);
              }}
            >
              {t("history.older")}
            </Button>
          </div>
        ) : null}
      </SectionBody>
    </div>
  );
}

/** One "older runs" page: its own query, with its own loading and error row. */
function HistoryPage({
  cursor,
  nameOf,
  onNext,
}: {
  cursor: string;
  nameOf: (run: Run) => RunName;
  onNext: (next: string | null) => void;
}) {
  const page = api.collectors.runs.useQuery({ limit: PAGE, cursor });
  const next = page.data?.nextCursor;
  React.useEffect(() => {
    if (next !== undefined) onNext(next);
  }, [next, onNext]);

  const status = statusFromQueries(page);
  if (status.kind !== "ready") {
    return (
      <tr>
        <td colSpan={COLUMNS.length} className="border-border border-b p-3">
          <SectionBody status={status} size="compact">
            {null}
          </SectionBody>
        </td>
      </tr>
    );
  }
  return <HistoryRows runs={page.data?.runs ?? []} nameOf={nameOf} />;
}

function HistoryRows({
  runs,
  nameOf,
}: {
  runs: readonly Run[];
  nameOf: (run: Run) => RunName;
}) {
  const t = useTranslations("collectors");
  return (
    <>
      {runs.map((run) => {
        const view = presentRun(run);
        const name = nameOf(run);
        return (
          <tr key={run.id}>
            <td className="border-border border-b px-3 py-2.5 align-middle">
              <Link
                href={`/dashboard/collectors/runs/${run.id}`}
                className="font-medium hover:underline"
              >
                {name.title}
              </Link>
              {name.detail ? (
                <div className="text-muted-foreground mt-0.5 font-mono text-xs break-all">
                  {name.detail}
                </div>
              ) : null}
            </td>
            <td className="border-border text-muted-foreground border-b px-3 py-2.5 font-mono text-xs whitespace-nowrap">
              <RelativeTime date={run.createdAt} />
            </td>
            <td className="border-border border-b px-3 py-2.5">
              <RunStatusBadge status={run.status} stopReason={run.stopReason} />
            </td>
            <td className="border-border border-b px-3 py-2.5 font-mono text-xs">
              {run.itemCount}
            </td>
            <td className="border-border text-muted-foreground border-b px-3 py-2.5">
              {view.stop ? t(`stopShort.${view.stop}`) : "—"}
            </td>
            <td className="border-border text-muted-foreground border-b px-3 py-2.5 font-mono text-xs whitespace-nowrap">
              <RelativeTime date={run.expiresAt} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
