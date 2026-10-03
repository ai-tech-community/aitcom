import type { Redis } from "@upstash/redis";

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** The abort reason as an Error (a caller may abort with any value). */
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Claims a short-lived slot; false while someone else holds it. */
export interface SlotStore {
  trySet(key: string, ttlMs: number): Promise<boolean>;
}

/** Shared across every run and server instance. */
export function redisSlotStore(redis: Redis): SlotStore {
  return {
    async trySet(key, ttlMs) {
      return (await redis.set(key, "1", { nx: true, px: ttlMs })) === "OK";
    },
  };
}

/** Per-instance fallback when Redis is not configured (local development). */
export function memorySlotStore(now: () => number = Date.now): SlotStore {
  const until = new Map<string, number>();
  return {
    async trySet(key, ttlMs) {
      const at = now();
      if ((until.get(key) ?? 0) > at) return false;
      until.set(key, at + ttlMs);
      return true;
    },
  };
}

export interface SiteRateLimiter {
  /** Resolves when this host may receive one more request. */
  acquire(host: string, signal: AbortSignal): Promise<void>;
}

export function createSiteRateLimiter(
  store: SlotStore,
  {
    intervalMs = 1_000,
    pollMs = 250,
    sleep = abortableSleep,
  }: { intervalMs?: number; pollMs?: number; sleep?: Sleep } = {},
): SiteRateLimiter {
  return {
    async acquire(host, signal) {
      const key = `collector:site:${host.toLowerCase()}`;
      for (;;) {
        if (signal.aborted) throw abortError(signal);
        if (await store.trySet(key, intervalMs)) return;
        await sleep(pollMs, signal);
      }
    },
  };
}
