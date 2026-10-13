import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ingestConfiguredNewsFeeds = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/ingest-feeds", () => ({
  ingestConfiguredNewsFeeds,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("https://www.aitcommunity.org/api/cron/news-feeds", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  ingestConfiguredNewsFeeds.mockResolvedValue({
    inserted: 2,
    feeds: [
      {
        url: "https://example.com/feed",
        name: "Example",
        ok: true,
        inserted: 2,
      },
    ],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news feed cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(ingestConfiguredNewsFeeds).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(ingestConfiguredNewsFeeds).not.toHaveBeenCalled();
  });

  it("ingests the configured feeds for the cron caller", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; inserted: number };
    expect(body.success).toBe(true);
    expect(body.inserted).toBe(2);
    expect(ingestConfiguredNewsFeeds).toHaveBeenCalledOnce();
  });
});
