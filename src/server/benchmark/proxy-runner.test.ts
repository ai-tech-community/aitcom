import { describe, expect, it } from "vitest";

import type { ModelSurface } from "@/server/db/schema";

import { ProxyError } from "./proxy/types";
import type {
  ProxyRunnerDb,
  ProxyRunnerOptions,
  QueuedRunRow,
  RunOnSurfaceFn,
} from "./proxy-runner";
import { decideEligibleSurfaces, runProxyRunnerTick } from "./proxy-runner";
import type { ProxyRunResult } from "./proxy/types";

interface SuccessCall {
  runId: string;
  result: ProxyRunResult;
}

interface FailureCall {
  runId: string;
  error: string;
}

function makeFakeDb(initial: {
  queued?: QueuedRunRow[];
  spent?: Partial<Record<ModelSurface, number>>;
  stuck?: number;
} = {}) {
  const queued = [...(initial.queued ?? [])];
  const spent = new Map<ModelSurface, number>(
    Object.entries(initial.spent ?? {}) as [ModelSurface, number][],
  );
  const successCalls: SuccessCall[] = [];
  const failureCalls: FailureCall[] = [];
  let recoveredArg: number | null = null;

  const db: ProxyRunnerDb = {
    async recoverStuckRunning(staleAfterMs) {
      recoveredArg = staleAfterMs;
      return initial.stuck ?? 0;
    },
    async spentTodayBySurface() {
      return new Map(spent);
    },
    async claimQueued(surfaces, limit) {
      const allowed = new Set(surfaces);
      const picked: QueuedRunRow[] = [];
      for (let i = queued.length - 1; i >= 0 && picked.length < limit; i--) {
        const row = queued[i];
        if (row && allowed.has(row.modelSurface)) {
          picked.push(row);
          queued.splice(i, 1);
        }
      }
      return picked.reverse();
    },
    async markSuccess(runId, result) {
      successCalls.push({ runId, result });
    },
    async markFailure(runId, error) {
      failureCalls.push({ runId, error });
    },
  };

  return {
    db,
    successCalls,
    failureCalls,
    remainingQueued: () => queued,
    recoveredArg: () => recoveredArg,
  };
}

const baseOptions: ProxyRunnerOptions = {
  enabledSurfaces: ["chatgpt_grounded"],
  batchSize: 10,
};

function makeResult(rawAnswer: string): ProxyRunResult {
  return {
    rawAnswer,
    sources: [],
    providerResponseId: `resp-${rawAnswer}`,
    providerModelId: "gpt-4o-search-preview",
    providerModelVersion: null,
    promptTokens: 1,
    completionTokens: 2,
    costCents: null,
    providerResponseRaw: { id: `resp-${rawAnswer}` },
  };
}

describe("decideEligibleSurfaces", () => {
  it("returns all surfaces when no budgets are configured", () => {
    const { eligible, skipped } = decideEligibleSurfaces(
      ["chatgpt_grounded", "perplexity"],
      new Map(),
      undefined,
    );
    expect(eligible).toEqual(["chatgpt_grounded", "perplexity"]);
    expect(skipped).toEqual([]);
  });

  it("skips surfaces whose spend has met or exceeded budget", () => {
    const { eligible, skipped } = decideEligibleSurfaces(
      ["chatgpt_grounded", "perplexity"],
      new Map([
        ["chatgpt_grounded", 1500],
        ["perplexity", 200],
      ]),
      { chatgpt_grounded: 1500, perplexity: 500 },
    );
    expect(eligible).toEqual(["perplexity"]);
    expect(skipped).toEqual(["chatgpt_grounded"]);
  });

  it("treats absent spend as zero", () => {
    const { eligible } = decideEligibleSurfaces(
      ["chatgpt_grounded"],
      new Map(),
      { chatgpt_grounded: 100 },
    );
    expect(eligible).toEqual(["chatgpt_grounded"]);
  });
});

describe("runProxyRunnerTick", () => {
  it("processes a claimed queued run and records success", async () => {
    const fake = makeFakeDb({
      queued: [
        {
          runId: "row-1",
          promptId: "prompt-1",
          promptText: "best CRM for small teams",
          locale: "en-US",
          modelSurface: "chatgpt_grounded",
        },
      ],
    });

    const runOnSurface: RunOnSurfaceFn = async (surface, input) => {
      expect(surface).toBe("chatgpt_grounded");
      expect(input.prompt).toBe("best CRM for small teams");
      return makeResult("HubSpot is popular.");
    };

    const result = await runProxyRunnerTick(fake.db, runOnSurface, baseOptions);

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(fake.successCalls).toHaveLength(1);
    expect(fake.successCalls[0]?.runId).toBe("row-1");
    expect(fake.successCalls[0]?.result.rawAnswer).toBe("HubSpot is popular.");
  });

  it("records a failure when runOnSurface throws ProxyError", async () => {
    const fake = makeFakeDb({
      queued: [
        {
          runId: "row-1",
          promptId: "p",
          promptText: "x",
          locale: "en-US",
          modelSurface: "chatgpt_grounded",
        },
      ],
    });

    const runOnSurface: RunOnSurfaceFn = async () => {
      throw new ProxyError("OpenAI returned 429: too many", "chatgpt_grounded");
    };

    const result = await runProxyRunnerTick(fake.db, runOnSurface, baseOptions);

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(fake.failureCalls[0]).toMatchObject({
      runId: "row-1",
      error: "OpenAI returned 429: too many",
    });
  });

  it("records a failure with a stringified error for unknown throwables", async () => {
    const fake = makeFakeDb({
      queued: [
        {
          runId: "row-1",
          promptId: "p",
          promptText: "x",
          locale: "en-US",
          modelSurface: "chatgpt_grounded",
        },
      ],
    });

    const runOnSurface: RunOnSurfaceFn = async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "raw string";
    };

    const result = await runProxyRunnerTick(fake.db, runOnSurface, baseOptions);

    expect(result.failed).toBe(1);
    expect(fake.failureCalls[0]?.error).toBe("raw string");
  });

  it("skips surfaces over budget and reports them", async () => {
    const fake = makeFakeDb({
      queued: [
        {
          runId: "row-1",
          promptId: "p",
          promptText: "x",
          locale: "en-US",
          modelSurface: "chatgpt_grounded",
        },
      ],
      spent: { chatgpt_grounded: 5000 },
    });

    let calls = 0;
    const runOnSurface: RunOnSurfaceFn = async () => {
      calls += 1;
      return makeResult("");
    };

    const result = await runProxyRunnerTick(fake.db, runOnSurface, {
      ...baseOptions,
      budgetCentsBySurface: { chatgpt_grounded: 5000 },
    });

    expect(calls).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.skippedSurfaces).toEqual(["chatgpt_grounded"]);
    expect(fake.remainingQueued()).toHaveLength(1);
  });

  it("recovers stuck running rows before processing", async () => {
    const fake = makeFakeDb({ stuck: 3 });
    const result = await runProxyRunnerTick(
      fake.db,
      async () => makeResult(""),
      { ...baseOptions, recoverStuckAfterMs: 60_000 },
    );
    expect(result.recovered).toBe(3);
    expect(fake.recoveredArg()).toBe(60_000);
  });

  it("returns zero counts when no rows are queued", async () => {
    const fake = makeFakeDb();
    const result = await runProxyRunnerTick(
      fake.db,
      async () => makeResult(""),
      baseOptions,
    );
    expect(result).toEqual({
      recovered: 0,
      processed: 0,
      failed: 0,
      skippedSurfaces: [],
    });
  });

  it("processes multiple rows in one tick", async () => {
    const fake = makeFakeDb({
      queued: [
        {
          runId: "row-1",
          promptId: "p",
          promptText: "a",
          locale: "en-US",
          modelSurface: "chatgpt_grounded",
        },
        {
          runId: "row-2",
          promptId: "p",
          promptText: "b",
          locale: "en-US",
          modelSurface: "chatgpt_grounded",
        },
      ],
    });

    const runOnSurface: RunOnSurfaceFn = async (_s, input) =>
      makeResult(input.prompt);

    const result = await runProxyRunnerTick(fake.db, runOnSurface, baseOptions);

    expect(result.processed).toBe(2);
    expect(fake.successCalls.map((c) => c.result.rawAnswer)).toEqual([
      "a",
      "b",
    ]);
  });
});
