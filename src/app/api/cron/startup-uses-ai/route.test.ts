import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backfillStartupUsesAi = vi.hoisted(() => vi.fn());

vi.mock("@/server/startups/uses-ai-backfill", () => ({
  backfillStartupUsesAi,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("https://www.aitcommunity.org/api/cron/startup-uses-ai", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  backfillStartupUsesAi.mockResolvedValue({ updated: 1000, remaining: 240 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("startup uses-ai cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(backfillStartupUsesAi).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(backfillStartupUsesAi).not.toHaveBeenCalled();
  });

  it("backfills one batch for the cron caller", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      updated: number;
      remaining: number;
    };
    expect(body.success).toBe(true);
    expect(body.updated).toBe(1000);
    expect(body.remaining).toBe(240);
    expect(backfillStartupUsesAi).toHaveBeenCalledOnce();
  });
});
