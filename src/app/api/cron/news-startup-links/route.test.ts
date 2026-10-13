import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backfillNewsStartupLinks = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/startup-links", () => ({
  backfillNewsStartupLinks,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/cron/news-startup-links",
    {
      headers: auth ? { authorization: auth } : {},
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  backfillNewsStartupLinks.mockResolvedValue({
    stories: 32,
    rumors: 0,
    storyLinks: 10,
    rumorLinks: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news startup link cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(backfillNewsStartupLinks).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(backfillNewsStartupLinks).not.toHaveBeenCalled();
  });

  it("backfills for the cron caller", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      stories: number;
      storyLinks: number;
    };
    expect(body.success).toBe(true);
    expect(body.stories).toBe(32);
    expect(body.storyLinks).toBe(10);
    expect(backfillNewsStartupLinks).toHaveBeenCalledOnce();
  });
});
