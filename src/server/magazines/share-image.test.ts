// @vitest-environment node
import { readFileSync } from "node:fs";
import type * as Fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Net from "@/server/net/safe-fetch";
import sharp from "sharp";
import { shareCoverBytes } from "@/test/share-cover-fixture";

vi.mock("server-only", () => ({}));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof Fs>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
vi.mock("@/server/net/safe-fetch", async (original) => ({
  ...(await original<typeof Net>()),
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/server/net/safe-fetch";
import { loadShareCover, renderMagazineShareImage } from "./share-image";

const fetchCover = vi.mocked(safeFetch);
function reply(type: string, body: string | Uint8Array = "png", status = 200) {
  return {
    url: "https://example.test/cover",
    response: new Response(body as BodyInit, {
      status,
      headers: { "Content-Type": type },
    }) as unknown as Awaited<ReturnType<typeof safeFetch>>["response"],
  };
}
beforeEach(() => vi.resetAllMocks());

describe("share image", () => {
  it("loads fonts only on the first render and reuses them", async () => {
    vi.resetModules();
    const { renderMagazineShareImage } = await import("./share-image");
    expect(readFileSync).not.toHaveBeenCalled();
    const card = {
      magazineName: "Weekly",
      communityName: "Builders",
      issueNumber: 4,
      issueTitle: "An issue",
      coverImageUrl: null,
      article: null,
    };
    const labels = {
      issueLine: "Weekly · Issue 4",
      byline: "A magazine by Builders",
    };
    await renderMagazineShareImage(card, labels, null).arrayBuffer();
    expect(readFileSync).toHaveBeenCalledTimes(3);
    await renderMagazineShareImage(card, labels, null).arrayBuffer();
    expect(readFileSync).toHaveBeenCalledTimes(3);
  });

  it("an internal or failing cover still gives the card without the image", async () => {
    expect(await loadShareCover(null)).toBeNull();
    expect(fetchCover).not.toHaveBeenCalled();
    fetchCover.mockRejectedValueOnce(
      new Error("Refusing to fetch URL: internal"),
    );
    expect(await loadShareCover("http://169.254.169.254/x")).toBeNull();
    fetchCover.mockResolvedValueOnce(reply("text/html"));
    expect(await loadShareCover("https://example.test/html")).toBeNull();
    fetchCover.mockResolvedValueOnce(
      reply("image/png", new Uint8Array(2 * 1024 * 1024 + 1)),
    );
    expect(await loadShareCover("https://example.test/large")).toBeNull();
    fetchCover.mockResolvedValueOnce(reply("image/svg+xml"));
    expect(await loadShareCover("https://example.test/svg")).toBeNull();
    fetchCover.mockRejectedValueOnce(new Error("Timeout"));
    expect(await loadShareCover("https://example.test/slow")).toBeNull();
    fetchCover.mockResolvedValueOnce(reply("image/png", "error", 500));
    expect(await loadShareCover("https://example.test/error")).toBeNull();
    fetchCover.mockResolvedValueOnce(reply("image/png", "corrupt image"));
    expect(await loadShareCover("https://example.test/corrupt")).toBeNull();
  });

  it.each(["png", "jpeg", "webp", "gif"] as const)(
    "a good %s cover becomes a data URL",
    async (type) => {
      fetchCover.mockResolvedValue(
        reply(`image/${type}; charset=binary`, await shareCoverBytes(type)),
      );
      const cover = await loadShareCover("https://example.test/cover");
      expect(cover).toMatch(/^data:image\/(png|jpeg|webp|gif);base64,/);
      expect(fetchCover).toHaveBeenCalledWith("https://example.test/cover", {
        userAgent: "AIT Community share image",
        timeoutMs: 3000,
        accept: "image/*",
      });
      const response = renderMagazineShareImage(
        {
          magazineName: "Weekly",
          communityName: "Builders",
          issueNumber: 4,
          issueTitle: "An issue",
          coverImageUrl: "https://example.test/cover",
          article: null,
        },
        { issueLine: "Weekly · Issue 4", byline: "A magazine by Builders" },
        cover,
      );
      const png = Buffer.from(await response.arrayBuffer());
      const pixel = await sharp(png)
        .extract({ left: 1000, top: 315, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      for (const [channel, value] of [51, 102, 153].entries())
        expect(Math.abs(pixel[channel]! - value)).toBeLessThanOrEqual(3);
    },
  );

  it.each([null, { title: "An article", authorName: "Ada" }])(
    "renders an issue or article PNG in the shared frame",
    async (article) => {
      const response = renderMagazineShareImage(
        {
          magazineName: "Weekly",
          communityName: "Builders",
          issueNumber: 4,
          issueTitle: "An issue",
          coverImageUrl: "http://169.254.169.254/x",
          article,
        },
        { issueLine: "Weekly · Issue 4", byline: "A magazine by Builders" },
        null,
      );
      const png = Buffer.from(await response.arrayBuffer());
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
    },
  );
});
