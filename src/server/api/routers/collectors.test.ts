import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  facade: {
    listCollectors: vi.fn(),
    listRuns: vi.fn(),
    usage: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    listItems: vi.fn(),
    listPresets: vi.fn(),
    listTitles: vi.fn(),
    recognize: vi.fn(),
  },
}));

vi.mock("@/server/collectors/flags", () => ({
  collectorsEnabled: () => h.enabled,
}));
vi.mock("@/server/collectors/live", () => ({
  liveCollectorRuns: () => h.facade,
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));

import { createCaller } from "@/server/api/root";

function caller(userId: string | null = "user-1") {
  return createCaller({
    db: {},
    session: userId ? ({ user: { id: userId } } as never) : null,
    headers: new Headers(),
  } as never);
}

const run = { id: "run-1", status: "running", stopReason: null };

beforeEach(() => {
  vi.clearAllMocks();
  // The shared tRPC timing middleware logs every call; keep test output clean.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  h.enabled = true;
  h.facade.listCollectors.mockReturnValue([{ id: "feed-items" }]);
  h.facade.listRuns.mockResolvedValue({ runs: [run], nextCursor: null });
  h.facade.usage.mockResolvedValue({ runsToday: 1, runsPerDay: 20 });
  h.facade.startRun.mockResolvedValue({ ok: true, runId: "run-2" });
  h.facade.getRun.mockResolvedValue(run);
  h.facade.listItems.mockResolvedValue({ items: [], nextSeq: null });
  h.facade.listPresets.mockReturnValue([{ id: "feed" }]);
  h.facade.listTitles.mockReturnValue({
    presets: { feed: "Nieuws- of blogfeed" },
    collectors: { "feed-items": "Feeditems" },
  });
  h.facade.recognize.mockReturnValue({
    ok: true,
    presetId: "custom-page",
    matched: false,
    prefill: { url: "https://e.com/" },
  });
});

describe("collectors router", () => {
  it("requires a signed-in member", async () => {
    await expect(
      caller(null).collectors.overview({ locale: "en" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it.each([
    [
      "overview",
      (c: ReturnType<typeof caller>) => c.collectors.overview({ locale: "en" }),
    ],
    [
      "start",
      (c: ReturnType<typeof caller>) =>
        c.collectors.start({
          collectorId: "feed-items",
          input: {},
          acknowledged: true,
        }),
    ],
    [
      "run",
      (c: ReturnType<typeof caller>) => c.collectors.run({ runId: "run-1" }),
    ],
    ["runs", (c: ReturnType<typeof caller>) => c.collectors.runs({})],
    [
      "items",
      (c: ReturnType<typeof caller>) => c.collectors.items({ runId: "run-1" }),
    ],
    [
      "recognize",
      (c: ReturnType<typeof caller>) =>
        c.collectors.recognize({ address: "e.com" }),
    ],
  ])("%s is not found while the feature is off", async (_name, call) => {
    h.enabled = false;
    await expect(call(caller())).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "COLLECTORS_OFF",
    });
    for (const [method, fn] of Object.entries(h.facade)) {
      expect(fn, method).not.toHaveBeenCalled();
    }
  });

  it("overview combines collectors, presets, titles, the last five runs, usage and the first-use flag", async () => {
    const result = await caller().collectors.overview({ locale: "nl" });
    expect(h.facade.listCollectors).toHaveBeenCalledWith("nl");
    expect(h.facade.listPresets).toHaveBeenCalledWith("nl");
    expect(h.facade.listTitles).toHaveBeenCalledWith("nl");
    expect(h.facade.listRuns).toHaveBeenCalledWith("user-1", { limit: 5 });
    expect(h.facade.usage).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      collectors: [{ id: "feed-items" }],
      presets: [{ id: "feed" }],
      titles: {
        presets: { feed: "Nieuws- of blogfeed" },
        collectors: { "feed-items": "Feeditems" },
      },
      recentRuns: [run],
      usage: { runsToday: 1, runsPerDay: 20 },
      needsAcknowledgement: false,
    });
  });

  it("recognises a pasted address through the facade", async () => {
    await expect(
      caller().collectors.recognize({ address: "e.com" }),
    ).resolves.toEqual({
      ok: true,
      presetId: "custom-page",
      matched: false,
      prefill: { url: "https://e.com/" },
    });
    expect(h.facade.recognize).toHaveBeenCalledWith("e.com");
  });

  it("refuses absurdly long text before it reaches the facade", async () => {
    await expect(
      caller().collectors.recognize({ address: "x".repeat(4_097) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.facade.recognize).not.toHaveBeenCalled();
  });

  it("asks a first-time member to acknowledge", async () => {
    h.facade.listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    expect(
      (await caller().collectors.overview({ locale: "en" }))
        .needsAcknowledgement,
    ).toBe(true);
    await expect(
      caller().collectors.start({
        collectorId: "feed-items",
        input: { url: "https://e.com/f" },
        acknowledged: false,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "ACKNOWLEDGEMENT_REQUIRED",
    });
    expect(h.facade.startRun).not.toHaveBeenCalled();
  });

  it("starts a web run for the signed-in member and returns the facade's answer", async () => {
    const input = { url: "https://e.com/f" };
    const result = await caller().collectors.start({
      collectorId: "feed-items",
      input,
      acknowledged: false,
    });
    expect(h.facade.startRun).toHaveBeenCalledWith({
      userId: "user-1",
      origin: "web",
      collectorId: "feed-items",
      input,
    });
    expect(result).toEqual({ ok: true, runId: "run-2" });
  });

  it("starts an acknowledged first run without looking up earlier runs", async () => {
    h.facade.listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    const result = await caller().collectors.start({
      collectorId: "feed-items",
      input: { url: "https://e.com/f" },
      acknowledged: true,
    });
    expect(h.facade.listRuns).not.toHaveBeenCalled();
    expect(h.facade.startRun).toHaveBeenCalledWith({
      userId: "user-1",
      origin: "web",
      collectorId: "feed-items",
      input: { url: "https://e.com/f" },
    });
    expect(result).toEqual({ ok: true, runId: "run-2" });
  });

  it("passes a quota refusal through instead of throwing", async () => {
    h.facade.startRun.mockResolvedValue({
      ok: false,
      reason: "quota",
      quotaReason: "daily_limit",
      message: "x",
      retryAt: "2026-10-04T11:00:00.000Z",
    });
    await expect(
      caller().collectors.start({
        collectorId: "feed-items",
        input: {},
        acknowledged: true,
      }),
    ).resolves.toMatchObject({ reason: "quota", quotaReason: "daily_limit" });
  });

  it("hides another member's run as not found", async () => {
    h.facade.getRun.mockResolvedValue(null);
    h.facade.listItems.mockResolvedValue(null);
    await expect(
      caller("user-2").collectors.run({ runId: "run-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
    await expect(
      caller("user-2").collectors.items({ runId: "run-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
    expect(h.facade.getRun).toHaveBeenCalledWith("user-2", "run-1");
  });

  it("pages the history and the rows for the signed-in member", async () => {
    await caller().collectors.runs({ cursor: "c1", limit: 20 });
    expect(h.facade.listRuns).toHaveBeenCalledWith("user-1", {
      cursor: "c1",
      limit: 20,
    });
    await caller().collectors.items({
      runId: "run-1",
      afterSeq: 49,
      limit: 50,
    });
    expect(h.facade.listItems).toHaveBeenCalledWith("user-1", "run-1", {
      afterSeq: 49,
      limit: 50,
    });
  });
});
