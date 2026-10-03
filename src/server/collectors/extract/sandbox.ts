import { Worker } from "node:worker_threads";
import {
  ExtractError,
  isExtractErrorCode,
  type ExtractResult,
  type ExtractSpec,
  type WorkerRequest,
} from "./protocol";

/** Longest one page may take, worker start-up included, before it is cut. */
export const DEFAULT_DEADLINE_MS = 5_000;
/** Heap limit of the extraction worker. */
export const DEFAULT_MAX_OLD_GENERATION_SIZE_MB = 256;

export type ExtractSandboxOptions = {
  /** File the worker runs: the pre-bundled extraction worker. */
  workerPath: string;
  /** Node flags for the worker. */
  execArgv?: string[];
  /** Per-call deadline, enforced from outside the worker. */
  deadlineMs?: number;
  /** Worker heap limit (`resourceLimits.maxOldGenerationSizeMb`). */
  maxOldGenerationSizeMb?: number;
};

export interface ExtractSandbox {
  /**
   * Extracts one page in the worker. Calls run one at a time, in call order.
   * Rejects with ExtractError: `page_too_slow` when the deadline passes,
   * `page_too_complex` when the worker runs out of memory, the worker's own
   * code when it refuses the page, `extract_failed` when the worker crashes
   * another way or the sandbox is closed.
   */
  extract(html: string, spec: ExtractSpec): Promise<ExtractResult>;
  /**
   * Ends the worker. The call in flight and calls still waiting fail with
   * `extract_failed`, as do later calls. Resolves once the worker has ended;
   * it does not wait for those calls to settle.
   */
  close(): Promise<void>;
}

/** What a worker thread is started with. */
type WorkerSettings = Pick<ExtractSandboxOptions, "workerPath" | "execArgv"> & {
  maxOldGenerationSizeMb: number;
};

/** The worker crashed, ran out of memory, or exited. */
class WorkerGone extends Error {
  constructor(
    message: string,
    /** It hit its heap limit: the page, not the code, was the problem. */
    readonly outOfMemory = false,
  ) {
    super(message);
  }
}

/** Node's code for a worker that reached `resourceLimits`. */
const OUT_OF_MEMORY = "ERR_WORKER_OUT_OF_MEMORY";

/**
 * One worker thread. It answers one request at a time; the sandbox makes sure
 * it is never asked twice at once. Any crash or exit fails the request in
 * flight and every later one, so the sandbox drops it and starts a new one.
 */
class WorkerSlot {
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private readonly gone: Promise<never>;
  private inFlight: {
    id: number;
    resolve: (result: ExtractResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(options: WorkerSettings) {
    let markReady!: () => void;
    let markGone!: (error: Error) => void;
    this.ready = new Promise<void>((resolve) => (markReady = resolve));
    this.gone = new Promise<never>((_, reject) => (markGone = reject));
    // Always observed through a race, but may settle when nobody waits.
    this.gone.catch(() => undefined);

    this.worker = new Worker(options.workerPath, {
      execArgv: options.execArgv,
      resourceLimits: {
        maxOldGenerationSizeMb: options.maxOldGenerationSizeMb,
      },
    });
    // The pending call's deadline timer keeps the process alive while a page
    // is being extracted; an idle worker must not.
    this.worker.unref();

    this.worker.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const reply = message as Record<string, unknown>;
      if (reply.type === "ready") {
        markReady();
        return;
      }
      const pending = this.inFlight;
      if (!pending || reply.id !== pending.id) return;
      this.inFlight = null;
      if (reply.ok === true) {
        pending.resolve(reply.result as ExtractResult);
      } else {
        pending.reject(
          new ExtractError(
            isExtractErrorCode(reply.code) ? reply.code : "extract_failed",
          ),
        );
      }
    });
    // A reply that cannot be deserialized never reaches "message"; fail the
    // call it answered instead of letting it run into the deadline.
    this.worker.on("messageerror", () => {
      const pending = this.inFlight;
      if (!pending) return;
      this.inFlight = null;
      pending.reject(
        new ExtractError("extract_failed", "worker reply was unreadable"),
      );
    });
    // An `error` (uncaught throw, ERR_WORKER_OUT_OF_MEMORY) is followed by
    // `exit`; whichever comes first ends the slot.
    this.worker.on("error", (error: Error & { code?: unknown }) => {
      markGone(new WorkerGone(error.message, error.code === OUT_OF_MEMORY));
    });
    this.worker.on("exit", (exitCode: number) => {
      markGone(new WorkerGone(`worker exited with code ${exitCode}`));
    });
  }

  /** Waits for the worker to start, then sends one request. */
  async request(request: WorkerRequest): Promise<ExtractResult> {
    await Promise.race([this.ready, this.gone]);
    const reply = new Promise<ExtractResult>((resolve, reject) => {
      this.inFlight = { id: request.id, resolve, reject };
    });
    this.worker.postMessage(request);
    return Promise.race([reply, this.gone]);
  }

  async terminate(): Promise<void> {
    await this.worker.terminate();
  }
}

/**
 * Runs HTML extraction in a worker thread with a heap limit and a hard
 * per-call deadline. Meant to live for one collector run: create it, call
 * `extract` per page, `close` it in a `finally`.
 *
 * The deadline is enforced from the main thread: when it passes, the worker
 * is terminated (a busy parser cannot be asked to stop) and the next call
 * starts a fresh one.
 */
export function createExtractSandbox(
  options: ExtractSandboxOptions,
): ExtractSandbox {
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const settings: WorkerSettings = {
    workerPath: options.workerPath,
    execArgv: options.execArgv,
    maxOldGenerationSizeMb:
      options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GENERATION_SIZE_MB,
  };
  let slot: WorkerSlot | null = null;
  let closed = false;
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  async function drop(target: WorkerSlot): Promise<void> {
    if (slot === target) slot = null;
    await target.terminate();
  }

  async function runOne(
    html: string,
    spec: ExtractSpec,
  ): Promise<ExtractResult> {
    if (closed) throw new ExtractError("extract_failed", "sandbox is closed");

    let current: WorkerSlot;
    try {
      current = slot ??= new WorkerSlot(settings);
    } catch {
      throw new ExtractError("extract_failed", "worker did not start");
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"deadline">((resolve) => {
      timer = setTimeout(() => resolve("deadline"), deadlineMs);
    });
    const answer = current.request({ id: nextId++, html, spec });
    // The answer may settle after the deadline has already won.
    answer.catch(() => undefined);

    try {
      const outcome = await Promise.race([answer, deadline]);
      if (outcome === "deadline") {
        // The page was too slow whatever happens to the worker now.
        await drop(current).catch(() => undefined);
        throw new ExtractError("page_too_slow");
      }
      return outcome;
    } catch (error) {
      if (error instanceof ExtractError) throw error;
      await drop(current);
      // Out of memory is deterministic for this page (too many elements for
      // the heap limit), so it gets its own code; any other crash does not.
      throw new ExtractError(
        error instanceof WorkerGone && error.outOfMemory
          ? "page_too_complex"
          : "extract_failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    extract(html, spec) {
      const call = queue.then(() => runOne(html, spec));
      queue = call.catch(() => undefined);
      return call;
    },
    async close() {
      closed = true;
      if (slot) await drop(slot);
    },
  };
}
