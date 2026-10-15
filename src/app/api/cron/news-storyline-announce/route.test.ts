import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const announcePublishedStorylinesFromDb = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/announce-storylines-db", () => ({
  announcePublishedStorylinesFromDb,
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request(
    "https://www.aitcommunity.org/api/cron/news-storyline-announce",
    { headers: auth ? { authorization: auth } : {} },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  announcePublishedStorylinesFromDb.mockResolvedValue({
    fanout: false,
    stories: 1,
    sent: 0,
    skipped: 0,
    completed: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("news storyline announce cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(announcePublishedStorylinesFromDb).not.toHaveBeenCalled();
  });

  it("runs the batched announcer and can be called again", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; sent: number };
    expect(body.success).toBe(true);
    expect(body.sent).toBe(0);
    expect(announcePublishedStorylinesFromDb).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toMatch(/@/);
  });
});
