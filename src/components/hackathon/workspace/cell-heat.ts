import type { RouterOutputs } from "@/trpc/react";

export type HeatState =
  RouterOutputs["teamWorkspace"]["cells"][number]["heatState"];

export const HEAT_CLASS: Record<HeatState, string> = {
  pending: "bg-muted",
  // claimed → completed → verified form a contained success-green intensity
  // ramp (light → mid → dark) tokenized as --heat-1/2/3 in globals.css. These
  // are a documented data-viz exception to the Chart-Containment Rule and the
  // only place the heat tokens are used. See DESIGN.md §Colors.
  claimed: "bg-heat-1",
  completed: "bg-heat-2",
  verified: "bg-heat-3",
  failed: "bg-destructive/30",
};

export const HEAT_LABEL_KEY: Record<HeatState, string> = {
  pending: "cellPending",
  claimed: "cellClaimed",
  completed: "cellCompleted",
  verified: "cellVerified",
  failed: "cellFailed",
};
