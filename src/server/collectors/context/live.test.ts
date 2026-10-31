import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jobBoard } from "../collectors/job-board";
import { collectAll } from "../testing/fake-context";
import type * as Blocklist from "./blocklist";

const h = vi.hoisted(() => ({
  mode: "development",
  configured: true,
  redisConstruct: vi.fn(),
  redisSet: vi.fn(),
  fetch: vi.fn<(url: string) => Promise<{ url: string; response: Response }>>(),
  close: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    get NODE_ENV() {
      return h.mode;
    },
    get UPSTASH_REDIS_REST_URL() {
      return h.configured ? "https://redis.example" : undefined;
    },
    get UPSTASH_REDIS_REST_TOKEN() {
      return h.configured ? "test-token" : undefined;
    },
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) {
      h.redisConstruct(options);
    }
    set = h.redisSet;
  },
}));
vi.mock("./blocklist", async (importOriginal) => ({
  ...(await importOriginal<typeof Blocklist>()),
  loadBlockedDomains: async () => new Set<string>(),
}));
vi.mock("../extract/sandbox", () => ({
  createExtractSandbox: () => ({ close: h.close, extract: vi.fn() }),
}));
vi.mock("@/server/net/safe-fetch", () => ({
  safeFetch: h.fetch,
  readBodyCapped: async (response: Response) =>
    Buffer.from(await response.text()),
}));

const origin = "https://boards-api.greenhouse.io";
const jobsUrl = `${origin}/v1/boards/greenhouse/jobs?content=true`;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  h.mode = "development";
  h.configured = true;
  h.redisSet.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
  h.fetch.mockImplementation(async (url: string) => ({
    url,
    response: new Response(
      url.endsWith("/robots.txt")
        ? "User-agent: *\nDisallow: /embed/\n"
        : JSON.stringify({
            jobs: [
              { title: "Engineer", absolute_url: "https://example.com/jobs/1" },
            ],
          }),
    ),
  }));
});
afterEach(() => {
  vi.useRealTimers();
});

async function context() {
  const { buildLiveContext } = await import("./live");
  return buildLiveContext({
    db: {} as never,
    collector: jobBoard,
    signal: new AbortController().signal,
    deadline: Date.now() + 60_000,
    onLog: vi.fn(),
  });
}

describe("live collector rate limiting", () => {
  it.each([true, false])(
    "collects locally with the one-second limit even when Redis is configured=%s",
    async (configured) => {
      h.configured = configured;
      const { ctx, meter, dispose } = await context();
      const start = Date.now();
      // Capture both outcomes so the failing reproduction never causes an unhandled rejection.
      const result = collectAll(
        jobBoard.run({ board: "greenhouse", name: "greenhouse" }, ctx),
      ).then(
        (rows) => ({ rows }),
        (error: unknown) => ({ error }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await result).toEqual({
        rows: [
          {
            title: "Engineer",
            location: null,
            department: null,
            url: "https://example.com/jobs/1",
            postedAt: null,
            description: null,
            applyUrl: "https://example.com/jobs/1",
            employmentType: null,
            workplaceType: null,
            descriptionTruncated: false,
          },
        ],
      });
      expect(h.redisConstruct).not.toHaveBeenCalled();
      expect(h.redisSet).not.toHaveBeenCalled();
      expect(h.fetch.mock.calls.map(([url]) => url)).toEqual([
        `${origin}/robots.txt`,
        jobsUrl,
      ]);
      expect(Date.now() - start).toBe(1_000);
      expect(meter.pagesFetched).toBe(1);
      await dispose();
    },
  );

  it("keeps the shared Redis limiter on deployments", async () => {
    h.mode = "production";
    h.redisSet.mockResolvedValue("OK");
    const { ctx, dispose } = await context();
    await ctx.fetch(jobsUrl);
    expect(h.redisConstruct).toHaveBeenCalledWith({
      url: "https://redis.example",
      token: "test-token",
    });
    expect(h.redisSet).toHaveBeenCalledTimes(2);
    await dispose();
  });

  it("still respects robots.txt while using the local limiter", async () => {
    h.fetch.mockImplementation(async (url: string) => ({
      url,
      response: new Response("User-agent: *\nDisallow: /\n"),
    }));
    const { ctx, dispose } = await context();
    await expect(ctx.fetch(jobsUrl)).rejects.toMatchObject({
      reason: "robots_disallowed",
    });
    expect(h.fetch.mock.calls.map(([url]) => url)).toEqual([
      `${origin}/robots.txt`,
    ]);
    expect(h.redisSet).not.toHaveBeenCalled();
    await dispose();
  });

  it("never bypasses a configured deployment limiter when Redis fails", async () => {
    h.mode = "production";
    const { ctx, dispose } = await context();
    await expect(ctx.fetch(jobsUrl)).rejects.toMatchObject({
      reason: "robots_unreachable",
    });
    expect(h.redisSet).toHaveBeenCalledOnce();
    expect(h.fetch).not.toHaveBeenCalled();
    await dispose();
  });
});
