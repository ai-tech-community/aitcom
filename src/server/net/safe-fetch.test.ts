// src/server/net/safe-fetch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { safeFetch } from "./safe-fetch";

const guard = vi.mocked(validateWebhookUrl);
const base = { userAgent: "test-agent/1.0", timeoutMs: 5_000 };

function headersOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  return mock.mock.calls[call]?.[1]?.headers as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeFetch", () => {
  it("keeps the HTML Accept header by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await safeFetch("https://example.com/", base);
    expect(headersOf(fetchMock).accept).toMatch(/^text\/html/);
  });

  it("sends a caller-supplied Accept header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await safeFetch("https://example.com/feed", {
      ...base,
      accept: "application/rss+xml",
    });
    expect(headersOf(fetchMock).accept).toBe("application/rss+xml");
  });

  it("throws on an error status by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no", { status: 404 })),
    );
    await expect(safeFetch("https://example.com/", base)).rejects.toThrow(
      "Request failed with status 404",
    );
  });

  it("returns an error status when allowErrorStatus is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    );
    const { response } = await safeFetch("https://example.com/", {
      ...base,
      allowErrorStatus: true,
    });
    expect(response.status).toBe(429);
  });

  it("returns a redirect to the caller when redirects is 'return'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example/next" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { response, url } = await safeFetch("https://example.com/a", {
      ...base,
      redirects: "return",
    });
    expect(response.status).toBe(302);
    expect(url).toBe("https://example.com/a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still validates every redirect hop when following", async () => {
    guard
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "private address" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "http://10.0.0.1/" },
        }),
      ),
    );
    await expect(safeFetch("https://example.com/", base)).rejects.toThrow(
      "Refusing to fetch URL: private address",
    );
  });

  it("stops when the caller's signal aborts", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason as DOMException),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = safeFetch("https://example.com/", {
      ...base,
      signal: controller.signal,
    });
    // Abort while the request is in flight (safeFetch awaits the URL guard
    // before it calls fetch).
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    // The caller's abort, not the timeout (which would be a TimeoutError).
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
