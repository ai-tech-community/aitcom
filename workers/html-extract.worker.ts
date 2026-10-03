import { parentPort } from "node:worker_threads";
import { extractList } from "../src/server/collectors/extract/extract-list";
import {
  ExtractError,
  type WorkerMessage,
  type WorkerRequest,
} from "../src/server/collectors/extract/protocol";

/*
 * Sandboxed HTML extraction. Bundled by scripts/build-workers.mjs into one
 * self-contained file; the main thread starts it with resource limits and a
 * per-page deadline, and ends it when the deadline passes.
 */

if (!parentPort) {
  throw new Error("html-extract worker must run in a worker thread");
}
const port = parentPort;

function send(message: WorkerMessage): void {
  port.postMessage(message);
}

port.on("message", ({ id, html, spec }: WorkerRequest) => {
  try {
    send({ id, ok: true, result: extractList(html, spec) });
  } catch (error) {
    send({
      id,
      ok: false,
      code: error instanceof ExtractError ? error.code : "extract_failed",
    });
  }
});

send({ type: "ready" });
