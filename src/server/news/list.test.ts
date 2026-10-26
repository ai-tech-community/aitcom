import { drizzle, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";

import type { db } from "@/server/db";

import { loadNewsItemAiFlags } from "./item-ai";
import { findNewsItemsByIds, searchNewsItems } from "./list";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("./item-ai", () => ({ loadNewsItemAiFlags: vi.fn() }));

function database(rows: unknown[][] = []) {
  const query = vi.fn<RemoteCallback>(async () => ({ rows }));
  const client = drizzle(query, { casing: "snake_case" });
  return { query, client: client as unknown as typeof db };
}

describe("magazine news reads", () => {
  it("does not query for an empty batch", async () => {
    const { client, query } = database();
    expect(await findNewsItemsByIds([], client)).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });

  it("loads the whole batch in one query without separate AI flags", async () => {
    const { client, query } = database([
      [
        "n1",
        "https://example.com/a",
        "First headline",
        null,
        "2026-11-01T10:00:00.000Z",
        "Feed summary",
        "Short summary",
      ],
      [
        "n2",
        "https://example.com/b",
        "Second headline",
        "Author",
        null,
        "Another summary",
        null,
      ],
    ]);
    const found = await findNewsItemsByIds(["n1", "n2", "missing"], client);
    expect([...found.keys()]).toEqual(["n1", "n2"]);
    expect(found.get("n1")).toEqual({
      id: "n1",
      url: "https://example.com/a",
      title: "First headline",
      author: null,
      publishedAt: new Date("2026-11-01T10:00:00.000Z"),
      summary: "Feed summary",
      aiSummary: "Short summary",
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.slice(0, 3)).toEqual([
      expect.stringContaining('"app"."news_item"'),
      ["n1", "n2", "missing"],
      "all",
    ]);
    expect(loadNewsItemAiFlags).not.toHaveBeenCalled();
  });

  it("searches literal title text and orders by publication then creation", async () => {
    const { client, query } = database();
    expect(await searchNewsItems("50%_\\news", 12, client)).toEqual([]);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        'where "app"."news_item"."title" ilike $1 order by "app"."news_item"."published_at" desc nulls last, "app"."news_item"."created_at" desc limit $2',
      ),
      ["%50\\%\\_\\\\news%", 12],
      "all",
      expect.any(Array),
    );
    expect(loadNewsItemAiFlags).not.toHaveBeenCalled();
  });

  it("offers the newest headlines for an empty query with the requested limit", async () => {
    const { client, query } = database();
    await searchNewsItems("", 3, client);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        'order by "app"."news_item"."published_at" desc nulls last, "app"."news_item"."created_at" desc limit $1',
      ),
      [3],
      "all",
      expect.any(Array),
    );
    expect(query.mock.calls[0]?.[0]).not.toContain(" where ");
  });
});
