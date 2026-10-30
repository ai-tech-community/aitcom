// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  record: vi.fn(),
  getSession: vi.fn(),
  payload: vi.fn(),
  limit: vi.fn(),
  env: { BETTER_AUTH_SECRET: "test-secret" },
  db: {},
}));
vi.mock("@/env", () => ({ env: fake.env }));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: fake.getSession } },
}));
vi.mock("@/server/db", () => ({ db: fake.db }));
vi.mock("@/server/payload", () => ({ getPayloadClient: fake.payload }));
vi.mock("@/server/magazines/stats/reading-time", () => ({
  recordReadingTimeFor: fake.record,
}));
vi.mock("@/server/rate-limit/per-user-window", () => ({
  createPerUserLimit: () => fake.limit,
}));
import { POST } from "./route";
const input = {
  sessionId: "788c43e9-bdc4-4e72-818e-f7fd0878b632",
  issueId: 7,
  articleId: 11,
  activeSeconds: 45,
};
const request = (body: unknown = input, headers: Record<string, string> = {}) =>
  new Request("https://example.org/api/magazine-reading-time", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.org",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  fake.env.BETTER_AUTH_SECRET = "test-secret";
  fake.getSession.mockResolvedValue(null);
  fake.payload.mockResolvedValue({ marker: "payload" });
  fake.limit.mockReturnValue({ allowed: true });
  fake.record.mockResolvedValue(true);
});
describe("reading-time endpoint", () => {
  it.each([null, { user: { id: "u1" } }])(
    "uses server identity for anonymous and signed-in readers",
    async (session) => {
      fake.getSession.mockResolvedValue(session);
      const res = await POST(request({ ...input, viewerId: "untrusted" }));
      expect(await res.json()).toEqual({ recorded: true });
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(fake.record).toHaveBeenCalledWith(
        { db: fake.db, payload: { marker: "payload" } },
        { ...input, viewerId: session?.user.id ?? null, now: expect.any(Date) },
      );
    },
  );
  it.each([
    { ...input, activeSeconds: -1 },
    { ...input, activeSeconds: 7201 },
    { ...input, activeSeconds: 1.2 },
    { ...input, sessionId: "bad" },
    { ...input, issueId: 0 },
    { ...input, articleId: -1 },
  ])(
    "rejects malformed or unbounded input before loading access",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(fake.getSession).not.toHaveBeenCalled();
      expect(fake.record).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin, non-JSON and malformed JSON requests", async () => {
    expect(
      (await POST(request(input, { origin: "https://other.org" }))).status,
    ).toBe(403);
    expect(
      (await POST(request(input, { "sec-fetch-site": "cross-site" }))).status,
    ).toBe(403);
    expect(
      (await POST(request(input, { "content-type": "text/plain" }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request("https://example.org/api/magazine-reading-time", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(fake.record).not.toHaveBeenCalled();
  });
  it("honors rate limiting and disabled statistics before loading Payload", async () => {
    fake.limit.mockReturnValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    fake.env.BETTER_AUTH_SECRET = " ";
    expect(await (await POST(request())).json()).toEqual({ recorded: false });
    expect(fake.payload).not.toHaveBeenCalled();
  });
  it("returns refusal and unavailable status without exposing failure details", async () => {
    fake.record.mockResolvedValueOnce(false);
    expect(await (await POST(request())).json()).toEqual({ recorded: false });
    fake.record.mockRejectedValueOnce(new Error("private content details"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ recorded: false });
  });
});
