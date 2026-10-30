import { describe, expect, it, vi } from "vitest";
import { createVersionedWriter } from "./versioned-writer";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createVersionedWriter", () => {
  it("hands each write the version the previous write returned", async () => {
    const writer = createVersionedWriter(T0);
    const seen: string[] = [];
    await writer.run(async (expected) => {
      seen.push(expected);
      return T1;
    });
    await writer.run(async (expected) => {
      seen.push(expected);
      return T2;
    });
    expect(seen).toEqual([T0, T1]);
  });

  it("runs writes one at a time, in the order they were asked for", async () => {
    const writer = createVersionedWriter(T0);
    const first = deferred<string>();
    const second = vi.fn(async (expected: string) => {
      expect(expected).toBe(T1);
      return T2;
    });
    const a = writer.run(() => first.promise);
    const b = writer.run(second);
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    first.resolve(T1);
    await a;
    await b;
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps the old version after a failed write and still runs the next one", async () => {
    const writer = createVersionedWriter(T0);
    const failure = new Error("COURSE_CHANGED");
    await expect(writer.run(() => Promise.reject(failure))).rejects.toBe(
      failure,
    );
    const next = vi.fn(async () => T1);
    await writer.run(next);
    expect(next).toHaveBeenCalledWith(T0);
  });

  it("says when every queued write has settled, including ones queued meanwhile", async () => {
    const writer = createVersionedWriter(T0);
    const first = deferred<string>();
    const second = deferred<string>();
    void writer.run(() => first.promise);
    let idle = false;
    const whenIdle = writer.whenIdle().then(() => {
      idle = true;
    });
    void writer.run(() => second.promise).catch(() => undefined);
    first.resolve(T1);
    await Promise.resolve();
    await Promise.resolve();
    expect(idle).toBe(false);
    second.reject(new Error("offline"));
    await whenIdle;
    expect(idle).toBe(true);
  });
});
