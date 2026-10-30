import { describe, expect, it } from "vitest";

import { createPerUserLimit } from "./per-user-window";

describe("createPerUserLimit", () => {
  it("forgets windows that have ended", () => {
    let now = 0;
    const check = createPerUserLimit({
      windowMs: 60_000,
      max: 1,
      now: () => now,
    });
    for (let i = 0; i < 1_001; i++) check(`ip-${i}`);
    expect(check.size()).toBe(1_001);
    now = 60_001;
    check("next");
    expect(check.size()).toBe(1);
    expect(check("ip-0").allowed).toBe(true);
    expect(check.size()).toBe(2);
  });

  it("allows up to the limit per member, then says when to retry", () => {
    let now = 0;
    const check = createPerUserLimit({
      windowMs: 60_000,
      max: 2,
      now: () => now,
    });
    expect(check("a")).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSecs: 0,
    });
    expect(check("a")).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSecs: 0,
    });
    now = 15_000;
    expect(check("a")).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSecs: 45,
    });
    expect(check("b").allowed).toBe(true);
    now = 60_001;
    expect(check("a").allowed).toBe(true);
  });
});
