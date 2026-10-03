import { describe, expect, it, vi } from "vitest";

import { CollectorStop } from "../errors";
import {
  type ContextDeps,
  type Transport,
  type TransportResponse,
  createCollectorContext,
  retryAfterMs,
} from "./collector-context";

function reply(
  status: number,
  body = "",
  headers: Record<string, string> = {},
  url = "https://e.com/",
): TransportResponse {
  return {
    url,
    status,
    headers: new Headers(headers),
    body: Buffer.from(body),
  };
}

function setup(
  over: Partial<ContextDeps> & { replies?: TransportResponse[] } = {},
) {
  let now = 1_000_000;
  const replies = [...(over.replies ?? [reply(200, "ok")])];
  const transport = vi.fn<Transport>(async (url) => {
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    return { ...next, url };
  });
  const acquire = vi.fn(
    async (_host: string, _signal: AbortSignal) => undefined,
  );
  const robots = vi.fn(async (_url: string) => true);
  const controller = new AbortController();
  const deps: ContextDeps = {
    transport,
    isAllowedByRobots: robots,
    rateLimiter: { acquire },
    blockedDomains: new Set(),
    maxPages: 10,
    deadline: now + 60_000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    signal: controller.signal,
    onLog: vi.fn(),
    ...over,
  };
  const { ctx, meter } = createCollectorContext(deps);
  return {
    ctx,
    meter,
    transport,
    acquire,
    robots,
    controller,
    deps,
    advance: (ms: number) => (now += ms),
  };
}

async function stopOf(p: Promise<unknown>): Promise<CollectorStop> {
  try {
    await p;
  } catch (err) {
    if (err instanceof CollectorStop) return err;
    throw err;
  }
  throw new Error("expected a CollectorStop");
}

describe("collector context", () => {
  it("fetches through the rate limiter and counts pages and bytes", async () => {
    const t = setup({ replies: [reply(200, "hello")] });
    const res = await t.ctx.fetch("https://e.com/a", {
      accept: "application/json",
    });
    expect(await res.text()).toBe("hello");
    expect(t.acquire).toHaveBeenCalledWith("e.com", t.deps.signal);
    expect(t.transport).toHaveBeenCalledWith("https://e.com/a", {
      accept: "application/json",
      signal: t.deps.signal,
    });
    expect(t.meter).toEqual({ pagesFetched: 1, bytesFetched: 5 });
  });

  it("stops at the page limit as a partial success", async () => {
    const t = setup({ maxPages: 1, replies: [reply(200), reply(200)] });
    await t.ctx.fetch("https://e.com/1");
    const stop = await stopOf(t.ctx.fetch("https://e.com/2"));
    expect([stop.reason, stop.outcome]).toEqual(["page_limit", "succeeded"]);
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("stops at the deadline as a partial success", async () => {
    const t = setup();
    t.advance(60_000);
    const stop = await stopOf(t.ctx.fetch("https://e.com/1"));
    expect([stop.reason, stop.outcome]).toEqual(["time_limit", "succeeded"]);
  });

  it("refuses a blocked site and its subdomains without contacting them", async () => {
    const t = setup({ blockedDomains: new Set(["e.com"]) });
    const stop = await stopOf(t.ctx.fetch("https://www.e.com/x"));
    expect([stop.reason, stop.outcome]).toEqual(["blocked_domain", "failed"]);
    expect(t.transport).not.toHaveBeenCalled();
    expect(t.robots).not.toHaveBeenCalled();
  });

  it("refuses a page robots.txt disallows", async () => {
    const t = setup({ isAllowedByRobots: async () => false });
    const stop = await stopOf(t.ctx.fetch("https://e.com/private"));
    expect([stop.reason, stop.outcome]).toEqual([
      "robots_disallowed",
      "failed",
    ]);
    expect(t.transport).not.toHaveBeenCalled();
  });

  it("follows a redirect, checking and counting each hop", async () => {
    const t = setup({
      replies: [reply(301, "", { location: "/new" }), reply(200, "moved")],
    });
    const res = await t.ctx.fetch("https://e.com/old");
    expect(res.url).toBe("https://e.com/new");
    expect(t.robots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/old",
      "https://e.com/new",
    ]);
    expect(t.meter.pagesFetched).toBe(2);
  });

  it("stops when a redirect leads to a blocked site, never contacting it", async () => {
    const t = setup({
      blockedDomains: new Set(["blocked.org"]),
      replies: [reply(302, "", { location: "https://blocked.org/x" })],
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/go"));
    expect(stop.reason).toBe("blocked_domain");
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("stops when a redirect leads to a robots-disallowed page", async () => {
    const t = setup({
      isAllowedByRobots: async (url) => !url.includes("/private"),
      replies: [reply(302, "", { location: "/private/x" })],
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/go"));
    expect(stop.reason).toBe("robots_disallowed");
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("gives up after 5 redirects", async () => {
    const loop = Array.from({ length: 6 }, (_, i) =>
      reply(302, "", { location: `/r${i + 1}` }),
    );
    const t = setup({ replies: loop });
    const stop = await stopOf(t.ctx.fetch("https://e.com/r0"));
    expect([stop.reason, stop.message]).toEqual([
      "error",
      "A page redirected too many times.",
    ]);
  });

  it("waits as long as Retry-After says, then retries", async () => {
    const t = setup({
      replies: [reply(429, "", { "retry-after": "2" }), reply(200, "ok")],
    });
    const before = t.deps.now();
    const res = await t.ctx.fetch("https://e.com/");
    expect(res.status).toBe(200);
    expect(t.deps.now() - before).toBe(2_000);
    expect(t.meter.pagesFetched).toBe(2);
  });

  it("stops on the third consecutive 429/503 from a site", async () => {
    const t = setup({ replies: [reply(429), reply(503), reply(429)] });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect([stop.reason, stop.outcome]).toEqual(["site_refused", "failed"]);
  });

  it("ends as time_limit when Retry-After goes past the deadline", async () => {
    const t = setup({ replies: [reply(503, "", { "retry-after": "3600" })] });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect(stop.reason).toBe("time_limit");
  });

  it("turns an abort during a request into time_limit", async () => {
    const t = setup();
    t.transport.mockImplementationOnce(async () => {
      t.controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect(stop.reason).toBe("time_limit");
  });

  it("turns an abort during the robots.txt check into time_limit", async () => {
    const t = setup();
    t.robots.mockImplementationOnce(async () => {
      t.controller.abort();
      return false;
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect([stop.reason, stop.outcome]).toEqual(["time_limit", "succeeded"]);
    expect(t.transport).not.toHaveBeenCalled();
  });

  it("rejects non-web addresses", async () => {
    const t = setup();
    const stop = await stopOf(t.ctx.fetch("file:///etc/passwd"));
    expect([stop.reason, stop.message]).toEqual([
      "error",
      "Only http and https addresses can be collected.",
    ]);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs("5", 0)).toBe(5_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs("soon", 0)).toBeNull();
  });
});
