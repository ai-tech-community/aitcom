import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runMagazineIssueJobs, getPayloadClient, db, payload } = vi.hoisted(
  () => ({
    runMagazineIssueJobs: vi.fn(),
    getPayloadClient: vi.fn(),
    db: {},
    payload: {},
  }),
);
vi.mock("@/server/magazines/issue-jobs", () => ({ runMagazineIssueJobs }));
vi.mock("@/server/payload", () => ({ getPayloadClient }));
vi.mock("@/server/db", () => ({ db }));

vi.mock("@/server/magazines/subscriptions/mail", () => ({
  defaultMagazineMailer: () => ({
    send: vi.fn(),
    recipient: (to: string) => to,
  }),
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("https://www.aitcommunity.org/api/cron/magazine-issues", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T14:00:00Z"));
  getPayloadClient.mockResolvedValue(payload);
  runMagazineIssueJobs.mockResolvedValue({
    drafted: 4,
    skipped: 2,
    published: 2,
    failed: 1,
    retried: 3,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("magazine issue cron", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer s3cret"))).status).toBe(401);
    expect(runMagazineIssueJobs).not.toHaveBeenCalled();
    expect(getPayloadClient).not.toHaveBeenCalled();
  });

  it("runs the issue jobs once and answers their counts", async () => {
    const response = await GET(req("Bearer s3cret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("@");
    expect(body).toEqual({
      success: true,
      drafted: 4,
      skipped: 2,
      published: 2,
      failed: 1,
      retried: 3,
      timestamp: "2026-10-27T14:00:00.000Z",
    });
    expect(getPayloadClient).toHaveBeenCalledOnce();
    expect(runMagazineIssueJobs).toHaveBeenCalledExactlyOnceWith(
      { db, payload },
      expect.objectContaining({
        now: new Date("2026-10-27T14:00:00Z"),
        mailer: expect.anything(),
      }),
    );
  });

  it("answers 500 when the run throws", async () => {
    const error = new Error("Run failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runMagazineIssueJobs.mockRejectedValueOnce(error);
    const response = await GET(req("Bearer s3cret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false });
    expect(log).toHaveBeenCalledWith("[magazine-issues] failed", error);
  });
});
