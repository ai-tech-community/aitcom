import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backfillPublishedContributions = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/contributions", () => ({
  backfillPublishedContributions,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/cron/news-contributions",
    {
      headers: auth ? { authorization: auth } : {},
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  backfillPublishedContributions.mockResolvedValue({
    scanned: 2,
    credited: 1,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news contribution cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(backfillPublishedContributions).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(backfillPublishedContributions).not.toHaveBeenCalled();
  });

  it("credits published stories again without rewriting ones already stored", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      scanned: number;
      credited: number;
    };
    expect(body.success).toBe(true);
    expect(body.credited).toBe(1);
    expect(backfillPublishedContributions).toHaveBeenCalledOnce();
  });
});
