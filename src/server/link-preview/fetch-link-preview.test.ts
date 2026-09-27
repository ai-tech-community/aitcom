import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { fetchLinkPreview } from "./fetch-link-preview";

const mockGuard = vi.mocked(validateWebhookUrl);

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGuard.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLinkPreview", () => {
  it("reads the preview and identifies itself honestly", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        html(`<meta property="og:title" content="Hello"><title>x</title>`),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchLinkPreview("https://example.com/a"),
    ).resolves.toMatchObject({ title: "Hello" });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers["user-agent"]).toMatch(/^aitcom-link-preview\//);
  });

  it("resolves a relative image against the page it was redirected to", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 301,
            headers: { location: "https://www.example.com/post" },
          }),
        )
        .mockResolvedValueOnce(
          html(`<meta property="og:image" content="/card.png">`),
        ),
    );
    await expect(
      fetchLinkPreview("https://example.com/post"),
    ).resolves.toMatchObject({ imageUrl: "https://www.example.com/card.png" });
  });

  it("returns null when the SSRF guard blocks the host", async () => {
    mockGuard.mockResolvedValue({ ok: false, reason: "private" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchLinkPreview("https://10.0.0.1/x")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a blocked or failed page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(html("Just a moment", 403)),
    );
    await expect(fetchLinkPreview("https://claude.ai/x")).resolves.toBeNull();
  });

  it("returns null for a non-HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("%PDF", {
            headers: { "content-type": "application/pdf" },
          }),
        ),
    );
    await expect(
      fetchLinkPreview("https://example.com/a.pdf"),
    ).resolves.toBeNull();
  });

  it("reads the head of a very large page instead of failing", async () => {
    const big = `<meta property="og:title" content="Big">${"x".repeat(2 * 1024 * 1024)}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html(big)));
    await expect(
      fetchLinkPreview("https://example.com/big"),
    ).resolves.toMatchObject({ title: "Big" });
  });
});
