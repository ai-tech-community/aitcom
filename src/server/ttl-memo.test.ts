import { describe, expect, it, vi } from "vitest";
import { createTtlMemo } from "./ttl-memo";

describe("createTtlMemo", () => {
  it("shares one in-flight load between concurrent callers", async () => {
    const memo = createTtlMemo<string, number>(1000, () => 0);
    const load = vi.fn(() => Promise.resolve(7));
    const [a, b] = await Promise.all([
      memo.get("k", load),
      memo.get("k", load),
    ]);
    expect([a, b]).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("serves the value until it expires, then reloads", async () => {
    let t = 0;
    const memo = createTtlMemo<string, number>(1000, () => t);
    let n = 0;
    const load = () => Promise.resolve(++n);
    expect(await memo.get("k", load)).toBe(1);
    t = 999;
    expect(await memo.get("k", load)).toBe(1);
    t = 1000;
    expect(await memo.get("k", load)).toBe(2);
  });

  it("keeps keys apart", async () => {
    const memo = createTtlMemo<string, string>(1000, () => 0);
    expect(await memo.get("en", () => Promise.resolve("en"))).toBe("en");
    expect(await memo.get("nl", () => Promise.resolve("nl"))).toBe("nl");
  });

  it("does not keep a failed load", async () => {
    const memo = createTtlMemo<string, number>(1000, () => 0);
    await expect(
      memo.get("k", () => Promise.reject(new Error("down"))),
    ).rejects.toThrow("down");
    expect(await memo.get("k", () => Promise.resolve(3))).toBe(3);
  });
});
