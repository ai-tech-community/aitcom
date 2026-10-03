import { describe, expect, it } from "vitest";
import type { CollectorStop } from "../errors";
import { collectAll, fakeContext } from "../testing/fake-context";
import { feedItems } from "./feed-items";

const FEED = `<rss><channel>
  <item><title>One</title><link>https://e.com/1</link></item>
  <item><title>Two</title><link>https://e.com/2</link></item>
</channel></rss>`;

describe("feed-items collector", () => {
  it("asks for a feed and yields one row per item", async () => {
    const { ctx, requests, logs } = fakeContext({
      "https://e.com/feed": { body: FEED },
    });
    const rows = await collectAll(
      feedItems.run({ url: "https://e.com/feed" }, ctx),
    );
    expect(rows.map((r) => r.title)).toEqual(["One", "Two"]);
    expect(requests).toEqual([
      {
        url: "https://e.com/feed",
        accept: expect.stringContaining("application/rss+xml"),
      },
    ]);
    expect(logs).toEqual(["Found 2 items."]);
  });

  it("fails with a plain message when the address is not a feed", async () => {
    const { ctx } = fakeContext({
      "https://e.com/": { body: "<html></html>" },
    });
    await expect(
      collectAll(feedItems.run({ url: "https://e.com/" }, ctx)),
    ).rejects.toMatchObject({
      reason: "error",
      outcome: "failed",
      message: "This address is not an RSS or Atom feed.",
      detail: { code: "not_a_feed" },
    } satisfies Partial<CollectorStop>);
  });

  it("fails with the status when the feed does not answer 2xx", async () => {
    const { ctx } = fakeContext({
      "https://e.com/feed": { status: 404, body: "" },
    });
    await expect(
      collectAll(feedItems.run({ url: "https://e.com/feed" }, ctx)),
    ).rejects.toMatchObject({
      message: "The feed answered with status 404.",
      detail: { code: "feed_status", params: { status: 404 } },
    } satisfies Partial<CollectorStop>);
  });

  it("accepts only https addresses as input", () => {
    expect(
      feedItems.inputSchema.safeParse({ url: "ftp://e.com/f" }).success,
    ).toBe(false);
    expect(
      feedItems.inputSchema.safeParse({ url: "http://e.com/f" }).success,
    ).toBe(false);
    expect(
      feedItems.inputSchema.safeParse({ url: "https://e.com/f" }).success,
    ).toBe(true);
  });
});
