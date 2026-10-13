import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitConfiguredNewsItem = vi.hoisted(() => vi.fn());

vi.mock("@/server/news/submit", () => ({
  submitConfiguredNewsItem,
}));

import { POST } from "./route";

function req(body: unknown, auth?: string) {
  return new Request("https://www.aitcommunity.org/api/news/items", {
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
  submitConfiguredNewsItem.mockResolvedValue({
    ok: true,
    inserted: true,
    url: "https://example.com/story",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/news/items", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await POST(req({}))).status).toBe(401);
    expect((await POST(req({}, "Bearer nope"))).status).toBe(401);
    expect(submitConfiguredNewsItem).not.toHaveBeenCalled();
  });

  it("stores a story for the bot caller", async () => {
    const res = await POST(
      req(
        {
          url: "https://example.com/story",
          title: "Headline",
          source: "Example",
          published_at: "2026-10-13T12:00:00.000Z",
          summary: "The excerpt.",
        },
        "Bearer s3cret",
      ),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      inserted: true,
      url: "https://example.com/story",
    });
  });

  it("returns the existing row when the URL was already stored", async () => {
    submitConfiguredNewsItem.mockResolvedValue({
      ok: true,
      inserted: false,
      url: "https://example.com/story",
    });
    const res = await POST(req({}, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ inserted: false });
  });
});
