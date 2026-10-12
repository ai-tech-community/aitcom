import { describe, expect, it, vi } from "vitest";

import { ingestNewsItems, type NewsIngestDb } from "./ingest";

const story = {
  title: "New models",
  url: "https://example.com/models",
  publishedAt: "2026-10-11T00:00:00.000Z",
  author: "Ada",
  summary: "What shipped this week.",
};

function memoryDb(): NewsIngestDb & { summaries: string[] } {
  const rows = new Map<
    string,
    {
      id: string;
      url: string;
      title: string;
      summary: string;
      ai: string | null;
    }
  >();
  const summaries: string[] = [];
  return {
    summaries,
    insertNew: async (drafts) =>
      drafts.flatMap((draft) => {
        if (rows.has(draft.url)) return [];
        const row = {
          id: `id-${draft.url}`,
          url: draft.url,
          title: draft.title,
          summary: draft.summary,
          ai: null,
        };
        rows.set(draft.url, row);
        return [row];
      }),
    unsummarized: async (urls) =>
      urls.flatMap((url) => {
        const row = rows.get(url);
        if (!row || row.ai) return [];
        return [row];
      }),
    saveSummary: async (id, aiSummary) => {
      const row = [...rows.values()].find((item) => item.id === id);
      if (!row || row.ai) return;
      row.ai = aiSummary;
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

  it("tries again when the first summary was not stored", async () => {
    const database = memoryDb();
    const summarize = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("Written on the next pass.");
    expect(await ingestNewsItems(database, [story], summarize)).toBe(1);
    expect(database.summaries).toEqual([]);
    expect(await ingestNewsItems(database, [story], summarize)).toBe(0);
    expect(database.summaries).toEqual(["Written on the next pass."]);
    expect(summarize).toHaveBeenCalledTimes(2);
  });
});
