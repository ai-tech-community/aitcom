// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ExtractError, type ExtractSpec } from "./protocol";
import { createExtractSandbox, type ExtractSandbox } from "./sandbox";

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../../../..");

/*
 * The sandbox runs the real worker bundle, built into a temp dir. Running the
 * TS source with `execArgv: ["--import", "tsx"]` does not work: tsx's module
 * hooks do not apply to a worker's entry module (Node 20 and Node 26).
 */
let buildDir: string;
let workerPath: string;
const opened: ExtractSandbox[] = [];

function sandbox(
  options: { deadlineMs?: number; maxOldGenerationSizeMb?: number } = {},
): ExtractSandbox {
  const created = createExtractSandbox({ workerPath, ...options });
  opened.push(created);
  return created;
}

const spec: ExtractSpec = {
  baseUrl: "https://example.com/list",
  itemSelector: "li.item",
  fields: [
    { name: "title", selector: "a" },
    { name: "link", selector: "a", attribute: "href" },
  ],
};

function page(titles: string[]): string {
  return `<ul>${titles
    .map((title) => `<li class="item"><a href="/${title}">${title}</a></li>`)
    .join("")}</ul>`;
}

// Mis-nested formatting tags make parse5 re-open every tag on each `</p>`;
// 10 000 repeats take several seconds to parse.
const hostile = "<b><i><u><s><em><strong><font><nobr>x</p>".repeat(10_000);

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

beforeAll(async () => {
  buildDir = await mkdtemp(path.join(tmpdir(), "html-extract-sandbox-"));
  workerPath = path.join(buildDir, "html-extract.bundle.cjs");
  await run(
    process.execPath,
    ["scripts/build-workers.mjs", "--outfile", workerPath],
    { cwd: repoRoot },
  );
}, 60_000);

afterEach(async () => {
  await Promise.all(opened.splice(0).map((each) => each.close()));
});

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
});

describe("createExtractSandbox", () => {
  it("extracts a small page", async () => {
    const result = await sandbox().extract(page(["one", "two"]), spec);

    expect(result).toEqual({
      rows: [
        { title: "one", link: "https://example.com/one" },
        { title: "two", link: "https://example.com/two" },
      ],
      nextUrl: null,
      nextUrlTooLong: false,
      truncated: false,
    });
  });

  it("rejects a slow page with page_too_slow, then serves the next call from a fresh worker", async () => {
    const box = sandbox({ deadlineMs: 400 });
    // Warm up, so the deadline is spent on parsing, not on starting the worker.
    await box.extract(page(["warm"]), spec);

    const started = performance.now();
    const error = await rejection(box.extract(hostile, spec));
    const elapsed = performance.now() - started;

    expect(error.code).toBe("page_too_slow");
    expect(elapsed).toBeGreaterThanOrEqual(390);
    expect(elapsed).toBeLessThan(1_500);

    const next = await box.extract(page(["after"]), spec);
    expect(next.rows).toEqual([
      { title: "after", link: "https://example.com/after" },
    ]);
  });

  it("counts worker start-up against the deadline", async () => {
    // Starting a worker takes tens of milliseconds, so a 1 ms deadline passes
    // before the worker can even say it is ready.
    const box = sandbox({ deadlineMs: 1 });

    expect((await rejection(box.extract(page(["cold"]), spec))).code).toBe(
      "page_too_slow",
    );
  });

  it("does not block the main thread while a slow page is parsed", async () => {
    const box = sandbox({ deadlineMs: 2_000 });
    await box.extract(page(["warm"]), spec);

    const slow = box.extract(hostile, spec);
    const scheduled = performance.now();
    const firedAfter = await new Promise<number>((resolve) => {
      setTimeout(() => resolve(performance.now() - scheduled), 10);
    });

    expect(firedAfter).toBeLessThan(200);
    expect((await rejection(slow)).code).toBe("page_too_slow");
  });

  it("answers concurrent calls one at a time, in order", async () => {
    const box = sandbox();
    const order: string[] = [];
    const big = page(Array.from({ length: 2_000 }, (_, i) => `big${i}`));

    const first = box.extract(big, spec).then((result) => {
      order.push("first");
      return result;
    });
    const second = box.extract(page(["small"]), spec).then((result) => {
      order.push("second");
      return result;
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(order).toEqual(["first", "second"]);
    expect(firstResult.rows).toHaveLength(2_000);
    expect(firstResult.rows[0]).toEqual({
      title: "big0",
      link: "https://example.com/big0",
    });
    expect(secondResult.rows).toEqual([
      { title: "small", link: "https://example.com/small" },
    ]);
  });

  it("passes the worker's own error code through and keeps serving", async () => {
    const box = sandbox();

    const error = await rejection(
      box.extract(page(["x"]), { ...spec, itemSelector: "li:has(a)" }),
    );
    expect(error.code).toBe("selector_not_allowed");

    const next = await box.extract(page(["ok"]), spec);
    expect(next.rows).toHaveLength(1);
  });

  it("maps a worker that runs out of memory to page_too_complex, then recovers", async () => {
    const box = sandbox({ maxOldGenerationSizeMb: 16, deadlineMs: 20_000 });
    const huge = page(Array.from({ length: 200_000 }, (_, i) => `item${i}`));

    const error = await rejection(box.extract(huge, spec));
    expect(error.code).toBe("page_too_complex");

    const next = await box.extract(page(["ok"]), spec);
    expect(next.rows).toHaveLength(1);
  }, 30_000);

  it("says page_too_complex for 3 MB of empty paragraphs at the default heap", async () => {
    // Inside the 5 MB body cap, yet the parsed tree outgrows 256 MB
    // (measured: out of memory after about 0.4 s).
    const box = sandbox();
    const html = "<p></p>".repeat(Math.floor((3 * 1024 * 1024) / 7));

    const error = await rejection(
      box.extract(html, { ...spec, itemSelector: "p" }),
    );
    expect(error.code).toBe("page_too_complex");
  }, 20_000);

  it("rejects calls with extract_failed after close()", async () => {
    const box = sandbox();
    await box.extract(page(["one"]), spec);

    await box.close();

    expect((await rejection(box.extract(page(["two"]), spec))).code).toBe(
      "extract_failed",
    );
  });

  it("rejects a call in flight with extract_failed when closed", async () => {
    const box = sandbox({ deadlineMs: 10_000 });
    await box.extract(page(["warm"]), spec);

    const slow = box.extract(hostile, spec);
    const queued = box.extract(page(["queued"]), spec);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await box.close();

    expect((await rejection(slow)).code).toBe("extract_failed");
    expect((await rejection(queued)).code).toBe("extract_failed");
  });
});
