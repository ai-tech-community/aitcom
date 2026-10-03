import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runWorkerTick, collectorsEnabled, afterCallbacks } = vi.hoisted(() => ({
  runWorkerTick: vi.fn(),
  collectorsEnabled: vi.fn(),
  afterCallbacks: [] as (() => Promise<void>)[],
}));

vi.mock("@/server/collectors/executor", () => ({ runWorkerTick }));
vi.mock("@/server/collectors/live", () => ({ liveExecutorDeps: () => ({}) }));
vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

import { GET, POST } from "./route";

function req(method: string, auth?: string) {
  return new Request("https://x.test/api/cron/collector-worker", {
    method,
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.stubEnv("CRON_SECRET", "s3cret");
  collectorsEnabled.mockReturnValue(true);
  runWorkerTick.mockResolvedValue({ executed: 2 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("collector worker route", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await GET(req("GET", "Bearer nope"))).status).toBe(401);
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("GET", "Bearer "))).status).toBe(401);
    expect((await GET(req("GET", "Bearer undefined"))).status).toBe(401);
    expect((await POST(req("POST", "Bearer undefined"))).status).toBe(401);
  });

  it("does nothing while the feature is off", async () => {
    collectorsEnabled.mockReturnValue(false);
    const res = await GET(req("GET", "Bearer s3cret"));
    expect(await res.json()).toMatchObject({ skipped: "collectors off" });
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("GET runs a tick and reports it", async () => {
    const res = await GET(req("GET", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, executed: 2 });
  });

  it("GET reports a failed tick as 500", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    runWorkerTick.mockRejectedValue(new Error("db down"));
    expect((await GET(req("GET", "Bearer s3cret"))).status).toBe(500);
    expect(logged).toHaveBeenCalledWith(
      "[collector-worker] tick failed",
      expect.any(Error),
    );
    logged.mockRestore();
  });

  it("POST answers at once and runs the tick after the response", async () => {
    const res = await POST(req("POST", "Bearer s3cret"));
    expect(res.status).toBe(202);
    expect(runWorkerTick).not.toHaveBeenCalled();
    await afterCallbacks[0]!();
    expect(runWorkerTick).toHaveBeenCalledTimes(1);
  });
});
