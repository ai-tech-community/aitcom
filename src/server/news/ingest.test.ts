import { describe, expect, it, vi } from "vitest";

import { ingestNewsItems, type NewsIngestDb } from "./ingest";

const story = {
  title: "New models",
  url: "https://example.com/models",
  publishedAt: "2026-10-11T00:00:00.000Z",
  author: "Ada",
  summary: "What shipped this week.",
};

function memoryDb(
  already: string[] = [],
): NewsIngestDb & { summaries: string[] } {
  const urls = new Set(already);
  const summaries: string[] = [];
  return {
    summaries,
    insertNew: async (rows) =>
      rows.flatMap((row) => {
        if (urls.has(row.url)) return [];
        urls.add(row.url);
        return [{ id: `id-${row.url}`, ...row }];
      }),
    saveSummary: async (_id, aiSummary) => {
      summaries.push(aiSummary);
    },
  };
}

describe("ingestNewsItems", () => {
  it("summarizes a story when it is added and not when it is seen again", async () => {
    const database = memoryDb();
    const summarize = vi.fn(async () => "A stored TL;DR.");
    expect(await ingestNewsItems(database, [story], summarize)).toBe(1);
    expect(await ingestNewsItems(database, [story], summarize)).toBe(0);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(database.summaries).toEqual(["A stored TL;DR."]);
  });
});
