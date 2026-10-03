import type { RunStatus, StopReason } from "@/server/collectors/run-status";

export type BadgeTone = "info" | "success" | "warning" | "destructive";
export type RunLabel = "queued" | "running" | "finished" | "partial" | "failed";

/**
 * How a run looks on every screen: badge tone, its label, and which stop
 * sentence explains it. One place, so the list, the run page and the history
 * never disagree. Tones are the semantic status tokens (DESIGN.md).
 *
 * A succeeded run is "finished" only when it read everything ("complete");
 * any other stop reason means it ended early, so it is "partial". A missing
 * reason on a succeeded run (older rows) counts as finished.
 */
export function presentRun(run: {
  status: RunStatus;
  stopReason: StopReason | null;
}): { tone: BadgeTone; label: RunLabel; stop: StopReason | null } {
  const stop = run.stopReason;
  switch (run.status) {
    case "queued":
      return { tone: "info", label: "queued", stop };
    case "running":
      return { tone: "info", label: "running", stop };
    case "failed":
      return { tone: "destructive", label: "failed", stop };
    case "succeeded":
      return stop === null || stop === "complete"
        ? { tone: "success", label: "finished", stop }
        : { tone: "warning", label: "partial", stop };
  }
}

export function isRunActive(status: RunStatus): boolean {
  return status === "queued" || status === "running";
}
