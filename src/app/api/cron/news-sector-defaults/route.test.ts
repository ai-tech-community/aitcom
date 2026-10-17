import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backfillNewsSectorDefaults = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/sectors", () => ({
  backfillNewsSectorDefaults,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/cron/news-sector-defaults",
    { headers: auth ? { authorization: auth } : {} },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  backfillNewsSectorDefaults.mockResolvedValue({
    communities: 4,
    feeds: 38,
    items: 1000,
    remainingCommunities: 0,
    remainingFeeds: 0,
    remainingItems: 20,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news sector default cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(backfillNewsSectorDefaults).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(backfillNewsSectorDefaults).not.toHaveBeenCalled();
  });

  it("backfills one batch for the cron caller", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      communities: number;
      items: number;
      remainingItems: number;
    };
    expect(body.success).toBe(true);
    expect(body.communities).toBe(4);
    expect(body.items).toBe(1000);
    expect(body.remainingItems).toBe(20);
    expect(backfillNewsSectorDefaults).toHaveBeenCalledOnce();
  });
});
