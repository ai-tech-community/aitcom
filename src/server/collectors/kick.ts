import { after } from "next/server";

import { env } from "@/env";

function workerUrl(): string | null {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : env.NEXT_PUBLIC_APP_URL;
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
  const url = workerUrl();
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
