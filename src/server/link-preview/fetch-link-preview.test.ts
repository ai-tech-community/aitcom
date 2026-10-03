import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PinnedTransport from "@/server/net/pinned-transport";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));
vi.mock("@/server/net/pinned-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof PinnedTransport>()),
  pinnedFetch: vi.fn(),
}));

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { fetchLinkPreview } from "./fetch-link-preview";
import { pinnedFetch } from "@/server/net/pinned-transport";

const mockGuard = vi.mocked(validateWebhookUrl);
const fetchMock = vi.mocked(pinnedFetch);

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  mockGuard.mockResolvedValue({ ok: true });
});

describe("fetchLinkPreview", () => {
  it("reads the preview and identifies itself honestly", async () => {
    fetchMock.mockResolvedValue(
      html(
        `<meta property="og:title" content="Hello"><title>x</title>`,
      ) as never,
    );
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
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://www.example.com/post" },
        }) as never,
      )
      .mockResolvedValueOnce(
        html(`<meta property="og:image" content="/card.png">`) as never,
      );
    await expect(
      fetchLinkPreview("https://example.com/post"),
    ).resolves.toMatchObject({ imageUrl: "https://www.example.com/card.png" });
  });

  it("returns null when the SSRF guard blocks the host", async () => {
    mockGuard.mockResolvedValue({ ok: false, reason: "private" });
    await expect(fetchLinkPreview("https://10.0.0.1/x")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a blocked or failed page", async () => {
    fetchMock.mockResolvedValue(html("Just a moment", 403) as never);
    await expect(fetchLinkPreview("https://claude.ai/x")).resolves.toBeNull();
  });

  it("returns null for a non-HTML response", async () => {
    fetchMock.mockResolvedValue(
      new Response("%PDF", {
        headers: { "content-type": "application/pdf" },
      }) as never,
    );
    await expect(
      fetchLinkPreview("https://example.com/a.pdf"),
    ).resolves.toBeNull();
  });

  it("reads the head of a very large page instead of failing", async () => {
    const big = `<meta property="og:title" content="Big">${"x".repeat(2 * 1024 * 1024)}`;
    fetchMock.mockResolvedValue(html(big) as never);
    await expect(
      fetchLinkPreview("https://example.com/big"),
    ).resolves.toMatchObject({ title: "Big" });
  });
});
