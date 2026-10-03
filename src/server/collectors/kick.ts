import { after } from "next/server";

import { env } from "@/env";

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
 * Wake the worker right after a run is queued, after the response is sent.
 * Best effort: the worker answers 202 at once and works in its own after(),
 * so this short timeout never cuts a run. The per-minute cron is the
 * guarantee (same shape as server/agent/dispatch-immediate.ts).
 */
export function kickCollectorWorker(): void {
  const secret = process.env.CRON_SECRET;
  const url = workerUrl({
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  });
  if (!secret || !url) return;
  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      // The cron picks the run up within a minute.
    }
  });
}
