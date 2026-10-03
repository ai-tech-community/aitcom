import robotsParser from "robots-parser";

/** What robots.txt says about one URL for this run. */
export type RobotsVerdict = "allow" | "disallow" | "unreachable";

/** One robots.txt answer. A 3xx is handed back, not followed. */
export type RobotsReply = {
  status: number;
  location: string | null;
  body: string;
};

/**
 * One robots.txt request, no redirect following. The caller makes it obey
 * the same rules as a page request (per-site rate limit, metering).
 */
export type RobotsFetch = (url: string) => Promise<RobotsReply>;

export interface RobotsCheckDeps {
  fetchOnce: RobotsFetch;
  /** An opted-out host is never contacted, not even through a redirect. */
  isBlocked(host: string): boolean;
  token: string;
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type Rules = (url: string) => RobotsVerdict;

const always =
  (verdict: RobotsVerdict): Rules =>
  () =>
    verdict;

/**
 * robots.txt check, cached per origin for one run. Three outcomes:
 * - rules (2xx) decide per URL; a missing robots.txt (4xx) allows everything;
 * - a redirect into an opted-out site disallows the whole origin;
 * - anything else (5xx, a redirect left over after 5 hops, timeout, network
 *   error, SSRF guard refusal) is "unreachable": the caller stops honestly
 *   rather than guessing.
 * Redirects are followed here so each hop passes the blocklist.
 */
export function createRobotsCheck(
  deps: RobotsCheckDeps,
): (url: string) => Promise<RobotsVerdict> {
  const cache = new Map<string, Promise<Rules>>();

  async function load(origin: string): Promise<Rules> {
    const robotsUrl = `${origin}/robots.txt`;
    let target = robotsUrl;
    try {
      for (let hop = 0; ; hop++) {
        if (deps.isBlocked(new URL(target).hostname)) return always("disallow");
        const { status, location, body } = await deps.fetchOnce(target);
        if (REDIRECT_STATUSES.has(status) && location) {
          if (hop >= MAX_REDIRECTS) return always("unreachable");
          target = new URL(location, target).href;
          continue;
        }
        if (status >= 200 && status < 300) {
          // Parsed against the original address: the rules belong to it.
          const robots = robotsParser(robotsUrl, body);
          return (url) =>
            robots.isAllowed(url, deps.token) === false ? "disallow" : "allow";
        }
        if (status >= 400 && status < 500) return always("allow");
        return always("unreachable");
      }
    } catch {
      return always("unreachable");
    }
  }

  return async (url) => {
    const origin = new URL(url).origin;
    let rules = cache.get(origin);
    if (!rules) {
      rules = load(origin);
      cache.set(origin, rules);
    }
    return (await rules)(url);
  };
}
