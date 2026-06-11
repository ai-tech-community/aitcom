"use client";

import { useTranslations } from "next-intl";

import type { RouterOutputs } from "@/trpc/react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { CellHeatBox } from "./cell-heat-box";
import { HEAT_CLASS, HEAT_LABEL_KEY, type HeatState } from "./cell-heat";

type Cell = RouterOutputs["teamWorkspace"]["cells"][number];

export function TeamHeatmap({
  teamId,
  onSelectCell,
}: {
  teamId: string;
  onSelectCell: (cellId: string) => void;
}) {
  const t = useTranslations("hackathon");
  // Pre-lock there is no grid yet (rosters not locked → cells throws
  // NOT_FOUND): show the waiting state and stop polling/retrying until the
  // operator locks rosters; any other error keeps the live 5s poll.
  const {
    data: cells,
    isLoading,
    error,
  } = api.teamWorkspace.cells.useQuery(
    { teamId },
    {
      refetchInterval: (query) =>
        query.state.error?.data?.code === "NOT_FOUND" ? false : 5_000,
      refetchOnWindowFocus: (query) =>
        query.state.error?.data?.code !== "NOT_FOUND",
      retry: (failureCount, err) =>
        err.data?.code !== "NOT_FOUND" && failureCount < 3,
    },
  );

  if (error?.data?.code === "NOT_FOUND") {
    return (
      <p className="text-muted-foreground text-sm">{t("workspaceLocked")}</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  if (!cells || cells.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("tasks")}</p>;
  }

  const groups = new Map<string, Cell[]>();
  for (const cell of cells) {
    const group = groups.get(cell.taskType) ?? [];
    group.push(cell);
    groups.set(cell.taskType, group);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([taskType, groupCells]) => (
        <div key={taskType}>
          <h4 className="text-muted-foreground mb-1 font-mono text-xs">
            {taskType}
          </h4>
          <div className="flex flex-wrap gap-1">
            {groupCells.map((cell) => (
              <CellHeatBox
                key={cell.id}
                cell={cell}
                onClick={() => onSelectCell(cell.id)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-3 pt-2">
        {(Object.entries(HEAT_LABEL_KEY) as [HeatState, string][]).map(
          ([state, labelKey]) => (
            <div
              key={state}
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              <span
                className={cn("h-3 w-3 rounded", HEAT_CLASS[state])}
                aria-hidden
              />
              {t(labelKey)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
