import { after } from "next/server";

import { env } from "@/env";
import { collectorsEnabled } from "./flags";

export type WorkerUrlEnv = {
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

/**
 * Where to wake the worker. In production, the stable production domain
 * rather than one deployment's URL; elsewhere, this deployment; off Vercel,
 * the app URL; otherwise nowhere.
 */
export function workerUrl(e: WorkerUrlEnv): string | null {
  let base: string | undefined;
  if (e.VERCEL_ENV === "production" && e.VERCEL_PROJECT_PRODUCTION_URL) {
    base = `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  } else if (e.VERCEL_URL) {
    base = `https://${e.VERCEL_URL}`;
  } else {
    base = e.NEXT_PUBLIC_APP_URL;
  }
  return base ? `${base}/api/cron/collector-worker` : null;
}

/**
 * Wake the worker after the start response. Local development runs the same
 * executor in-process: next dev has no cron scheduler, and a missing or remote
 * app URL must not strand local runs. Deployed apps keep the authenticated
 * HTTP wake-up plus the per-minute cron fallback.
 */
export function kickCollectorWorker(): void {
  if (env.NODE_ENV === "development") {
    after(async () => {
      if (!collectorsEnabled()) return;
      try {
        const { runWorkerTick } = await import("./executor");
        const { liveExecutorDeps } = await import("./live");
        const deps = liveExecutorDeps();
        // A tick stops starting runs after 20 seconds. Without a local cron,
        // keep taking ticks until the backlog is empty or collection is off.
        while (collectorsEnabled()) {
          const { executed } = await runWorkerTick(deps);
          if (executed === 0) break;
        }
      } catch (err) {
        console.error("[collectors] local worker tick failed", err);
      }
    });
    return;
  }

  const secret = process.env.CRON_SECRET;
  const url = workerUrl({
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  });
  if (!secret || !url) {
    console.warn(
      "[collectors] worker wake-up skipped: CRON_SECRET or worker URL is not configured",
    );
    return;
  }
  after(async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) {
        console.warn("[collectors] worker wake-up refused", {
          status: response.status,
        });
      }
    } catch {
      console.warn(
        "[collectors] worker wake-up failed; the cron will retry queued work",
      );
    }
  });
}
