import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IssueReaderAccess } from "@/lib/magazines/access";
import { PICKER_LIMIT } from "@/lib/magazines/picker";
import {
  findNewsItemsByIds,
  searchNewsItems,
  type NewsListItem,
} from "@/server/news/list";

import type { Deps, PayloadClient } from "../../deps";
import { itemContextFor } from "../context";
import { searchPickerCandidates } from "../pickers";
import { loadIssueItemViews } from "../registry";
import { newsItemKind } from "./kind";

vi.mock("@/server/news/list", () => ({
  findNewsItemsByIds: vi.fn(),
  searchNewsItems: vi.fn(),
}));

const findNews = vi.mocked(findNewsItemsByIds);

function context(access: IssueReaderAccess = "editor") {
  return itemContextFor(
    { db: {} as Deps["db"], payload: {} as PayloadClient },
    {
      magazineId: 1,
      community: { id: "community", slug: "community" },
      issueId: 2,
      locale: "en",
      access,
      viewerId: null,
    },
  );
}

function news(id: string, overrides: Partial<NewsListItem> = {}): NewsListItem {
  return {
    id,
    url: "https://www.example.com/a",
    title: "Local models run on your own device",
    author: null,
    publishedAt: new Date("2026-11-01T10:00:00.000Z"),
    summary: "Your files stay on your device.",
    aiSummary: null,
    ...overrides,
  };
}

const stored = (id: string, newsItemId = id) => ({
  id: `block-${id}`,
  newsItemId,
  intro: "Our take",
});

beforeEach(() => {
  findNews.mockReset();
  findNews.mockResolvedValue(new Map());
  vi.mocked(searchNewsItems).mockReset();
});

describe("news item kind", () => {
  it("loads every news item of an issue in one query", async () => {
    const ctx = context();
    await newsItemKind.load([stored("n1"), stored("n2"), stored("n3")], ctx);
    expect(findNews).toHaveBeenCalledExactlyOnceWith(
      ["n1", "n2", "n3"],
      ctx.db,
    );
  });

  it("shows the headline with its source and marks a deleted one", async () => {
    const opening = "One two three four five six seven eight nine ten. "
      .repeat(3)
      .trim();
    findNews.mockResolvedValue(
      new Map([
        [
          "n1",
          news("n1", {
            aiSummary: `${opening} These extra words stay out.`,
          }),
        ],
      ]),
    );
    const blocks = [stored("n1"), stored("gone")];
    const editor = await newsItemKind.load(blocks, context());
    expect([...editor.values()]).toEqual([
      {
        kind: "newsItem",
        itemId: "block-n1",
        intro: "Our take",
        news: {
          title: "Local models run on your own device",
          url: "https://www.example.com/a",
          source: "example.com",
          publishedAt: "2026-11-01T10:00:00.000Z",
          summary: `${opening}…`,
        },
      },
      {
        kind: "newsItem",
        itemId: "block-gone",
        unavailable: true,
        reason: "missing",
      },
    ]);
    expect(
      await loadIssueItemViews(
        blocks.map((block) => ({ ...block, blockType: "newsItem" })),
        context("full"),
      ),
    ).toEqual([editor.get("block-n1")]);
  });

  it("never links a non-web address", async () => {
    for (const url of [
      "javascript:alert(1)",
      "ftp://example.com/a",
      "/relative",
      "https://",
    ]) {
      findNews.mockResolvedValue(
        new Map([["n1", news("n1", { url, publishedAt: null })]]),
      );
      expect(
        (await newsItemKind.load([stored("n1")], context())).get("block-n1"),
      ).toMatchObject({
        news: {
          url: null,
          source: null,
          publishedAt: null,
          summary: "Your files stay on your device.",
        },
      });
    }
    findNews.mockResolvedValue(
      new Map([
        ["n1", news("n1", { url: "http://www.example.com/a", aiSummary: "" })],
      ]),
    );
    expect(
      (await newsItemKind.load([stored("n1")], context())).get("block-n1"),
    ).toMatchObject({
      news: {
        url: "http://www.example.com/a",
        source: "example.com",
        summary: "",
      },
    });
  });

  it("refuses an unknown new item and a duplicate", async () => {
    findNews.mockResolvedValue(new Map([["n1", news("n1")]]));
    const ctx = context();
    expect(
      await newsItemKind.validate(
        [
          { index: 0, stored: stored("n1"), isNew: true },
          { index: 2, stored: stored("unknown"), isNew: true },
          { index: 3, stored: stored("copy", "n1"), isNew: true },
        ],
        ctx,
      ),
    ).toEqual([
      { itemIndex: 2, code: "ITEM_INVALID" },
      { itemIndex: 3, code: "ITEM_INVALID", detail: "duplicate" },
    ]);
    expect(findNews).toHaveBeenCalledExactlyOnceWith(
      ["n1", "unknown", "n1"],
      ctx.db,
    );
    expect(
      await newsItemKind.validate(
        [{ index: 0, stored: stored("gone"), isNew: false }],
        ctx,
      ),
    ).toEqual([]);
    expect(
      await newsItemKind.validate(
        [
          { index: 0, stored: stored("n1"), isNew: false },
          { index: 1, stored: stored("copy", "n1"), isNew: false },
        ],
        ctx,
      ),
    ).toEqual([{ itemIndex: 1, code: "ITEM_INVALID", detail: "duplicate" }]);
  });

  it("round-trips input and keeps the intro", () => {
    const block = newsItemKind.toStored({
      kind: "newsItem",
      newsItemId: "n1",
      intro: " Our take ",
    });
    expect(block).toEqual({ newsItemId: "n1", intro: "Our take" });
    expect(newsItemKind.toInput({ ...block, id: "saved" })).toEqual({
      kind: "newsItem",
      id: "saved",
      newsItemId: "n1",
      intro: "Our take",
    });
    expect(newsItemKind.referenceOf(block)).toBe("newsItem:n1");
    expect(
      newsItemKind.toStored({ kind: "newsItem", newsItemId: "n1", intro: "  " })
        .intro,
    ).toBeNull();
    for (const newsItemId of ["", "n".repeat(256)]) {
      expect(
        newsItemKind.input.safeParse({ kind: "newsItem", newsItemId }).success,
      ).toBe(false);
    }
  });
});

describe("news picker", () => {
  it("searches headlines with source and published date facts", async () => {
    vi.mocked(searchNewsItems).mockResolvedValue([news("n1")]);
    const ctx = {
      deps: { db: {} as Deps["db"], payload: {} as PayloadClient },
      magazineId: 1,
      community: { id: "c", slug: "c" },
      viewerId: "editor",
      locale: "en" as const,
    };
    expect(await searchPickerCandidates("newsItem", "local", ctx)).toEqual([
      {
        input: { kind: "newsItem", newsItemId: "n1" },
        reference: "newsItem:n1",
        title: "Local models run on your own device",
        facts: [
          { type: "source", host: "example.com" },
          { type: "date", label: "published", at: "2026-11-01T10:00:00.000Z" },
        ],
        openHref: null,
      },
    ]);
    expect(searchNewsItems).toHaveBeenCalledWith(
      "local",
      PICKER_LIMIT,
      ctx.deps.db,
    );
    vi.mocked(searchNewsItems).mockResolvedValue([
      news("n1", { url: "javascript:alert(1)", publishedAt: null }),
    ]);
    expect(
      (await searchPickerCandidates("newsItem", "", ctx))[0],
    ).toMatchObject({ facts: [], openHref: null });
  });
});
