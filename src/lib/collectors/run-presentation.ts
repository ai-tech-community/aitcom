import type { RunStatus, StopReason } from "@/server/collectors/run-status";

export type BadgeTone = "info" | "success" | "warning" | "destructive";
export type RunLabel = "queued" | "running" | "finished" | "partial" | "failed";

const PARTIAL: ReadonlySet<StopReason> = new Set([
  "page_limit",
  "item_limit",
  "time_limit",
]);

/**
 * How a run looks on every screen: badge tone, its label, and which stop
 * sentence explains it. One place, so the list, the run page and the history
 * never disagree. Tones are the semantic status tokens (DESIGN.md).
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
      return stop && PARTIAL.has(stop)
        ? { tone: "warning", label: "partial", stop }
        : { tone: "success", label: "finished", stop };
  }
}

export function isRunActive(status: RunStatus): boolean {
  return status === "queued" || status === "running";
}
