import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addConfiguredNewsFeed = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/submit", () => ({
  addConfiguredNewsFeed,
}));

import { POST } from "./route";

function req(body: unknown, auth?: string) {
  return new Request("https://www.aitcommunity.org/api/news/feeds", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  addConfiguredNewsFeed.mockResolvedValue({
    ok: true,
    inserted: true,
    name: "Example",
    url: "https://example.com/feed.xml",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/news/feeds", () => {
  it("refuses a missing secret and adds a feed for the bot caller", async () => {
    expect((await POST(req({}))).status).toBe(401);
    const res = await POST(
      req(
        { name: "Example", url: "https://example.com/feed.xml" },
        "Bearer s3cret",
      ),
    );
    expect(res.status).toBe(201);
    expect(addConfiguredNewsFeed).toHaveBeenCalledOnce();
  });
});
