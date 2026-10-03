import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PinnedTransport from "@/server/net/pinned-transport";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));
vi.mock("@/server/net/pinned-transport", async (importOriginal) => {
  const actual = await importOriginal<typeof PinnedTransport>();
  return { ...actual, pinnedFetch: vi.fn() };
});

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import {
  BlockedAddressError,
  pinnedFetch,
} from "@/server/net/pinned-transport";
import { safeFetch } from "./safe-fetch";

const guard = vi.mocked(validateWebhookUrl);
const fetchMock = vi.mocked(pinnedFetch);
const base = { userAgent: "test-agent/1.0", timeoutMs: 5_000 };

function headersOf(call = 0) {
  return fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  guard.mockResolvedValue({ ok: true });
});

describe("safeFetch", () => {
  it("keeps the HTML Accept header by default", async () => {
    fetchMock.mockResolvedValue(new Response("ok") as never);
    await safeFetch("https://example.com/", base);
    expect(headersOf().accept).toMatch(/^text\/html/);
  });

  it("sends a caller-supplied Accept header", async () => {
    fetchMock.mockResolvedValue(new Response("ok") as never);
    await safeFetch("https://example.com/feed", {
      ...base,
      accept: "application/rss+xml",
    });
    expect(headersOf().accept).toBe("application/rss+xml");
  });

  it("throws on an error status by default", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 404 }) as never);
    await expect(safeFetch("https://example.com/", base)).rejects.toThrow(
      "Request failed with status 404",
    );
  });

  it("returns an error status when allowErrorStatus is set", async () => {
    fetchMock.mockResolvedValue(
      new Response("slow down", { status: 429 }) as never,
    );
    const { response } = await safeFetch("https://example.com/", {
      ...base,
      allowErrorStatus: true,
    });
    expect(response.status).toBe(429);
  });

  it("returns a redirect to the caller when redirects is 'return'", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example/next" },
      }) as never,
    );
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
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://10.0.0.1/" },
      }) as never,
    );
    await expect(safeFetch("https://example.com/", base)).rejects.toThrow(
      "Refusing to fetch URL: private address",
    );
  });

  it("stops when the caller's signal aborts", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason as DOMException),
          );
        }),
    );
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

  it("refuses an IPv4-mapped loopback literal without a request", async () => {
    await expect(
      safeFetch("https://[::ffff:127.0.0.1]/", base),
    ).rejects.toThrow("Refusing to fetch URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends every hop through the pinned transport", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://b.example/next" },
        }) as never,
      )
      .mockResolvedValueOnce(new Response("ok") as never);
    await safeFetch("https://a.example/", base);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://a.example/",
      "https://b.example/next",
    ]);
  });

  it("releases a redirect's unread body before following it", async () => {
    const redirect = new Response("moved", {
      status: 301,
      headers: { location: "https://b.example/next" },
    });
    const cancel = vi.spyOn(redirect.body!, "cancel");
    fetchMock
      .mockResolvedValueOnce(redirect as never)
      .mockImplementationOnce(async () => {
        // Released before the next hop starts.
        expect(cancel).toHaveBeenCalledTimes(1);
        return new Response("ok") as never;
      });
    await safeFetch("https://a.example/", base);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("follows the redirect even if releasing its body fails", async () => {
    const redirect = new Response("moved", {
      status: 302,
      headers: { location: "https://b.example/next" },
    });
    vi.spyOn(redirect.body!, "cancel").mockRejectedValue(new Error("gone"));
    fetchMock
      .mockResolvedValueOnce(redirect as never)
      .mockResolvedValueOnce(new Response("ok") as never);
    const { url } = await safeFetch("https://a.example/", base);
    expect(url).toBe("https://b.example/next");
  });

  it("reports a connect-time refusal with the 'Refusing to fetch URL' prefix", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new BlockedAddressError("rebind.example"),
      }),
    );
    await expect(safeFetch("https://rebind.example/", base)).rejects.toThrow(
      "Refusing to fetch URL: it resolves to a non-public address",
    );
  });

  it("passes other network errors through unchanged", async () => {
    const failure = new TypeError("fetch failed", {
      cause: new Error("ECONNREFUSED"),
    });
    fetchMock.mockRejectedValue(failure);
    await expect(safeFetch("https://example.com/", base)).rejects.toBe(failure);
  });
});
