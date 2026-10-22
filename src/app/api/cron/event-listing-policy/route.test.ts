import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripStoredEventListingPolicy = vi.hoisted(() => vi.fn());

vi.mock("@/server/events/listing-policy", () => ({
  stripStoredEventListingPolicy,
}));

import { GET } from "./route";

const dir = dirname(fileURLToPath(import.meta.url));

function req(auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/cron/event-listing-policy",
    { headers: auth ? { authorization: auth } : {} },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  stripStoredEventListingPolicy.mockResolvedValue({
    updated: 3,
    remaining: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("event listing-policy cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(stripStoredEventListingPolicy).not.toHaveBeenCalled();
  });

  it("cleans one batch for the cron caller", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      updated: number;
      remaining: number;
    };
    expect(body.success).toBe(true);
    expect(body.updated).toBe(3);
    expect(body.remaining).toBe(0);
    expect(stripStoredEventListingPolicy).toHaveBeenCalledOnce();
  });

  it("is scheduled and updates stored copy in batches, not via a data migration", () => {
    const vercel = readFileSync(
      join(dir, "../../../../../vercel.json"),
      "utf8",
    );
    const cleanup = readFileSync(
      join(dir, "../../../../server/events/listing-policy.ts"),
      "utf8",
    );
    expect(vercel).toContain('"/api/cron/event-listing-policy"');
    expect(cleanup).toContain("LIMIT");
    expect(cleanup).toContain('UPDATE "events_locales"');
    expect(cleanup).not.toMatch(/DELETE FROM "events"/);
  });
});
