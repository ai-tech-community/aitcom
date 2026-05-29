import { describe, it, expect, vi, afterEach } from "vitest";
import { checkEventImportRateLimit } from "./import-rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkEventImportRateLimit", () => {
  it("allows the first 20 calls then blocks the 21st", () => {
    const userId = `user-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      const r = checkEventImportRateLimit(userId);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkEventImportRateLimit(userId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSecs).toBeGreaterThan(0);
  });

  it("decrements remaining on each call", () => {
    const userId = `user-${Math.random()}`;
    expect(checkEventImportRateLimit(userId).remaining).toBe(19);
    expect(checkEventImportRateLimit(userId).remaining).toBe(18);
  });

  it("resets the window after it expires", () => {
    vi.useFakeTimers();
    const userId = `user-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkEventImportRateLimit(userId);
    expect(checkEventImportRateLimit(userId).allowed).toBe(false);

    vi.advanceTimersByTime(3_600_001);
    const afterReset = checkEventImportRateLimit(userId);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(19);
  });

  it("tracks users independently", () => {
    const a = `user-a-${Math.random()}`;
    const b = `user-b-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkEventImportRateLimit(a);
    expect(checkEventImportRateLimit(a).allowed).toBe(false);
    expect(checkEventImportRateLimit(b).allowed).toBe(true);
  });
});
