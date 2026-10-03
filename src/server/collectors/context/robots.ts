import robotsParser from "robots-parser";

export type RobotsFetch = (
  url: string,
) => Promise<{ status: number; body: string }>;

/**
 * robots.txt check, cached per origin for one run. Missing robots.txt
 * (4xx) allows everything; a server error or network failure disallows
 * the whole origin for this run (conservative).
 */
export function createRobotsCheck(
  fetchRobots: RobotsFetch,
  token: string,
): (url: string) => Promise<boolean> {
  const cache = new Map<string, Promise<(url: string) => boolean>>();

  async function load(origin: string): Promise<(url: string) => boolean> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const { status, body } = await fetchRobots(robotsUrl);
      if (status >= 400 && status < 500) return () => true;
      if (status >= 300) return () => false;
      const robots = robotsParser(robotsUrl, body);
      return (url) => robots.isAllowed(url, token) !== false;
    } catch {
      return () => false;
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
