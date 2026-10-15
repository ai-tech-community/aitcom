import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backfillEventAi = vi.hoisted(() => vi.fn());

vi.mock("@/server/events/event-ai", () => ({
  backfillEventAi,
}));

import { GET } from "./route";

const dir = dirname(fileURLToPath(import.meta.url));

function req(auth?: string) {
  return new Request("https://www.aitcommunity.org/api/cron/event-ai", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  backfillEventAi.mockResolvedValue({ updated: 1000, remaining: 240 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("event AI cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(backfillEventAi).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(backfillEventAi).not.toHaveBeenCalled();
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
    expect(backfillEventAi).toHaveBeenCalledOnce();
  });

  it("is scheduled and only classifies rows that are still null", () => {
    const vercel = readFileSync(
      join(dir, "../../../../../vercel.json"),
      "utf8",
    );
    const backfill = readFileSync(
      join(dir, "../../../../server/events/event-ai.ts"),
      "utf8",
    );
    expect(vercel).toContain('"/api/cron/event-ai"');
    expect(backfill).toContain('e."is_ai" IS NULL');
    expect(backfill).toContain('AND "is_ai" IS NULL');
  });
});
