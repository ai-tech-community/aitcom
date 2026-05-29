import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));

import { fetchEventPageHtml, ingestRemoteImage } from "./import-from-url";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";

const mockGuard = vi.mocked(validateWebhookUrl);

beforeEach(() => {
  vi.clearAllMocks();
  mockGuard.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEventPageHtml", () => {
  it("rejects when the SSRF guard blocks the URL", async () => {
    mockGuard.mockResolvedValue({ ok: false, reason: "blocked" });
    await expect(
      fetchEventPageHtml("https://evil.example/x"),
    ).rejects.toThrow(/blocked/i);
  });

  it("rejects a non-HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      fetchEventPageHtml("https://lu.ma/ai-builders"),
    ).rejects.toThrow(/not an HTML page/i);
  });

  it("returns HTML on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>ok</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );
    const html = await fetchEventPageHtml("https://lu.ma/ai-builders");
    expect(html).toContain("<html>ok</html>");
  });
});

describe("ingestRemoteImage", () => {
  it("downloads an image and creates a media doc", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );
    const payload = {
      create: vi.fn().mockResolvedValue({ id: 7, url: "/media/7.png" }),
    };
    const result = await ingestRemoteImage(
      payload as never,
      "https://cdn.example.com/cover.png",
      "Cover for My Event",
    );
    expect(result).toEqual({ id: 7, url: "/media/7.png" });
    expect(payload.create).toHaveBeenCalledOnce();
  });

  it("returns null when the URL is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const payload = { create: vi.fn() };
    const result = await ingestRemoteImage(
      payload as never,
      "https://cdn.example.com/not-an-image",
      "alt",
    );
    expect(result).toBeNull();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("returns null when the SSRF guard blocks the image host", async () => {
    mockGuard.mockResolvedValue({ ok: false, reason: "blocked" });
    const payload = { create: vi.fn() };
    const result = await ingestRemoteImage(
      payload as never,
      "https://cdn.example.com/cover.png",
      "alt",
    );
    expect(result).toBeNull();
    expect(payload.create).not.toHaveBeenCalled();
  });
});
