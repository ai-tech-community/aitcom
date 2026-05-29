import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));

import {
  fetchEventPageHtml,
  ingestRemoteImage,
  runEventImport,
} from "./import-from-url";
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
    await expect(fetchEventPageHtml("https://evil.example/x")).rejects.toThrow(
      /blocked|refusing/i,
    );
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

  it("rejects a non-200 status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("nope", {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(fetchEventPageHtml("https://lu.ma/missing")).rejects.toThrow(
      /status 404/i,
    );
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

  it("aborts when the body exceeds the size cap (no content-length)", async () => {
    const huge = "x".repeat(3 * 1024 * 1024); // 3 MB > 2 MB html cap
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`<html>${huge}</html>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(
      fetchEventPageHtml("https://lu.ma/ai-builders"),
    ).rejects.toThrow(/too large/i);
  });

  it("follows a redirect to an allowed host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://lu.ma/final" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<html>final</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const html = await fetchEventPageHtml("https://lu.ma/start");
    expect(html).toContain("final");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-validates redirect targets and blocks an internal redirect", async () => {
    mockGuard.mockImplementation(async (u: string) =>
      u.includes("169.254.169.254")
        ? { ok: false, reason: "blocked" }
        : { ok: true },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        }),
      ),
    );
    await expect(fetchEventPageHtml("https://evil.example/x")).rejects.toThrow(
      /blocked|refusing/i,
    );
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

  it("strips charset from the content-type for mimetype + extension", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-type": "image/jpeg; charset=binary" },
        }),
      ),
    );
    const create = vi.fn().mockResolvedValue({ id: 1, url: "/m/1.jpeg" });
    await ingestRemoteImage(
      { create } as never,
      "https://cdn.example.com/c.jpg",
      "alt",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({
          name: "event-cover.jpeg",
          mimetype: "image/jpeg",
        }),
      }),
    );
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

describe("runEventImport", () => {
  it("fetches, parses, and ingests the cover image", async () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","name":"Imported Event","startDate":"2026-06-12T18:00",
       "image":"https://cdn.example.com/cover.png"}
      </script>`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      create: vi.fn().mockResolvedValue({ id: 9, url: "/media/9.png" }),
    };
    const result = await runEventImport(
      "https://lu.ma/imported",
      payload as never,
    );
    expect(result.title).toBe("Imported Event");
    expect(result.date).toBe("2026-06-12");
    expect(result.coverImageId).toBe(9);
    expect(result.coverImageUrl).toBe("/media/9.png");
    expect(result.sourceUrl).toBe("https://lu.ma/imported");
  });

  it("succeeds with null cover when image ingestion fails", async () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","name":"No Image Event","startDate":"2026-06-12T18:00",
       "image":"https://cdn.example.com/cover.png"}
      </script>`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("not-an-image", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const payload = { create: vi.fn() };
    const result = await runEventImport(
      "https://lu.ma/imported",
      payload as never,
    );
    expect(result.title).toBe("No Image Event");
    expect(result.coverImageId).toBeNull();
    expect(result.coverImageUrl).toBeNull();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("propagates a fetch failure (caller maps it to a user error)", async () => {
    mockGuard.mockResolvedValue({ ok: false, reason: "blocked" });
    const payload = { create: vi.fn() };
    await expect(
      runEventImport("https://evil.example/x", payload as never),
    ).rejects.toThrow();
  });
});
