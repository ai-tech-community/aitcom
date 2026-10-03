import type { CollectorContext, CollectorResponse } from "../collector";
import { CollectorStop } from "../errors";
import { isBlockedHost } from "./blocklist";
import { createRobotsCheck } from "./robots";
import type { SiteRateLimiter, Sleep } from "./site-rate-limit";

export type TransportResponse = {
  url: string;
  status: number;
  headers: Headers;
  body: Buffer;
};

/** One HTTP request, no redirect following (the context does that). */
export type Transport = (
  url: string,
  opts: { accept?: string; signal: AbortSignal },
) => Promise<TransportResponse>;

export interface ContextDeps {
  transport: Transport;
  /** One robots.txt request (its own size and time caps), no redirects. */
  robotsTransport: Transport;
  /** The user-agent token robots.txt rules are matched against. */
  robotsToken: string;
  rateLimiter: SiteRateLimiter;
  blockedDomains: ReadonlySet<string>;
  maxPages: number;
  deadline: number;
  now: () => number;
  sleep: Sleep;
  signal: AbortSignal;
  onLog: (line: string) => void;
}

export interface ContextMeter {
  pagesFetched: number;
  bytesFetched: number;
}

const MAX_REDIRECTS = 5;
const MAX_BACKOFFS_PER_HOST = 3;
const DEFAULT_BACKOFF_MS = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Retry-After as milliseconds: delta-seconds or an HTTP date. */
export function retryAfterMs(
  header: string | null,
  now: number,
): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * The protection Proxy every collector receives (ADR-0040). Order per hop:
 * budget → blocklist → robots.txt → shared per-site rate limit → request.
 * Redirects are followed here, not in the transport, so every hop passes
 * the same rules. The robots.txt request itself obeys them too: it waits
 * for the per-site slot, never follows a redirect into an opted-out site,
 * and its bytes are metered (it is not a page). 429/503 are honoured with
 * Retry-After; the third in a row from one host stops the run. Metering
 * happens here, so a collector cannot skip it.
 */
export function createCollectorContext(deps: ContextDeps): {
  ctx: CollectorContext;
  meter: ContextMeter;
} {
  const meter: ContextMeter = { pagesFetched: 0, bytesFetched: 0 };
  const backoffs = new Map<string, number>();

  const timeLimit = () =>
    new CollectorStop("time_limit", "succeeded", "Stopped at the time limit.");

  function checkBudget(): void {
    if (deps.signal.aborted || deps.now() >= deps.deadline) throw timeLimit();
    if (meter.pagesFetched >= deps.maxPages) {
      throw new CollectorStop(
        "page_limit",
        "succeeded",
        "Stopped at the page limit.",
      );
    }
  }

  const isBlocked = (host: string) => isBlockedHost(host, deps.blockedDomains);

  const robotsVerdict = createRobotsCheck({
    token: deps.robotsToken,
    isBlocked,
    async fetchOnce(robotsUrl) {
      await deps.rateLimiter.acquire(new URL(robotsUrl).hostname, deps.signal);
      const res = await deps.robotsTransport(robotsUrl, {
        accept: "text/plain",
        signal: deps.signal,
      });
      meter.bytesFetched += res.body.byteLength;
      return {
        status: res.status,
        location: res.headers.get("location"),
        body: res.body.toString("utf8"),
      };
    },
  });

  async function fetchHop(
    url: URL,
    accept: string | undefined,
  ): Promise<TransportResponse> {
    // Budget first: a spent run must not even fetch robots.txt for a new site.
    checkBudget();
    if (isBlocked(url.hostname)) {
      throw new CollectorStop(
        "blocked_domain",
        "failed",
        "This site has asked not to be collected.",
        { code: "blocked_domain" },
      );
    }
    const verdict = await robotsVerdict(url.href);
    if (verdict !== "allow") {
      // An abort mid-check reads as "unreachable"; report it as the time
      // limit it really is.
      if (deps.signal.aborted) throw timeLimit();
      if (verdict === "unreachable") {
        throw new CollectorStop(
          "robots_unreachable",
          "failed",
          "We could not read this site's robots.txt, so we did not collect from it.",
          { code: "robots_unreachable" },
        );
      }
      throw new CollectorStop(
        "robots_disallowed",
        "failed",
        "This site's robots.txt does not allow collecting this page.",
        { code: "robots_disallowed" },
      );
    }
    for (;;) {
      checkBudget();
      await deps.rateLimiter.acquire(url.hostname, deps.signal);
      const res = await deps.transport(url.href, {
        accept,
        signal: deps.signal,
      });
      meter.pagesFetched += 1;
      meter.bytesFetched += res.body.byteLength;
      if (res.status !== 429 && res.status !== 503) {
        backoffs.delete(url.hostname);
        return res;
      }
      const count = (backoffs.get(url.hostname) ?? 0) + 1;
      backoffs.set(url.hostname, count);
      if (count >= MAX_BACKOFFS_PER_HOST) {
        throw new CollectorStop(
          "site_refused",
          "failed",
          "The site asked us to slow down several times, so we stopped.",
          { code: "site_refused" },
        );
      }
      const wait =
        retryAfterMs(res.headers.get("retry-after"), deps.now()) ??
        DEFAULT_BACKOFF_MS;
      if (deps.now() + wait >= deps.deadline) throw timeLimit();
      deps.onLog(
        `${url.hostname} asked us to wait ${Math.ceil(wait / 1_000)}s.`,
      );
      await deps.sleep(wait, deps.signal);
    }
  }

  const ctx: CollectorContext = {
    signal: deps.signal,
    log: deps.onLog,
    async fetch(rawUrl, opts) {
      try {
        let url = parseWebUrl(rawUrl);
        for (let hop = 0; ; hop++) {
          const res = await fetchHop(url, opts?.accept);
          const location = REDIRECT_STATUSES.has(res.status)
            ? res.headers.get("location")
            : null;
          if (!location) return toCollectorResponse(res);
          if (hop >= MAX_REDIRECTS) {
            throw new CollectorStop(
              "error",
              "failed",
              "A page redirected too many times.",
              { code: "redirect_loop" },
            );
          }
          url = parseWebUrl(new URL(location, url).href);
        }
      } catch (err) {
        if (err instanceof CollectorStop) throw err;
        if (deps.signal.aborted) throw timeLimit();
        throw err;
      }
    },
  };
  return { ctx, meter };
}

function parseWebUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CollectorStop(
      "error",
      "failed",
      "A collector produced an invalid web address.",
      { code: "invalid_address" },
    );
  }
  // The SSRF guard in safeFetch refuses plain http, so only https can work.
  if (url.protocol !== "https:") {
    throw new CollectorStop(
      "error",
      "failed",
      "Only https addresses can be collected.",
      { code: "https_only" },
    );
  }
  return url;
}

function toCollectorResponse(res: TransportResponse): CollectorResponse {
  return {
    url: res.url,
    status: res.status,
    headers: res.headers,
    text: async () => res.body.toString("utf8"),
    json: async () => JSON.parse(res.body.toString("utf8")) as unknown,
  };
}
