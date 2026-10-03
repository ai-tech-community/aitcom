import { describe, expect, it, vi } from "vitest";
import {
  type RobotsCheckDeps,
  type RobotsFetch,
  type RobotsReply,
  createRobotsCheck,
} from "./robots";

const TOKEN = "aitcom-collector";

function answer(
  status: number,
  body = "",
  location: string | null = null,
): RobotsReply {
  return { status, body, location };
}

function check(fetchOnce: RobotsFetch, over: Partial<RobotsCheckDeps> = {}) {
  return createRobotsCheck({
    fetchOnce,
    isBlocked: () => false,
    token: TOKEN,
    ...over,
  });
}

describe("robots check", () => {
  it("applies rules for our token", async () => {
    const verdict = check(
      vi
        .fn<RobotsFetch>()
        .mockResolvedValue(
          answer(
            200,
            "User-agent: aitcom-collector\nDisallow: /private\n\nUser-agent: *\nDisallow: /",
          ),
        ),
    );
    expect(await verdict("https://e.com/public/1")).toBe("allow");
    expect(await verdict("https://e.com/private/1")).toBe("disallow");
  });

  it("fetches robots.txt once per origin", async () => {
    const fetchRobots = vi.fn<RobotsFetch>().mockResolvedValue(answer(200));
    const verdict = check(fetchRobots);
    await verdict("https://e.com/a");
    await verdict("https://e.com/b");
    await verdict("https://other.com/a");
    expect(fetchRobots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
      "https://other.com/robots.txt",
    ]);
  });

  it("allows everything when robots.txt is missing (4xx)", async () => {
    const verdict = check(vi.fn<RobotsFetch>().mockResolvedValue(answer(404)));
    expect(await verdict("https://e.com/x")).toBe("allow");
  });

  it.each([
    ["a server error", () => Promise.resolve(answer(503))],
    ["a network error", () => Promise.reject(new Error("boom"))],
    ["a redirect with no Location", () => Promise.resolve(answer(301))],
  ])("reports %s as unreachable", async (_label, impl) => {
    const verdict = check(vi.fn<RobotsFetch>(impl));
    expect(await verdict("https://e.com/x")).toBe("unreachable");
  });

  it("follows redirects itself and applies the rules to the original site", async () => {
    const fetchRobots = vi
      .fn<RobotsFetch>()
      .mockResolvedValueOnce(answer(301, "", "https://www.e.com/robots.txt"))
      .mockResolvedValueOnce(answer(200, "User-agent: *\nDisallow: /private"));
    const verdict = check(fetchRobots);
    expect(await verdict("https://e.com/private/1")).toBe("disallow");
    expect(await verdict("https://e.com/public")).toBe("allow");
    expect(fetchRobots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
      "https://www.e.com/robots.txt",
    ]);
  });

  it("reports more than 5 redirects as unreachable", async () => {
    const fetchRobots = vi
      .fn<RobotsFetch>()
      .mockImplementation(async (url) =>
        answer(302, "", `${url.replace("/robots.txt", "")}/r/robots.txt`),
      );
    const verdict = check(fetchRobots);
    expect(await verdict("https://e.com/x")).toBe("unreachable");
    expect(fetchRobots).toHaveBeenCalledTimes(6);
  });

  it("never follows a redirect into a blocked site; the origin is disallowed", async () => {
    const fetchRobots = vi
      .fn<RobotsFetch>()
      .mockResolvedValue(answer(302, "", "https://optout.org/robots.txt"));
    const verdict = check(fetchRobots, {
      isBlocked: (host) => host === "optout.org",
    });
    expect(await verdict("https://e.com/x")).toBe("disallow");
    expect(fetchRobots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
    ]);
  });
});
