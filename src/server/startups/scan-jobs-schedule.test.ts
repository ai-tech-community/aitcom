import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type { JobFetchResult } from "@/server/startups/scan-jobs";
import {
  STARTUP_JOBS_ATS_HOST_LIMIT,
  STARTUP_JOBS_BACKOFF_AFTER,
  STARTUP_JOBS_BACKOFF_CAP_DAYS,
  STARTUP_JOBS_DEADLINE_MARGIN_MS,
  STARTUP_JOBS_SCAN_CONCURRENCY,
  compareStartupJobsScanOrder,
  createStartupJobsFetchGate,
  mapUntilDeadline,
  nextStartupJobsStreak,
  orderStartupJobsScanTargets,
  startupJobsAtsHostKey,
  startupJobsBackoffDelayMs,
  startupJobsScanDue,
  startupJobsScanRunSummary,
  type StartupJobsScanTarget,
} from "@/server/startups/scan-jobs-schedule";

const DAY_MS = 24 * 60 * 60 * 1000;

const ok: JobFetchResult = {
  ok: true,
  status: 200,
  text: "ok",
  contentType: "text/html",
};

function target(
  partial: Partial<StartupJobsScanTarget> & { id: string },
): StartupJobsScanTarget & { id: string } {
  return {
    id: partial.id,
    jobsScannedAt: partial.jobsScannedAt ?? null,
    openRoleCount: partial.openRoleCount ?? 0,
    jobsUrl: partial.jobsUrl ?? "https://acme.example/careers",
    listedOn: partial.listedOn ?? "2024-01-01",
    emptyStreak: partial.emptyStreak ?? 0,
    failStreak: partial.failStreak ?? 0,
  };
}

describe("startup jobs scan order", () => {
  it("keeps unscanned companies ahead of every scanned company", () => {
    const rows = [
      target({
        id: "never",
        jobsScannedAt: new Date("2020-01-01T00:00:00.000Z"),
        listedOn: "2019-01-01",
      }),
      target({
        id: "fresh",
        jobsScannedAt: null,
        listedOn: "2025-06-01",
      }),
      target({
        id: "hiring",
        jobsScannedAt: new Date("2026-01-01T00:00:00.000Z"),
        openRoleCount: 4,
      }),
    ];
    expect(orderStartupJobsScanTargets(rows, 0).map((row) => row.id)).toEqual([
      "fresh",
      "hiring",
      "never",
    ]);
  });

  it("puts open roles and known ATS boards ahead of never-hiring companies", () => {
    const rows = [
      target({
        id: "never-oldest",
        jobsScannedAt: new Date("2020-01-01T00:00:00.000Z"),
        jobsUrl: "https://acme.example/careers",
      }),
      target({
        id: "ats-empty",
        jobsScannedAt: new Date("2025-06-01T00:00:00.000Z"),
        jobsUrl: "https://jobs.ashbyhq.com/acme",
      }),
      target({
        id: "yc",
        jobsScannedAt: new Date("2025-07-01T00:00:00.000Z"),
        jobsUrl: "https://www.ycombinator.com/companies/acme/jobs",
      }),
      target({
        id: "recruitee",
        jobsScannedAt: new Date("2025-08-01T00:00:00.000Z"),
        jobsUrl: "https://acme.recruitee.com/o/engineer",
      }),
      target({
        id: "open-html",
        jobsScannedAt: new Date("2025-09-01T00:00:00.000Z"),
        openRoleCount: 2,
        jobsUrl: "https://acme.example/careers",
      }),
    ];
    const ids = orderStartupJobsScanTargets(rows, 0).map((row) => row.id);
    expect(new Set(ids.slice(0, -1))).toEqual(
      new Set(["ats-empty", "yc", "recruitee", "open-html"]),
    );
    expect(ids.at(-1)).toBe("never-oldest");
  });

  it("scans the oldest company first inside one tier", () => {
    const rows = [
      target({
        id: "newer",
        jobsScannedAt: new Date("2026-03-01T00:00:00.000Z"),
        openRoleCount: 1,
        listedOn: "2020-01-01",
      }),
      target({
        id: "older",
        jobsScannedAt: new Date("2026-01-01T00:00:00.000Z"),
        openRoleCount: 9,
        listedOn: "2024-01-01",
      }),
    ];
    expect(
      rows
        .slice()
        .sort(compareStartupJobsScanOrder)
        .map((row) => row.id),
    ).toEqual(["older", "newer"]);
  });

  it("breaks a scanned-at tie with listed date", () => {
    const scannedAt = new Date("2026-01-01T00:00:00.000Z");
    const rows = [
      target({
        id: "later",
        jobsScannedAt: scannedAt,
        openRoleCount: 1,
        listedOn: "2024-05-01",
      }),
      target({
        id: "earlier",
        jobsScannedAt: scannedAt,
        openRoleCount: 1,
        listedOn: "2024-01-01",
      }),
    ];
    expect(orderStartupJobsScanTargets(rows, 0).map((row) => row.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});

describe("startup jobs scan backoff", () => {
  it("waits only after several empty or failed scans, and caps the wait", () => {
    expect(STARTUP_JOBS_BACKOFF_AFTER).toBe(3);
    expect(STARTUP_JOBS_BACKOFF_CAP_DAYS).toBe(7);
    expect(startupJobsBackoffDelayMs(0)).toBe(0);
    expect(startupJobsBackoffDelayMs(1)).toBe(0);
    expect(startupJobsBackoffDelayMs(2)).toBe(0);
    expect(startupJobsBackoffDelayMs(3)).toBe(2 * DAY_MS);
    expect(startupJobsBackoffDelayMs(4)).toBe(4 * DAY_MS);
    expect(startupJobsBackoffDelayMs(5)).toBe(7 * DAY_MS);
    expect(startupJobsBackoffDelayMs(12)).toBe(7 * DAY_MS);
  });

  it("leaves a company due until the backoff has elapsed, then brings it back", () => {
    const scannedAt = new Date("2026-01-01T00:00:00.000Z");
    const due = (now: number, emptyStreak: number, failStreak = 0) =>
      startupJobsScanDue({
        jobsScannedAt: scannedAt,
        emptyStreak,
        failStreak,
        now,
      });
    expect(due(scannedAt.getTime() + DAY_MS, 2)).toBe(true);
    expect(due(scannedAt.getTime() + DAY_MS, 3)).toBe(false);
    expect(due(scannedAt.getTime() + 2 * DAY_MS, 3)).toBe(true);
    expect(due(scannedAt.getTime() + 6 * DAY_MS, 9)).toBe(false);
    expect(due(scannedAt.getTime() + 7 * DAY_MS, 9)).toBe(true);
    expect(due(scannedAt.getTime(), 4, 0)).toBe(false);
    expect(due(scannedAt.getTime() + DAY_MS, 0, 3)).toBe(false);
  });

  it("does not drop an unscanned company because of a streak", () => {
    expect(
      startupJobsScanDue({
        jobsScannedAt: null,
        emptyStreak: 9,
        failStreak: 9,
        now: 0,
      }),
    ).toBe(true);
  });

  it("skips companies still inside their backoff when ordering a run", () => {
    const now = new Date("2026-04-10T00:00:00.000Z").getTime();
    const rows = [
      target({
        id: "cooled-empty",
        jobsScannedAt: new Date("2026-04-09T00:00:00.000Z"),
        emptyStreak: 4,
        jobsUrl: "https://idle.example/careers",
      }),
      target({
        id: "due-empty",
        jobsScannedAt: new Date("2026-04-01T00:00:00.000Z"),
        emptyStreak: 6,
        jobsUrl: "https://old.example/careers",
      }),
      target({
        id: "hiring",
        jobsScannedAt: new Date("2026-04-09T00:00:00.000Z"),
        openRoleCount: 3,
      }),
    ];
    expect(orderStartupJobsScanTargets(rows, now).map((row) => row.id)).toEqual(
      ["hiring", "due-empty"],
    );
  });

  it("resets both streaks when a scan finds roles, and counts empties and failures apart", () => {
    expect(
      nextStartupJobsStreak({
        outcome: "applied",
        foundRoles: true,
        emptyStreak: 4,
        failStreak: 2,
      }),
    ).toEqual({ emptyStreak: 0, failStreak: 0 });
    expect(
      nextStartupJobsStreak({
        outcome: "applied",
        foundRoles: false,
        emptyStreak: 2,
        failStreak: 3,
      }),
    ).toEqual({ emptyStreak: 3, failStreak: 0 });
    expect(
      nextStartupJobsStreak({
        outcome: "unfetched",
        foundRoles: false,
        emptyStreak: 2,
        failStreak: 1,
      }),
    ).toEqual({ emptyStreak: 2, failStreak: 2 });
    expect(
      nextStartupJobsStreak({
        outcome: "held",
        foundRoles: false,
        emptyStreak: 1,
        failStreak: 1,
      }),
    ).toEqual({ emptyStreak: 1, failStreak: 1 });
  });
});

describe("startup jobs fetch pool", () => {
  it("uses eight-wide fetching and a two-request cap on each ATS host", () => {
    expect(STARTUP_JOBS_SCAN_CONCURRENCY).toBe(8);
    expect(STARTUP_JOBS_ATS_HOST_LIMIT).toBe(2);
    expect(STARTUP_JOBS_DEADLINE_MARGIN_MS).toBe(15_000);
  });

  it("names Greenhouse, Lever, Ashby, Workable, Recruitee, and YC as shared hosts", () => {
    expect(
      startupJobsAtsHostKey(
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      ),
    ).toBe("greenhouse");
    expect(startupJobsAtsHostKey("https://job-boards.greenhouse.io/acme")).toBe(
      "greenhouse",
    );
    expect(startupJobsAtsHostKey("https://api.lever.co/v0/postings/acme")).toBe(
      "lever",
    );
    expect(startupJobsAtsHostKey("https://jobs.lever.co/acme")).toBe("lever");
    expect(
      startupJobsAtsHostKey(
        "https://api.ashbyhq.com/posting-api/job-board/acme",
      ),
    ).toBe("ashby");
    expect(startupJobsAtsHostKey("https://jobs.ashbyhq.com/acme")).toBe(
      "ashby",
    );
    expect(startupJobsAtsHostKey("https://apply.workable.com/acme")).toBe(
      "workable",
    );
    expect(startupJobsAtsHostKey("https://acme.recruitee.com/o/engineer")).toBe(
      "recruitee",
    );
    expect(
      startupJobsAtsHostKey("https://www.ycombinator.com/companies/acme/jobs"),
    ).toBe("yc");
    expect(startupJobsAtsHostKey("https://www.workatastartup.com/jobs/1")).toBe(
      "yc",
    );
    expect(startupJobsAtsHostKey("https://acme.example/careers")).toBeNull();
    expect(startupJobsAtsHostKey("https://notgreenhouse.io/jobs")).toBeNull();
    expect(startupJobsAtsHostKey("not a url")).toBeNull();
  });

  it("never runs more fetches than the pool, or more than two against one ATS host", async () => {
    let active = 0;
    let maxActive = 0;
    const hostActive = new Map<string, number>();
    let maxGreenhouse = 0;
    const release: Array<() => void> = [];
    const gate = createStartupJobsFetchGate({
      concurrency: 3,
      hostLimit: 2,
      deadlineAt: 10_000,
      marginMs: 0,
      now: () => 0,
      fetchPage: async (url) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const host = startupJobsAtsHostKey(url) ?? "other";
        const count = (hostActive.get(host) ?? 0) + 1;
        hostActive.set(host, count);
        if (host === "greenhouse")
          maxGreenhouse = Math.max(maxGreenhouse, count);
        await new Promise<void>((resolve) => release.push(resolve));
        hostActive.set(host, (hostActive.get(host) ?? 1) - 1);
        active -= 1;
        return ok;
      },
    });

    const urls = [
      "https://boards-api.greenhouse.io/a",
      "https://boards-api.greenhouse.io/b",
      "https://boards-api.greenhouse.io/c",
      "https://api.ashbyhq.com/d",
      "https://careers.example/e",
    ];
    const pending = Promise.all(urls.map((url) => gate(url)));
    await vi.waitFor(() => expect(release.length).toBe(3));
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxGreenhouse).toBeLessThanOrEqual(2);
    expect(hostActive.get("greenhouse")).toBeLessThanOrEqual(2);

    for (const url of urls) {
      await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
      release.shift()?.();
      expect(url).toContain("https://");
    }
    await pending;
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxGreenhouse).toBeLessThanOrEqual(2);
  });

  it("lets another host start while an ATS host is at its cap", async () => {
    const started: string[] = [];
    const release: Array<() => void> = [];
    const gate = createStartupJobsFetchGate({
      concurrency: 4,
      hostLimit: 2,
      deadlineAt: 10_000,
      marginMs: 0,
      now: () => 0,
      fetchPage: async (url) => {
        started.push(startupJobsAtsHostKey(url) ?? "other");
        await new Promise<void>((resolve) => release.push(resolve));
        return ok;
      },
    });
    const pending = [
      gate("https://boards-api.greenhouse.io/a"),
      gate("https://boards-api.greenhouse.io/b"),
      gate("https://boards-api.greenhouse.io/c"),
      gate("https://api.ashbyhq.com/d"),
    ];
    await vi.waitFor(() => expect(started.length).toBe(3));
    expect(started.filter((host) => host === "greenhouse")).toHaveLength(2);
    expect(started).toContain("ashby");
    for (const request of pending) {
      await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
      release.shift()?.();
      expect(request).toBeInstanceOf(Promise);
    }
    await Promise.all(pending);
  });
});

describe("startup jobs scan deadline", () => {
  it("does not start a fetch once the run is inside the deadline margin", async () => {
    const calls: string[] = [];
    let now = 0;
    const gate = createStartupJobsFetchGate({
      concurrency: 4,
      hostLimit: 2,
      deadlineAt: 1_000,
      marginMs: 200,
      now: () => now,
      fetchPage: async (url) => {
        calls.push(url);
        return ok;
      },
    });
    now = 799;
    await expect(gate("https://acme.example/a")).resolves.toEqual(ok);
    now = 800;
    await expect(gate("https://acme.example/b")).resolves.toEqual({
      ok: false,
      status: 0,
      text: "",
      contentType: "",
    });
    expect(calls).toEqual(["https://acme.example/a"]);
  });

  it("drops a fetch that was only waiting for a slot when the deadline arrives", async () => {
    const calls: string[] = [];
    let now = 0;
    let releaseFirst: (() => void) | undefined;
    const gate = createStartupJobsFetchGate({
      concurrency: 1,
      hostLimit: 2,
      deadlineAt: 100,
      marginMs: 20,
      now: () => now,
      fetchPage: async (url) => {
        calls.push(url);
        if (url.endsWith("/a")) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return ok;
      },
    });
    const first = gate("https://example.com/a");
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    const second = gate("https://example.com/b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    now = 80;
    releaseFirst?.();
    await expect(second).resolves.toMatchObject({ ok: false, status: 0 });
    expect(calls).toEqual(["https://example.com/a"]);
    await first;
  });

  it("finishes companies already started and does not start another after the deadline", async () => {
    let allow = true;
    const started: string[] = [];
    const release = new Map<string, () => void>();
    const done = mapUntilDeadline(["a", "b", "c", "d"], {
      concurrency: 2,
      shouldStart: () => allow,
      worker: (id) =>
        new Promise<void>((resolve) => {
          started.push(id);
          release.set(id, resolve);
        }),
    });
    await vi.waitFor(() => expect(started).toEqual(["a", "b"]));
    allow = false;
    release.get("a")?.();
    await vi.waitFor(() => expect(release.has("a")).toBe(true));
    expect(started).toEqual(["a", "b"]);
    release.get("b")?.();
    await done;
    expect(started).toEqual(["a", "b"]);
  });
});

describe("startup jobs scan summary", () => {
  it("reports companies scanned, roles opened and closed, and time spent", () => {
    expect(
      startupJobsScanRunSummary({
        scanned: 12,
        opened: 3,
        closed: 1,
        elapsedMs: 240_000,
      }),
    ).toEqual({ scanned: 12, opened: 3, closed: 1, elapsedMs: 240_000 });
  });

  it("adds the streak columns with idempotent DDL", () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../migrations/20261008c_startup_jobs_scan_streak.ts",
      ),
      "utf8",
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "jobs_empty_streak"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "jobs_fail_streak"');
  });
});
