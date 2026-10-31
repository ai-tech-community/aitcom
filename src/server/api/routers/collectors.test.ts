import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  access: vi.fn(),
  setAccess: vi.fn(),
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

vi.mock("@/server/collectors/agent-permission", () => ({
  collectorAgentAccess: h.access,
  setCollectorAgentAccess: h.setAccess,
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

function caller(
  userId: string | null = "user-1",
  role = "user",
  db: unknown = {},
) {
  return createCaller({
    db,
    session: userId ? ({ user: { id: userId, role } } as never) : null,
    headers: new Headers(),
  } as never);
}

const run = { id: "run-1", status: "running", stopReason: null };

beforeEach(() => {
  vi.clearAllMocks();
  // The shared tRPC timing middleware logs every call; keep test output clean.
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  h.access.mockResolvedValue({ hasKey: true, allowed: false });
  h.setAccess.mockResolvedValue(true);
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
      canManageOptOuts: false,
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
        presetId: "feed",
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
      presetId: "feed",
      input,
      acknowledged: false,
    });
    expect(h.facade.startRun).toHaveBeenCalledWith({
      userId: "user-1",
      origin: "web",
      presetId: "feed",
      input,
    });
    expect(result).toEqual({ ok: true, runId: "run-2" });
  });

  it("starts an acknowledged first run without looking up earlier runs", async () => {
    h.facade.listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    const result = await caller().collectors.start({
      presetId: "feed",
      input: { url: "https://e.com/f" },
      acknowledged: true,
    });
    expect(h.facade.listRuns).not.toHaveBeenCalled();
    expect(h.facade.startRun).toHaveBeenCalledWith({
      userId: "user-1",
      origin: "web",
      presetId: "feed",
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
        presetId: "feed",
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

describe("staff opt-out permissions", () => {
  it("denies every opt-out operation to ordinary members", async () => {
    for (const op of [
      () => caller().collectors.optOuts(),
      () =>
        caller().collectors.addOptOut({
          domain: "example.org",
          reason: "Owner request",
        }),
      () => caller().collectors.removeOptOut({ domain: "example.org" }),
    ]) {
      await expect(op()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("canonicalizes writes and supports listing and removing using the guarded table", async () => {
    const builder = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      where: vi.fn().mockResolvedValue(undefined),
    };
    const db = {
      select: () => builder,
      insert: () => builder,
      delete: () => builder,
    };
    const c = caller("staff", "admin", db);
    expect(
      (await c.collectors.overview({ locale: "en" })).canManageOptOuts,
    ).toBe(true);
    await c.collectors.addOptOut({
      domain: " Example.ORG. ",
      reason: " Owner request ",
    });
    expect(builder.values).toHaveBeenCalledWith({
      domain: "example.org",
      reason: "Owner request",
    });
    expect(await c.collectors.optOuts()).toEqual([]);
    await c.collectors.removeOptOut({ domain: "example.org" });
    expect(builder.where).toHaveBeenCalledOnce();
    await expect(
      c.collectors.addOptOut({
        domain: "https://example.org",
        reason: "request",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("owner collection grants", () => {
  it("uses only the signed-in owner and requires explicit rules acknowledgement", async () => {
    expect(await caller("owner").collectors.agentAccess()).toEqual({
      hasKey: true,
      allowed: false,
    });
    expect(h.access).toHaveBeenCalledWith({}, "owner");
    await expect(
      caller("owner").collectors.setAgentAccess({
        allowed: true,
        acknowledged: false,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "ACKNOWLEDGEMENT_REQUIRED",
    });
    expect(h.setAccess).not.toHaveBeenCalled();
    await caller("owner").collectors.setAgentAccess({
      allowed: true,
      acknowledged: true,
    });
    expect(h.setAccess).toHaveBeenCalledWith({}, "owner", true);
    await caller("owner").collectors.setAgentAccess({
      allowed: false,
      acknowledged: false,
    });
    expect(h.setAccess).toHaveBeenCalledWith({}, "owner", false);
  });
  it("does not grant when no existing key exists", async () => {
    h.setAccess.mockResolvedValue(false);
    await expect(
      caller().collectors.setAgentAccess({ allowed: true, acknowledged: true }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "AGENT_KEY_NOT_FOUND",
    });
  });
});
