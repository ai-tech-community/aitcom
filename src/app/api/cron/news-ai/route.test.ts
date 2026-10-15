import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backfillNewsItemAi = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/item-ai", () => ({
  backfillNewsItemAi,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("https://www.aitcommunity.org/api/cron/news-ai", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  backfillNewsItemAi.mockResolvedValue({ updated: 40, remaining: 12 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news item AI cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(backfillNewsItemAi).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(backfillNewsItemAi).not.toHaveBeenCalled();
  });

  it("backfills one pass for the cron caller", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      updated: number;
      remaining: number;
    };
    expect(body.success).toBe(true);
    expect(body.updated).toBe(40);
    expect(body.remaining).toBe(12);
    expect(backfillNewsItemAi).toHaveBeenCalledOnce();
  });

  it("only writes rows that are still untagged", () => {
    const backfill = readFileSync(
      join(process.cwd(), "src/server/news/item-ai.ts"),
      "utf8",
    );
    expect(backfill).toContain("isNull(newsItems.isAi)");
    expect(backfill).toContain("groupNewsAiUpdates");
    expect(backfill).toContain("set({ isAi: true })");
    expect(backfill).toContain("set({ isAi: false })");
  });
});
