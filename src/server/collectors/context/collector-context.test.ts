import { describe, expect, it, vi } from "vitest";

import { CollectorStop } from "../errors";
import {
  ExtractError,
  type ExtractErrorCode,
  type ExtractResult,
  type ExtractSpec,
} from "../extract/protocol";
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

/** A robots.txt answer for every origin (default: none, so all allowed). */
const NO_ROBOTS = reply(404);

function setup(
  over: Partial<ContextDeps> & {
    replies?: TransportResponse[];
    robotsReply?: TransportResponse;
  } = {},
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
  const robotsTransport = vi.fn<Transport>(async (url) => ({
    ...(over.robotsReply ?? NO_ROBOTS),
    url,
  }));
  const extract = vi.fn(
    async (_html: string, _spec: ExtractSpec): Promise<ExtractResult> => ({
      rows: [],
      nextUrl: null,
      truncated: false,
    }),
  );
  const controller = new AbortController();
  const deps: ContextDeps = {
    transport,
    robotsTransport,
    robotsToken: "aitcom-collector",
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
    extractor: { extract },
    ...over,
  };
  const { ctx, meter } = createCollectorContext(deps);
  return {
    ctx,
    meter,
    transport,
    acquire,
    robotsTransport,
    extract,
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
    expect(stop.detail).toEqual({ code: "blocked_domain" });
    expect(t.transport).not.toHaveBeenCalled();
    expect(t.robotsTransport).not.toHaveBeenCalled();
  });

  it("refuses a page robots.txt disallows", async () => {
    const t = setup({
      robotsReply: reply(200, "User-agent: *\nDisallow: /private"),
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/private"));
    expect([stop.reason, stop.outcome]).toEqual([
      "robots_disallowed",
      "failed",
    ]);
    expect(stop.detail).toEqual({ code: "robots_disallowed" });
    expect(t.transport).not.toHaveBeenCalled();
  });

  it("follows a redirect, checking and counting each hop", async () => {
    const t = setup({
      replies: [
        reply(301, "", { location: "https://b.com/new" }),
        reply(200, "moved"),
      ],
    });
    const res = await t.ctx.fetch("https://e.com/old");
    expect(res.url).toBe("https://b.com/new");
    expect(t.robotsTransport.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
      "https://b.com/robots.txt",
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
      robotsReply: reply(200, "User-agent: *\nDisallow: /private"),
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
    expect(stop.detail).toEqual({ code: "redirect_loop" });
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
    expect(stop.detail).toEqual({ code: "site_refused" });
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
    t.robotsTransport.mockImplementationOnce(async () => {
      t.controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect([stop.reason, stop.outcome]).toEqual(["time_limit", "succeeded"]);
    expect(t.transport).not.toHaveBeenCalled();
  });

  it.each([
    ["a server error", () => Promise.resolve(reply(500))],
    ["a network error", () => Promise.reject(new Error("ECONNRESET"))],
  ])(
    "stops honestly when robots.txt is unreachable (%s), never requesting the page",
    async (_label, impl) => {
      const t = setup();
      t.robotsTransport.mockImplementationOnce(impl);
      const stop = await stopOf(t.ctx.fetch("https://e.com/x"));
      expect([stop.reason, stop.outcome, stop.message]).toEqual([
        "robots_unreachable",
        "failed",
        "We could not read this site's robots.txt, so we did not collect from it.",
      ]);
      expect(stop.detail).toEqual({ code: "robots_unreachable" });
      expect(t.transport).not.toHaveBeenCalled();
    },
  );

  it("checks the budget before fetching robots.txt for a new site", async () => {
    const t = setup({ maxPages: 1 });
    await t.ctx.fetch("https://e.com/1");
    const stop = await stopOf(t.ctx.fetch("https://other.com/1"));
    expect(stop.reason).toBe("page_limit");
    expect(t.robotsTransport.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
    ]);
  });

  it("does not fetch robots.txt once the time budget is spent", async () => {
    const t = setup();
    t.advance(60_000);
    await stopOf(t.ctx.fetch("https://e.com/1"));
    expect(t.robotsTransport).not.toHaveBeenCalled();
  });

  it("takes a per-site rate-limit slot for the robots.txt request too", async () => {
    const t = setup();
    const order: string[] = [];
    t.acquire.mockImplementation(async (host) => {
      order.push(`slot ${host}`);
    });
    t.robotsTransport.mockImplementationOnce(async (url, opts) => {
      order.push(`robots ${url} ${opts.accept}`);
      return { ...NO_ROBOTS, url };
    });
    t.transport.mockImplementationOnce(async (url) => {
      order.push(`page ${url}`);
      return { ...reply(200), url };
    });
    await t.ctx.fetch("https://e.com/x");
    expect(order).toEqual([
      "slot e.com",
      "robots https://e.com/robots.txt text/plain",
      "slot e.com",
      "page https://e.com/x",
    ]);
  });

  it("never follows a robots.txt redirect into a blocked site", async () => {
    const t = setup({
      blockedDomains: new Set(["optout.org"]),
      robotsReply: reply(302, "", {
        location: "https://optout.org/robots.txt",
      }),
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/x"));
    expect(stop.reason).toBe("robots_disallowed");
    expect(t.robotsTransport.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
    ]);
    expect(t.acquire.mock.calls.map((c) => c[0])).toEqual(["e.com"]);
    expect(t.transport).not.toHaveBeenCalled();
  });

  it("counts robots.txt bytes, but not as a page", async () => {
    const rules = "User-agent: *\nAllow: /";
    const t = setup({
      robotsReply: reply(200, rules),
      replies: [reply(200, "hello")],
    });
    await t.ctx.fetch("https://e.com/x");
    expect(t.meter).toEqual({
      pagesFetched: 1,
      bytesFetched: Buffer.byteLength(rules) + 5,
    });
  });

  it.each(["file:///etc/passwd", "http://e.com/feed"])(
    "rejects %s: only https addresses can be collected",
    async (address) => {
      const t = setup();
      const stop = await stopOf(t.ctx.fetch(address));
      expect([stop.reason, stop.message]).toEqual([
        "error",
        "Only https addresses can be collected.",
      ]);
      expect(stop.detail).toEqual({ code: "https_only" });
      expect(t.transport).not.toHaveBeenCalled();
    },
  );
});

describe("collector context failure details", () => {
  it("names an address that is not a web address", async () => {
    const t = setup();
    const stop = await stopOf(t.ctx.fetch("not a url"));
    expect([stop.reason, stop.outcome]).toEqual(["error", "failed"]);
    expect(stop.detail).toEqual({ code: "invalid_address" });
  });

  it("gives a partial stop no failure detail", async () => {
    const t = setup({ maxPages: 1, replies: [reply(200), reply(200)] });
    await t.ctx.fetch("https://e.com/1");
    const stop = await stopOf(t.ctx.fetch("https://e.com/2"));
    expect(stop.detail).toBeUndefined();
  });
});

describe("collector context extractList", () => {
  const page = { html: "<ul><li>One</li></ul>", url: "https://e.com/list" };
  const spec = {
    itemSelector: "li",
    fields: [{ name: "title", selector: "*" }],
  };

  it("reads the page through the extractor, resolving links against the page's URL", async () => {
    const result: ExtractResult = {
      rows: [{ title: "One" }],
      nextUrl: "https://e.com/list?page=2",
      truncated: false,
    };
    const t = setup();
    t.extract.mockResolvedValueOnce(result);
    await expect(t.ctx.extractList(page, spec)).resolves.toEqual(result);
    expect(t.extract).toHaveBeenCalledWith(page.html, {
      ...spec,
      baseUrl: "https://e.com/list",
    });
  });

  it.each<[ExtractErrorCode, string, string]>([
    [
      "page_too_slow",
      "page_too_slow",
      "This page took too long to read, so we stopped.",
    ],
    [
      "page_too_deep",
      "page_too_deep",
      "This page is nested too deeply to read safely.",
    ],
    [
      "selector_not_allowed",
      "selector_not_allowed",
      "One of the selectors uses a feature we don't allow.",
    ],
    [
      "page_too_complex",
      "page_too_complex",
      "This page is too large or complex for us to read.",
    ],
    [
      "extract_failed",
      "generic",
      "Something went wrong while reading this page.",
    ],
  ])(
    "turns the extractor's %s into a failed stop with the %s detail",
    async (extractCode, failureCode, message) => {
      const t = setup();
      t.extract.mockRejectedValueOnce(new ExtractError(extractCode));
      const stop = await stopOf(t.ctx.extractList(page, spec));
      expect([stop.reason, stop.outcome, stop.message]).toEqual([
        "error",
        "failed",
        message,
      ]);
      expect(stop.detail).toEqual({ code: failureCode });
    },
  );

  it("lets any other extractor error through unchanged", async () => {
    const t = setup();
    const boom = new Error("boom");
    t.extract.mockRejectedValueOnce(boom);
    await expect(t.ctx.extractList(page, spec)).rejects.toBe(boom);
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
