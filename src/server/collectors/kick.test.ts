import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  environment: "test",

  appUrl: undefined as string | undefined,
  callbacks: [] as (() => Promise<void>)[],
  tick: vi.fn(),
  deps: { source: "test dependencies" },
}));

vi.mock("@/env", () => ({
  env: {
    get NODE_ENV() {
      return h.environment;
    },
    get NEXT_PUBLIC_APP_URL() {
      return h.appUrl;
    },
  },
}));
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => h.callbacks.push(callback),
}));
vi.mock("./executor", () => ({ runWorkerTick: h.tick }));
vi.mock("./live", () => ({ liveExecutorDeps: () => h.deps }));

import { kickCollectorWorker, workerUrl } from "./kick";

beforeEach(() => {
  vi.clearAllMocks();
  h.environment = "test";

  h.appUrl = undefined;
  h.callbacks = [];
  h.tick.mockResolvedValue({ executed: 0 });
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("local collector worker", () => {
  it("takes another tick when earlier queued runs used up the first tick", async () => {
    h.environment = "development";
    h.tick
      .mockResolvedValueOnce({ executed: 1 })
      .mockResolvedValueOnce({ executed: 2 });
    kickCollectorWorker();
    await h.callbacks[0]!();
    expect(h.tick).toHaveBeenCalledTimes(3);
  });

  it("starts after the response without a rollout flag, app URL or cron secret", async () => {
    vi.stubEnv("FEATURE_COLLECTORS", "off");
    h.environment = "development";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    kickCollectorWorker();
    expect(h.callbacks).toHaveLength(1);
    expect(h.tick).not.toHaveBeenCalled();
    await h.callbacks[0]!();
    expect(h.tick).toHaveBeenCalledWith(h.deps);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps local runs on the local process even if an app URL points to production", async () => {
    h.environment = "development";
    h.appUrl = "https://www.aitcommunity.org";
    vi.stubEnv("CRON_SECRET", "test-secret");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    kickCollectorWorker();
    expect(h.callbacks).toHaveLength(1);
    await h.callbacks[0]!();
    expect(h.tick).toHaveBeenCalledWith(h.deps);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a failed local tick without rejecting the completed start request", async () => {
    h.environment = "development";
    h.tick.mockRejectedValue(new Error("worker failed"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    kickCollectorWorker();
    expect(h.callbacks).toHaveLength(1);
    await expect(h.callbacks[0]!()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "[collectors] local worker tick failed",
      expect.any(Error),
    );
  });
});

describe("deployed collector worker", () => {
  it("keeps the authenticated HTTP wake-up outside local development", async () => {
    h.environment = "production";
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "app.example");
    vi.stubEnv("CRON_SECRET", "test-secret");
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetch);
    kickCollectorWorker();
    expect(h.callbacks).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    await h.callbacks[0]!();
    expect(fetch).toHaveBeenCalledWith(
      "https://app.example/api/cron/collector-worker",
      {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(h.tick).not.toHaveBeenCalled();
  });

  it("reports a missing wake-up configuration without exposing secrets", () => {
    h.environment = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    kickCollectorWorker();
    expect(h.callbacks).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      "[collectors] worker wake-up skipped: CRON_SECRET or worker URL is not configured",
    );
  });

  it.each([401, 500])(
    "reports HTTP %s instead of silently dropping a failed wake-up",
    async (status) => {
      h.environment = "production";
      h.appUrl = "https://app.example";
      vi.stubEnv("CRON_SECRET", "test-secret");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      kickCollectorWorker();
      await h.callbacks[0]!();
      expect(warn).toHaveBeenCalledWith("[collectors] worker wake-up refused", {
        status,
      });
    },
  );

  it("reports a network failure without rejecting the completed start request", async () => {
    h.environment = "production";
    h.appUrl = "https://app.example";
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    kickCollectorWorker();
    await expect(h.callbacks[0]!()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[collectors] worker wake-up failed; the cron will retry queued work",
    );
  });
});

const PATH = "/api/cron/collector-worker";

describe("workerUrl", () => {
  it("uses the production domain in production", () => {
    expect(
      workerUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "aitcommunity.org",
        VERCEL_URL: "aitcom-abc123.vercel.app",
        NEXT_PUBLIC_APP_URL: "https://app.example",
      }),
    ).toBe(`https://aitcommunity.org${PATH}`);
  });

  it("uses the deployment URL outside production", () => {
    expect(
      workerUrl({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "aitcommunity.org",
        VERCEL_URL: "aitcom-abc123.vercel.app",
      }),
    ).toBe(`https://aitcom-abc123.vercel.app${PATH}`);
  });

  it("uses the deployment URL in production when no production domain is set", () => {
    expect(
      workerUrl({
        VERCEL_ENV: "production",
        VERCEL_URL: "aitcom-abc123.vercel.app",
      }),
    ).toBe(`https://aitcom-abc123.vercel.app${PATH}`);
  });

  it("falls back to the app URL off Vercel", () => {
    expect(workerUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(
      `http://localhost:3000${PATH}`,
    );
  });

  it("gives no target when nothing is configured", () => {
    expect(workerUrl({})).toBeNull();
  });
});
