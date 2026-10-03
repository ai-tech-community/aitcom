import type { AnyCollector } from "@/server/collectors/collector";
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

/**
 * The sentence (a key in the `collectors` messages) that explains an empty
 * result, per collector kind. A page collector reads the page as the site
 * sends it, so a list the browser builds after loading is invisible to it;
 * members hear that instead of guessing. Generic on purpose: nothing tries
 * to detect such pages.
 */
const EMPTY_RUN_HINTS = {
  page: "run.noRowsHint.page",
} as const satisfies Partial<Record<AnyCollector["kind"], string>>;

type EmptyRunHint = (typeof EMPTY_RUN_HINTS)[keyof typeof EMPTY_RUN_HINTS];

/** The hint under "No rows were collected." for a run that finished empty. */
export function emptyRunHint(
  run: { status: RunStatus; itemCount: number },
  kind: AnyCollector["kind"] | undefined,
): EmptyRunHint | null {
  if (run.status !== "succeeded" || run.itemCount > 0 || kind === undefined) {
    return null;
  }
  return (
    (EMPTY_RUN_HINTS as Partial<Record<string, EmptyRunHint>>)[kind] ?? null
  );
}

export function isRunActive(status: RunStatus): boolean {
  return status === "queued" || status === "running";
}

const RUN_LIST_POLL_MS = 5_000;

/**
 * Lists of runs (the dashboard's recent runs, the history's first page)
 * refresh while any listed run is queued or running, and stop once none is.
 */
export function runListPollInterval(
  runs: readonly { status: RunStatus }[] | undefined,
): number | false {
  return runs?.some((run) => isRunActive(run.status))
    ? RUN_LIST_POLL_MS
    : false;
}
