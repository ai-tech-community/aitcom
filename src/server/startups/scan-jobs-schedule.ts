import type { JobFetch } from "@/server/startups/scan-jobs";

/**
 * Parallel careers fetch for one cron run.
 *
 * The 8 Oct 2026 refresh spent 3,090s fetching 3,756 companies. One 240s
 * sequential pass covers about 290 of them, so a full pass takes about 13
 * days. Replaying those same per-company durations with eight fetches in
 * flight, and at most two at a time to each ATS host, covers about 2,300
 * companies in a run and walks the whole set in about 2.3 days. The host
 * cap is 2 because a concurrency-6 refresh with no cap drew Workable 429s
 * on 81 boards. The per-request timeout stays 12s: that refresh's p99 was
 * 8.4s for companies with roles and 5.2s for the rest, and the samples at
 * 12s are this timeout firing. New fetches stop 15s before the 240s budget
 * so an in-flight 12s request still finishes inside it.
 */
export const STARTUP_JOBS_SCAN_CONCURRENCY = 8;
export const STARTUP_JOBS_ATS_HOST_LIMIT = 2;
export const STARTUP_JOBS_DEADLINE_MARGIN_MS = 15_000;

/** First two empty or failed scans stay on the normal rotation. */
export const STARTUP_JOBS_BACKOFF_AFTER = 3;

/**
 * Longest a repeatedly empty or failing company waits. The cron is daily,
 * so the first backoff is 2 days (a 1-day wait would not skip a run), then
 * 4, then this cap.
 */
export const STARTUP_JOBS_BACKOFF_CAP_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StartupJobsScanOrderRow = {
  jobsScannedAt: Date | null;
  openRoleCount: number;
  jobsUrl: string | null;
  listedOn: string;
};

export type StartupJobsScanTarget = StartupJobsScanOrderRow & {
  emptyStreak: number;
  failStreak: number;
};

/**
 * Raised when a fetch is not started because the cron budget is inside
 * its margin. Callers must not treat this as an empty board or a failed
 * host: no roles are written and the company stays where it was in line.
 */
export class StartupJobsDeadlineError extends Error {
  constructor() {
    super("startup jobs scan deadline");
    this.name = "StartupJobsDeadlineError";
  }
}

function hostIs(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Shared ATS vendor, or null for a company's own careers host. */
export function startupJobsAtsHostKey(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  if (hostIs(hostname, "greenhouse.io")) return "greenhouse";
  if (hostIs(hostname, "lever.co")) return "lever";
  if (hostIs(hostname, "ashbyhq.com")) return "ashby";
  if (hostIs(hostname, "workable.com")) return "workable";
  if (hostIs(hostname, "recruitee.com")) return "recruitee";
  if (hostname === "ycombinator.com" || hostname === "workatastartup.com") {
    return "yc";
  }
  return null;
}

/** 0 unscanned, 1 open roles or a known ATS board, 2 never-hiring. */
export function startupJobsScanTier(row: StartupJobsScanOrderRow): number {
  if (row.jobsScannedAt == null) return 0;
  if (row.openRoleCount > 0 || startupJobsAtsHostKey(row.jobsUrl) != null) {
    return 1;
  }
  return 2;
}

export function compareStartupJobsScanOrder(
  a: StartupJobsScanOrderRow,
  b: StartupJobsScanOrderRow,
): number {
  const tier = startupJobsScanTier(a) - startupJobsScanTier(b);
  if (tier !== 0) return tier;
  const aTime = a.jobsScannedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bTime = b.jobsScannedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  if (a.listedOn < b.listedOn) return -1;
  if (a.listedOn > b.listedOn) return 1;
  return 0;
}

export function startupJobsBackoffDelayMs(streak: number): number {
  if (!Number.isFinite(streak) || streak < STARTUP_JOBS_BACKOFF_AFTER) return 0;
  const stepsPast = streak - STARTUP_JOBS_BACKOFF_AFTER;
  const days = Math.min(2 ** (stepsPast + 1), STARTUP_JOBS_BACKOFF_CAP_DAYS);
  return days * DAY_MS;
}

export function startupJobsScanDue(input: {
  jobsScannedAt: Date | null;
  emptyStreak: number;
  failStreak: number;
  now: number;
}): boolean {
  if (input.jobsScannedAt == null) return true;
  const delay = Math.max(
    startupJobsBackoffDelayMs(input.emptyStreak),
    startupJobsBackoffDelayMs(input.failStreak),
  );
  if (delay === 0) return true;
  return input.now - input.jobsScannedAt.getTime() >= delay;
}

export function orderStartupJobsScanTargets<T extends StartupJobsScanTarget>(
  rows: readonly T[],
  now: number,
): T[] {
  return rows
    .filter((row) =>
      startupJobsScanDue({
        jobsScannedAt: row.jobsScannedAt,
        emptyStreak: row.emptyStreak,
        failStreak: row.failStreak,
        now,
      }),
    )
    .sort(compareStartupJobsScanOrder);
}

export function nextStartupJobsStreak(input: {
  outcome: "applied" | "held" | "unfetched" | "deferred";
  foundRoles: boolean;
  emptyStreak: number;
  failStreak: number;
}): { emptyStreak: number; failStreak: number } {
  if (input.outcome === "held" || input.outcome === "deferred") {
    return { emptyStreak: input.emptyStreak, failStreak: input.failStreak };
  }
  if (input.outcome === "unfetched") {
    return {
      emptyStreak: input.emptyStreak,
      failStreak: input.failStreak + 1,
    };
  }
  if (input.foundRoles) return { emptyStreak: 0, failStreak: 0 };
  return { emptyStreak: input.emptyStreak + 1, failStreak: 0 };
}

type FetchWaiter = {
  host: string | null;
  resolve: () => void;
};

export function createStartupJobsFetchGate(options: {
  concurrency: number;
  hostLimit: number;
  deadlineAt: number;
  marginMs: number;
  now?: () => number;
  fetchPage: JobFetch;
}): JobFetch {
  const now = options.now ?? Date.now;
  let active = 0;
  const hostActive = new Map<string, number>();
  const queue: FetchWaiter[] = [];

  const pastDeadline = () => now() >= options.deadlineAt - options.marginMs;

  const hostInFlight = (host: string | null) =>
    host ? (hostActive.get(host) ?? 0) : 0;

  function pump(): void {
    for (let index = 0; index < queue.length; index += 1) {
      if (active >= options.concurrency) return;
      const waiter = queue[index];
      if (!waiter) continue;
      if (waiter.host && hostInFlight(waiter.host) >= options.hostLimit) {
        continue;
      }
      queue.splice(index, 1);
      index -= 1;
      active += 1;
      if (waiter.host) {
        hostActive.set(waiter.host, hostInFlight(waiter.host) + 1);
      }
      // Resolve after this pump turn so a fetch cannot re-enter pump
      // while the queue is still being walked.
      queueMicrotask(waiter.resolve);
    }
  }

  function release(host: string | null): void {
    active = Math.max(0, active - 1);
    if (host) {
      hostActive.set(host, Math.max(0, hostInFlight(host) - 1));
    }
    pump();
  }

  return async (url: string) => {
    if (pastDeadline()) throw new StartupJobsDeadlineError();
    const host = startupJobsAtsHostKey(url);
    await new Promise<void>((resolve) => {
      queue.push({ host, resolve });
      pump();
    });
    if (pastDeadline()) {
      release(host);
      throw new StartupJobsDeadlineError();
    }
    try {
      return await options.fetchPage(url);
    } finally {
      release(host);
    }
  };
}

/**
 * Run `worker` on items with at most `concurrency` in flight. Once
 * `shouldStart` is false, workers already inside `worker` finish and no
 * further item is taken.
 */
export async function mapUntilDeadline<T>(
  items: readonly T[],
  options: {
    concurrency: number;
    shouldStart: () => boolean;
    worker: (item: T) => Promise<void>;
  },
): Promise<{ started: number }> {
  let index = 0;
  let started = 0;
  const workers = Math.max(0, Math.min(options.concurrency, items.length));

  async function loop(): Promise<void> {
    for (;;) {
      if (!options.shouldStart()) return;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      index += 1;
      started += 1;
      await options.worker(item);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => loop()));
  return { started };
}

export function startupJobsScanRunSummary(input: {
  scanned: number;
  opened: number;
  closed: number;
  elapsedMs: number;
}): {
  scanned: number;
  opened: number;
  closed: number;
  elapsedMs: number;
} {
  return {
    scanned: input.scanned,
    opened: input.opened,
    closed: input.closed,
    elapsedMs: input.elapsedMs,
  };
}
