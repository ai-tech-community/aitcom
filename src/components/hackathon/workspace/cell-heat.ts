import type { RouterOutputs } from "@/trpc/react";

export type HeatState =
  RouterOutputs["teamWorkspace"]["cells"][number]["heatState"];

export const HEAT_CLASS: Record<HeatState, string> = {
  pending: "bg-muted",
  // NOTE: claimed/completed/verified form a deliberate green-intensity ramp
  // (light → mid → dark) that encodes status-as-data-intensity. A single
  // `success` token can't express the three distinct steps without collapsing
  // the distinction, so this ramp is intentionally left on the raw palette
  // pending a design decision on dedicated heatmap tokens (see DESIGN.md).
  claimed: "bg-green-200 dark:bg-green-900",
  completed: "bg-green-400 dark:bg-green-700",
  verified: "bg-green-600 dark:bg-green-500",
  failed: "bg-destructive/30",
};

export const HEAT_LABEL_KEY: Record<HeatState, string> = {
  pending: "cellPending",
  claimed: "cellClaimed",
  completed: "cellCompleted",
  verified: "cellVerified",
  failed: "cellFailed",
};
