import type { RouterOutputs } from "@/trpc/react";

export type HeatState =
  RouterOutputs["teamWorkspace"]["cells"][number]["heatState"];

export const HEAT_CLASS: Record<HeatState, string> = {
  pending: "bg-muted",
  claimed: "bg-green-200 dark:bg-green-900",
  completed: "bg-green-400 dark:bg-green-700",
  verified: "bg-green-600 dark:bg-green-500",
  failed: "bg-red-300 dark:bg-red-900",
};

export const HEAT_LABEL_KEY: Record<HeatState, string> = {
  pending: "cellPending",
  claimed: "cellClaimed",
  completed: "cellCompleted",
  verified: "cellVerified",
  failed: "cellFailed",
};
