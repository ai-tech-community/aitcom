import { describe, expect, it } from "vitest";
import { createSiteRateLimiter, memorySlotStore } from "./site-rate-limit";

function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe("site rate limiter", () => {
  it("lets the first request through and makes the next one wait a second", async () => {
    const clock = fakeClock();
    const limiter = createSiteRateLimiter(memorySlotStore(clock.now), {
      sleep: clock.sleep,
    });
    const signal = new AbortController().signal;
    await limiter.acquire("e.com", signal);
    expect(clock.now()).toBe(0);
    await limiter.acquire("e.com", signal);
    expect(clock.now()).toBe(1_000);
  });

  it("does not make different sites wait for each other", async () => {
    const clock = fakeClock();
    const limiter = createSiteRateLimiter(memorySlotStore(clock.now), {
      sleep: clock.sleep,
    });
    const signal = new AbortController().signal;
    await limiter.acquire("a.com", signal);
    await limiter.acquire("b.com", signal);
    expect(clock.now()).toBe(0);
  });

  it("treats host names case-insensitively", async () => {
    const clock = fakeClock();
    const limiter = createSiteRateLimiter(memorySlotStore(clock.now), {
      sleep: clock.sleep,
    });
    const signal = new AbortController().signal;
    await limiter.acquire("E.com", signal);
    await limiter.acquire("e.COM", signal);
    expect(clock.now()).toBe(1_000);
  });

  it("gives up when the run is aborted", async () => {
    const limiter = createSiteRateLimiter(
      memorySlotStore(() => 0),
      {
        sleep: async () => undefined,
      },
    );
    const controller = new AbortController();
    await limiter.acquire("e.com", controller.signal);
    controller.abort();
    await expect(
      limiter.acquire("e.com", controller.signal),
    ).rejects.toBeDefined();
  });
});
