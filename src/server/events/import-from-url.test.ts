import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchEventPageHtml, ingestRemoteImage } from "./import-from-url";

describe("fetchEventPageHtml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-HTTPS / private URLs via the SSRF guard", async () => {
    await expect(fetchEventPageHtml("http://localhost/x")).rejects.toThrow();
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("returns null when the image host fails the SSRF guard", async () => {
    const payload = { create: vi.fn() };
    const result = await ingestRemoteImage(
      payload as never,
      "http://127.0.0.1/cover.png",
      "alt",
    );
    expect(result).toBeNull();
    expect(payload.create).not.toHaveBeenCalled();
  });
});
