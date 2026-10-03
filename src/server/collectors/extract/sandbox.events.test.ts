// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractError, type ExtractSpec } from "./protocol";

/*
 * The sandbox's reactions to worker events that the real bundle cannot be
 * made to produce on demand (a reply that fails to deserialize, a terminate
 * that rejects, an idle worker that exits). A fake Worker stands in; the
 * real-bundle behaviour lives in sandbox.test.ts.
 */

class FakeWorker extends EventEmitter {
  readonly posted: unknown[] = [];
  readonly terminate = vi.fn(async () => 0);

  constructor(
    readonly path: string,
    readonly options: unknown,
  ) {
    super();
    workers.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  unref(): void {}
}

const workers: FakeWorker[] = [];

vi.mock("node:worker_threads", () => ({ Worker: FakeWorker }));

const { createExtractSandbox } = await import("./sandbox");

const spec: ExtractSpec = {
  baseUrl: "https://example.com/list",
  itemSelector: "li",
  fields: [{ name: "title", selector: "a" }],
};

const emptyResult = {
  rows: [],
  nextUrl: null,
  nextUrlTooLong: false,
  truncated: false,
};

/** Lets queued promise callbacks and microtasks run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
}

async function rejection(promise: Promise<unknown>): Promise<ExtractError> {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to reject");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ExtractError);
  return error as ExtractError;
}

/** The worker started for the latest call, once it has the request. */
async function startedWorker(): Promise<FakeWorker> {
  await settle();
  const worker = workers.at(-1);
  if (!worker) throw new Error("no worker started");
  worker.emit("message", { type: "ready" });
  await settle();
  return worker;
}

function lastRequestId(worker: FakeWorker): number {
  return (worker.posted.at(-1) as { id: number }).id;
}

afterEach(() => {
  workers.length = 0;
  vi.useRealTimers();
});

describe("createExtractSandbox (worker events)", () => {
  it("passes only the worker settings to the worker, not the deadline", async () => {
    const box = createExtractSandbox({
      workerPath: "/w.cjs",
      deadlineMs: 1_234,
      maxOldGenerationSizeMb: 64,
    });
    const call = box.extract("<li></li>", spec);
    const worker = await startedWorker();
    worker.emit("message", {
      id: lastRequestId(worker),
      ok: true,
      result: emptyResult,
    });
    await call;

    expect(worker.path).toBe("/w.cjs");
    expect(worker.options).toEqual({
      execArgv: undefined,
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
  });

  it("fails the call with extract_failed when a reply cannot be read", async () => {
    const box = createExtractSandbox({ workerPath: "/w.cjs" });
    const call = box.extract("<li></li>", spec);
    const worker = await startedWorker();

    worker.emit("messageerror", new Error("could not deserialize"));

    expect((await rejection(call)).code).toBe("extract_failed");
  });

  it("still says page_too_slow when ending the slow worker fails", async () => {
    const box = createExtractSandbox({ workerPath: "/w.cjs", deadlineMs: 50 });
    const call = box.extract("<li></li>", spec);
    const worker = await startedWorker();
    worker.terminate.mockRejectedValueOnce(new Error("terminate failed"));

    expect((await rejection(call)).code).toBe("page_too_slow");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("says page_too_complex when the worker runs out of memory", async () => {
    const box = createExtractSandbox({ workerPath: "/w.cjs" });
    const call = box.extract("<li></li>", spec);
    const worker = await startedWorker();

    worker.emit(
      "error",
      Object.assign(new Error("JS heap out of memory"), {
        code: "ERR_WORKER_OUT_OF_MEMORY",
      }),
    );
    worker.emit("exit", 1);

    expect((await rejection(call)).code).toBe("page_too_complex");
  });

  it("keeps extract_failed for a worker that crashes another way", async () => {
    const box = createExtractSandbox({ workerPath: "/w.cjs" });
    const call = box.extract("<li></li>", spec);
    const worker = await startedWorker();

    worker.emit("error", new Error("boom"));
    worker.emit("exit", 1);

    expect((await rejection(call)).code).toBe("extract_failed");
  });

  it("starts a fresh worker when the last one died while idle", async () => {
    const box = createExtractSandbox({ workerPath: "/w.cjs" });
    const first = box.extract("<li></li>", spec);
    const idle = await startedWorker();
    idle.emit("message", {
      id: lastRequestId(idle),
      ok: true,
      result: emptyResult,
    });
    await first;

    idle.emit("exit", 1);
    const second = box.extract("<li></li>", spec);
    const fresh = await startedWorker();
    fresh.emit("message", {
      id: lastRequestId(fresh),
      ok: true,
      result: emptyResult,
    });

    await expect(second).resolves.toEqual(emptyResult);
    expect(fresh).not.toBe(idle);
    expect(idle.posted).toHaveLength(1);
  });
});
