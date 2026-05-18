import { describe, expect, it } from "vitest";

import type { ModelSurface } from "@/server/db/schema";

import {
  decideRouterEligibleSurfaces,
  orderRefreshCandidates,
} from "./router";

describe("decideRouterEligibleSurfaces", () => {
  it("returns all surfaces when no budgets are configured", () => {
    const { eligible, skipped } = decideRouterEligibleSurfaces(
      ["chatgpt_grounded", "perplexity"],
      new Map(),
      undefined,
    );
    expect(eligible).toEqual(["chatgpt_grounded", "perplexity"]);
    expect(skipped).toEqual([]);
  });

  it("skips surfaces at or over budget", () => {
    const { eligible, skipped } = decideRouterEligibleSurfaces(
      ["chatgpt_grounded", "perplexity"],
      new Map<ModelSurface, number>([
        ["chatgpt_grounded", 5000],
        ["perplexity", 100],
      ]),
      { chatgpt_grounded: 5000, perplexity: 1000 },
    );
    expect(eligible).toEqual(["perplexity"]);
    expect(skipped).toEqual(["chatgpt_grounded"]);
  });
});

describe("orderRefreshCandidates", () => {
  it("ranks missing-entirely cells before stale ones", () => {
    const ordered = orderRefreshCandidates([
      { promptId: "a", promptLocale: "en-US", newestDoneAt: new Date(1000) },
      { promptId: "b", promptLocale: "en-US", newestDoneAt: null },
    ]);
    expect(ordered.map((c) => c.promptId)).toEqual(["b", "a"]);
  });

  it("within stale, oldest first", () => {
    const ordered = orderRefreshCandidates([
      {
        promptId: "young",
        promptLocale: "en-US",
        newestDoneAt: new Date(2000),
      },
      { promptId: "old", promptLocale: "en-US", newestDoneAt: new Date(1000) },
    ]);
    expect(ordered.map((c) => c.promptId)).toEqual(["old", "young"]);
  });

  it("tie-breaks on promptId for stable order", () => {
    const t = new Date(1000);
    const ordered = orderRefreshCandidates([
      { promptId: "c", promptLocale: "en-US", newestDoneAt: t },
      { promptId: "a", promptLocale: "en-US", newestDoneAt: t },
      { promptId: "b", promptLocale: "en-US", newestDoneAt: t },
    ]);
    expect(ordered.map((c) => c.promptId)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { promptId: "a", promptLocale: "en-US", newestDoneAt: new Date(2000) },
      { promptId: "b", promptLocale: "en-US", newestDoneAt: new Date(1000) },
    ];
    const before = [...input];
    orderRefreshCandidates(input);
    expect(input).toEqual(before);
  });
});
