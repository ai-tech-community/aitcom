import { Redis } from "@upstash/redis";

import { env } from "@/env";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";

import type { AnyCollector, CollectorContext } from "../collector";
import type { CollectorDb } from "../db";
import { loadBlockedDomains } from "./blocklist";
import {
  type ContextMeter,
  type Transport,
  createCollectorContext,
} from "./collector-context";
import {
  type SiteRateLimiter,
  abortableSleep,
  createSiteRateLimiter,
  memorySlotStore,
  redisSlotStore,
} from "./site-rate-limit";

export const COLLECTOR_ROBOTS_TOKEN = "aitcom-collector";
export const COLLECTOR_USER_AGENT = `${COLLECTOR_ROBOTS_TOKEN}/1.0 (+https://aitcommunity.org/collectors/about)`;

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 500 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const ROBOTS_TIMEOUT_MS = 10_000;

const liveTransport: Transport = async (url, { accept, signal }) => {
  const { response, url: answeredUrl } = await safeFetch(url, {
    userAgent: COLLECTOR_USER_AGENT,
    timeoutMs: REQUEST_TIMEOUT_MS,
    accept,
    signal,
    allowErrorStatus: true,
    redirects: "return",
  });
  const body = await readBodyCapped(response, MAX_BODY_BYTES);
  return {
    url: answeredUrl,
    status: response.status,
    headers: response.headers,
    body,
  };
};

/** robots.txt: shorter timeout, truncated at 500 KB, redirects returned. */
const liveRobotsTransport: Transport = async (url, { accept, signal }) => {
  const { response, url: answeredUrl } = await safeFetch(url, {
    userAgent: COLLECTOR_USER_AGENT,
    timeoutMs: ROBOTS_TIMEOUT_MS,
    accept,
    signal,
    allowErrorStatus: true,
    redirects: "return",
  });
  const body = await readBodyCapped(response, MAX_ROBOTS_BYTES, {
    truncate: true,
  });
  return {
    url: answeredUrl,
    status: response.status,
    headers: response.headers,
    body,
  };
};

let limiter: SiteRateLimiter | null = null;
function liveSiteRateLimiter(): SiteRateLimiter {
  if (limiter) return limiter;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    limiter = createSiteRateLimiter(
      redisSlotStore(
        new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        }),
      ),
    );
  } else {
    console.warn(
      "[collectors] Redis not configured: per-site limit is per instance only",
    );
    limiter = createSiteRateLimiter(memorySlotStore());
  }
  return limiter;
}

/** The real Proxy for one run: live network, shared limiter, current blocklist. */
export async function buildLiveContext(args: {
  db: CollectorDb;
  collector: AnyCollector;
  signal: AbortSignal;
  deadline: number;
  onLog: (line: string) => void;
}): Promise<{ ctx: CollectorContext; meter: ContextMeter }> {
  const blockedDomains = await loadBlockedDomains(args.db);
  return createCollectorContext({
    transport: liveTransport,
    robotsTransport: liveRobotsTransport,
    robotsToken: COLLECTOR_ROBOTS_TOKEN,
    rateLimiter: liveSiteRateLimiter(),
    blockedDomains,
    maxPages: args.collector.limits.maxPages,
    deadline: args.deadline,
    now: Date.now,
    sleep: abortableSleep,
    signal: args.signal,
    onLog: args.onLog,
  });
}
