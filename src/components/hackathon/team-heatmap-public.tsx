"use client";

import { api } from "@/trpc/react";
import {
  HEAT_CLASS,
  type HeatState,
} from "@/components/hackathon/workspace/cell-heat";

export function TeamHeatmapPublic({ teamId }: { teamId: string }) {
  const { data, isError } = api.hackathon.teamHeatmap.useQuery(
    { teamId },
    { refetchInterval: 5_000 },
  );

  if (isError) return null; // supplementary — may stay absent (No-Silent-Failure)
  if (!data || data.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {data.map((cell, i) => {
        const heatState: HeatState = cell.heatState;
        return (
          <div
            key={i}
            aria-label={heatState}
            className={`h-3 w-3 rounded-sm ${HEAT_CLASS[heatState]}`}
          />
        );
      })}
    </div>
  );
}
