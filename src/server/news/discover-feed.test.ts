// @vitest-environment node
import { expect, it, vi } from "vitest";
import { discoverFeed } from "./discover-feed";

it("resolves alternate feeds against the redirected page and its base URL", async () => {
  const read = vi.fn(async () => ({
    url: "https://publisher.test/news/",
    body: '<base href="../feeds/"><link rel="alternate" type="application/rss+xml" href="local" title="Local"><link rel="alternate" type="application/atom+xml" href="/world"><link rel="stylesheet" href="style">',
  }));
  expect(await discoverFeed("https://publisher.test", read)).toEqual({
    kind: "website",
    choices: [
      { name: "Local", url: "https://publisher.test/feeds/local" },
      {
        name: "https://publisher.test/world",
        url: "https://publisher.test/world",
      },
    ],
  });
});
it("previews the publisher and a headline for a direct Atom feed", async () => {
  const url = "https://publisher.test/feed";
  expect(
    await discoverFeed(url, async () => ({
      url,
      body: '<feed><title>Local news</title><entry><title>Bridge opens</title><link href="/bridge"/></entry></feed>',
    })),
  ).toEqual({
    kind: "feed",
    url,
    name: "Local news",
    headline: "Bridge opens",
  });
});
it.each(["<html></html>", "<rss><channel></channel></rss>"])(
  "rejects a document without a usable feed",
  async (body) => {
    await expect(
      discoverFeed("https://example.test", async (url) => ({ url, body })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  },
);
it("rejects a failed safe fetch", async () => {
  await expect(
    discoverFeed("https://example.test", async () => {
      throw new Error("refused");
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
