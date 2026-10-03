// @vitest-environment node
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HTML_EXTRACT_BUNDLE } from "../src/server/collectors/extract/sandbox-paths";
import type {
  ExtractSpec,
  WorkerMessage,
  WorkerRequest,
} from "../src/server/collectors/extract/protocol";

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..");

let buildDir: string;
let isolatedDir: string;
let worker: Worker;

function nextMessage(target: Worker): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: WorkerMessage) => {
      target.off("error", onError);
      resolve(message);
    };
    const onError = (error: Error) => {
      target.off("message", onMessage);
      reject(error);
    };
    target.once("message", onMessage);
    target.once("error", onError);
  });
}

beforeAll(async () => {
  buildDir = await mkdtemp(path.join(tmpdir(), "html-extract-build-"));
  const outfile = path.join(buildDir, "html-extract.bundle.cjs");
  await run(
    process.execPath,
    ["scripts/build-workers.mjs", "--outfile", outfile],
    { cwd: repoRoot },
  );

  // Copy the bundle somewhere no node_modules is reachable, so a passing
  // test proves the bundle is self-contained.
  isolatedDir = await mkdtemp(path.join(tmpdir(), "html-extract-isolated-"));
  const isolated = path.join(isolatedDir, "html-extract.bundle.cjs");
  await copyFile(outfile, isolated);

  worker = new Worker(isolated);
  const first = await nextMessage(worker);
  expect(first).toEqual({ type: "ready" });
}, 60_000);

afterAll(async () => {
  await worker?.terminate();
  await rm(buildDir, { recursive: true, force: true });
  await rm(isolatedDir, { recursive: true, force: true });
});

describe("html-extract worker bundle", () => {
  it("extracts rows from a page", async () => {
    const spec: ExtractSpec = {
      baseUrl: "https://example.com/list",
      itemSelector: "li.item",
      fields: [
        { name: "title", selector: "a" },
        { name: "link", selector: "a", attribute: "href" },
      ],
    };
    const html =
      '<ul><li class="item"><a href="/a">  First  </a></li>' +
      '<li class="item"><a href="https://other.example/b">Second</a></li></ul>';

    const reply = nextMessage(worker);
    worker.postMessage({ id: 1, html, spec } satisfies WorkerRequest);

    expect(await reply).toEqual({
      id: 1,
      ok: true,
      result: {
        rows: [
          { title: "First", link: "https://example.com/a" },
          { title: "Second", link: "https://other.example/b" },
        ],
        nextUrl: null,
        truncated: false,
      },
    });
  });

  it("refuses a selector outside the allowlist", async () => {
    const spec: ExtractSpec = {
      baseUrl: "https://example.com/list",
      itemSelector: "div:has(p)",
      fields: [{ name: "text", selector: "p" }],
    };

    const reply = nextMessage(worker);
    worker.postMessage({
      id: 2,
      html: "<div><p>x</p></div>",
      spec,
    } satisfies WorkerRequest);

    expect(await reply).toEqual({
      id: 2,
      ok: false,
      code: "selector_not_allowed",
    });
  });
});

describe("html-extract worker message handling", () => {
  const validSpec: ExtractSpec = {
    baseUrl: "https://example.com/",
    itemSelector: "p",
    fields: [{ name: "text", selector: "b" }],
  };

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "hello"],
    ["an empty object", {}],
    ["an object with a non-numeric id", { id: "3", html: "", spec: validSpec }],
  ])("drops %s without a reply and keeps answering", async (_label, junk) => {
    const replies: WorkerMessage[] = [];
    const collect = (message: WorkerMessage) => replies.push(message);
    worker.on("message", collect);
    try {
      worker.postMessage(junk);
      const reply = nextMessage(worker);
      worker.postMessage({
        id: 10,
        html: "<p><b>ok</b></p>",
        spec: validSpec,
      } satisfies WorkerRequest);

      const answer = await reply;
      expect(answer).toEqual({
        id: 10,
        ok: true,
        result: { rows: [{ text: "ok" }], nextUrl: null, truncated: false },
      });
      expect(replies).toEqual([answer]);
    } finally {
      worker.off("message", collect);
    }
  });

  it("answers extract_failed when extraction throws a non-ExtractError", async () => {
    const reply = nextMessage(worker);
    worker.postMessage({ id: 11, html: 42, spec: validSpec });

    expect(await reply).toEqual({ id: 11, ok: false, code: "extract_failed" });
  });

  it("answers extract_failed when the spec is missing", async () => {
    const reply = nextMessage(worker);
    worker.postMessage({ id: 12, html: "<p></p>" });

    expect(await reply).toEqual({ id: 12, ok: false, code: "extract_failed" });
  });
});

describe("worker bundle tracing", () => {
  it("ships the bundle with the collector worker route", async () => {
    const config = await readFile(
      path.join(repoRoot, "next.config.js"),
      "utf8",
    );
    const match =
      /outputFileTracingIncludes:\s*\{\s*"\/api\/cron\/collector-worker":\s*\[\s*"([^"]+)"\s*,?\s*\]/.exec(
        config,
      );

    expect(match?.[1]).toBe("./workers/dist/html-extract.bundle.cjs");
    expect(match?.[1]).toBe(`./${HTML_EXTRACT_BUNDLE}`);
  });
});
