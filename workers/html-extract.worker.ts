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

/**
 * A message the worker can answer: an object with a numeric `id`. Anything
 * else has no id to reply to, so it is dropped without a reply or a throw. A
 * request with an id but a broken `html` or `spec` still gets an answer,
 * because it fails inside the try below.
 */
function hasRequestId(message: unknown): message is { id: number } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { id?: unknown }).id === "number"
  );
}

port.on("message", (message: unknown) => {
  if (!hasRequestId(message)) return;
  const { id } = message;
  try {
    const { html, spec } = message as WorkerRequest;
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
