import { describe, expect, it, vi } from "vitest";
import { createLessonVersionRegistry } from "./lesson-versions";
import { createVersionedWriter } from "./versioned-writer";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";
const T3 = "2026-01-01T00:00:03.000Z";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush pending promise callbacks. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** The version the writer's next save would send. */
async function nextExpected(writer: ReturnType<typeof createVersionedWriter>) {
  let seen = "";
  await writer.run(async (expected) => {
    seen = expected;
    return expected;
  });
  return seen;
}

describe("createLessonVersionRegistry", () => {
  it("hands an open lesson the version an outline change gave it", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer);
    const result = await registry.rewrite(async () => ({
      ok: true,
      lessons: [
        { id: 21, updatedAt: T2 },
        { id: 22, updatedAt: T2 },
      ],
    }));
    expect(result.lessons).toHaveLength(2);
    expect(await nextExpected(writer)).toBe(T2);
  });

  it("waits for a save in flight, then applies the new version after it", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer);
    const save = deferred<string>();
    const saving = writer.run(() => save.promise);

    const write = vi.fn(async () => ({ lessons: [{ id: 21, updatedAt: T2 }] }));
    const rewriting = registry.rewrite(write);
    await settle();
    // The outline change is not sent while the lesson's save is in flight:
    // the two would race on the server.
    expect(write).not.toHaveBeenCalled();

    save.resolve(T1);
    await saving;
    await rewriting;
    expect(write).toHaveBeenCalledTimes(1);
    // The save's version (T1) came first; the outline change's (T2) wins.
    expect(await nextExpected(writer)).toBe(T2);
  });

  it("holds a save asked for during the outline change until it is done", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer);
    const server = deferred<{ lessons: { id: number; updatedAt: string }[] }>();
    const rewriting = registry.rewrite(() => server.promise);
    await settle();

    const save = vi.fn(async (expected: string) => {
      expect(expected).toBe(T2);
      return T3;
    });
    const saving = writer.run(save);
    await settle();
    expect(save).not.toHaveBeenCalled();

    server.resolve({ lessons: [{ id: 21, updatedAt: T2 }] });
    await rewriting;
    await saving;
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps the version when the outline change fails, and reports the failure", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer);
    const failure = new Error("LESSON_SET_MISMATCH");
    await expect(registry.rewrite(() => Promise.reject(failure))).rejects.toBe(
      failure,
    );
    expect(await nextExpected(writer)).toBe(T0);
  });

  it("leaves lessons the change did not touch on their own version", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer);
    await registry.rewrite(async () => ({
      lessons: [{ id: 22, updatedAt: T2 }],
    }));
    expect(await nextExpected(writer)).toBe(T0);
  });

  it("still reaches a closed lesson whose last save is in flight", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    const unregister = registry.register(21, writer);
    const lastSave = deferred<string>();
    const saving = writer.run(() => lastSave.promise);
    unregister();
    const write = vi.fn(async () => ({ lessons: [{ id: 21, updatedAt: T2 }] }));
    const rewriting = registry.rewrite(write);
    await settle();
    expect(write).not.toHaveBeenCalled();
    lastSave.resolve(T1);
    await saving;
    await rewriting;
    expect(await nextExpected(writer)).toBe(T2);
  });

  it("forgets a closed lesson once its saves have settled", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer)();
    await settle();
    const run = vi.spyOn(writer, "run");
    await registry.rewrite(async () => ({
      lessons: [{ id: 21, updatedAt: T2 }],
    }));
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps a lesson registered again right after closing (React's double mount)", async () => {
    const registry = createLessonVersionRegistry();
    const writer = createVersionedWriter(T0);
    registry.register(21, writer)();
    registry.register(21, writer);
    await settle();
    await registry.rewrite(async () => ({
      lessons: [{ id: 21, updatedAt: T2 }],
    }));
    expect(await nextExpected(writer)).toBe(T2);
  });
});
