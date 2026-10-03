/**
 * Collector run lifecycle (spec: "Run lifecycle"). Four states and few
 * transitions, so a table and one guard — the State pattern would be
 * overkill here. `running → running` is a re-claim after an expired lease.
 */
export type RunStatus = "queued" | "running" | "succeeded" | "failed";

/** Why a run ended, shown to the member in plain words. */
export type StopReason =
  | "complete"
  | "page_limit"
  | "item_limit"
  | "time_limit"
  | "site_refused"
  | "robots_disallowed"
  | "robots_unreachable"
  | "blocked_domain"
  | "error"
  | "worker_lost";

const ALLOWED: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running"],
  running: ["running", "succeeded", "failed"],
  succeeded: [],
  failed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal collector run transition ${from} → ${to}`);
  }
}
