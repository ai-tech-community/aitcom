import { afterEach, describe, expect, it, vi } from "vitest";

import type { IssueReaderAccess } from "@/lib/magazines/access";

import type { PayloadClient } from "../deps";
import { ISSUE_ITEM_BLOCKS } from "./blocks";
import {
  ITEM_KINDS,
  issueItemInputSchema,
  loadIssueItemViews,
  type StoredBlock,
  toItemInputs,
  toStoredItems,
  validateIssueItems,
} from "./registry";
import type { ItemContext } from "./types";

const MAGAZINE_ID = 7;

function richText(text: string) {
  return {
    root: {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", text }] }],
    },
  };
}

type FakeArticle = {
  id: number;
  status: "draft" | "published";
  magazine?: number;
  words?: number;
};

function articleDoc({
  id,
  status,
  magazine = MAGAZINE_ID,
  words = 5,
}: FakeArticle) {
  return {
    id,
    slug: `article-${id}`,
    title: `Article ${id}`,
    authorName: `Author ${id}`,
    mediaUrl: null,
    content: richText(
      Array.from({ length: words }, (_, i) => `w${i + 1}`).join(" "),
    ),
    status,
    reviewStatus: "approved",
    magazine,
    magazineIssue: null,
  };
}

/** A Payload client whose `find` answers with the given articles. */
function fakePayload(articles: FakeArticle[]) {
  const find = vi.fn(async () => ({ docs: articles.map(articleDoc) }));
  return { payload: { find } as unknown as PayloadClient, find };
}

function ctx(payload: PayloadClient, access: IssueReaderAccess): ItemContext {
  return { payload, magazineId: MAGAZINE_ID, issueId: 1, locale: "en", access };
}

function articleBlock(id: string, articleId: number): StoredBlock {
  return { blockType: "article", id, intro: null, article: articleId };
}

function editorialBlock(id: string, text = "Hello readers"): StoredBlock {
  return {
    blockType: "editorial",
    id,
    intro: null,
    heading: `Heading ${id}`,
    body: richText(text),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("issue item registry", () => {
  it("has exactly one kind module per block and the same slugs as the Payload blocks", () => {
    expect(Object.keys(ITEM_KINDS)).toEqual(
      ISSUE_ITEM_BLOCKS.map((block) => block.slug),
    );
    for (const [id, strategy] of Object.entries(ITEM_KINDS)) {
      expect(strategy.kind).toBe(id);
    }
  });

  it("parses builder input by kind and rejects unknown kinds", () => {
    expect(
      issueItemInputSchema.parse({ kind: "article", articleId: 3 }),
    ).toEqual({ kind: "article", articleId: 3 });
    expect(
      issueItemInputSchema.parse({
        kind: "editorial",
        heading: "Hi",
        body: richText("x"),
      }),
    ).toEqual({ kind: "editorial", heading: "Hi", body: richText("x") });
    expect(issueItemInputSchema.safeParse({ kind: "storyline" }).success).toBe(
      false,
    );
    expect(issueItemInputSchema.safeParse({ kind: "article" }).success).toBe(
      false,
    );
  });

  it("round-trips builder input through stored blocks and keeps block ids", () => {
    const inputs = [
      { kind: "article" as const, id: "blk-a", articleId: 3, intro: "Lead" },
      { kind: "editorial" as const, heading: "Hi", body: richText("x") },
    ];
    const stored = toStoredItems(inputs);
    expect(stored).toEqual([
      { blockType: "article", id: "blk-a", intro: "Lead", article: 3 },
      {
        blockType: "editorial",
        intro: null,
        heading: "Hi",
        body: richText("x"),
      },
    ]);
    expect(toItemInputs(stored)).toEqual(inputs);
  });

  it("rejects an empty editorial body", async () => {
    const { payload } = fakePayload([]);
    const problems = await validateIssueItems(
      [
        editorialBlock("e1"),
        editorialBlock("e2", "   "),
        { ...editorialBlock("e3"), body: { root: { children: [] } } },
      ],
      ctx(payload, "editor"),
    );
    expect(problems).toEqual([
      { itemIndex: 1, code: "ITEM_INVALID" },
      { itemIndex: 2, code: "ITEM_INVALID" },
    ]);
  });

  it("calls each kind's load once per issue, not once per item", async () => {
    const { payload, find } = fakePayload([
      { id: 1, status: "published" },
      { id: 2, status: "published" },
      { id: 3, status: "published" },
    ]);
    const articleLoad = vi.spyOn(ITEM_KINDS.article, "load");
    const editorialLoad = vi.spyOn(ITEM_KINDS.editorial, "load");

    const views = await loadIssueItemViews(
      [
        articleBlock("a1", 1),
        editorialBlock("e1"),
        articleBlock("a2", 2),
        editorialBlock("e2"),
        articleBlock("a3", 3),
      ],
      ctx(payload, "full"),
    );

    expect(articleLoad).toHaveBeenCalledTimes(1);
    expect(editorialLoad).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "articles",
        where: { id: { in: [1, 2, 3] } },
      }),
    );
    expect(views.map((v) => v.itemId)).toEqual(["a1", "e1", "a2", "e2", "a3"]);
  });

  it("keeps order, drops unreadable items for readers and marks them for editors", async () => {
    const articles: FakeArticle[] = [
      { id: 1, status: "published", words: 50 },
      { id: 2, status: "draft" },
      { id: 4, status: "published", magazine: MAGAZINE_ID + 1 },
    ];
    const blocks = [
      articleBlock("a1", 1),
      editorialBlock("e1"),
      articleBlock("a2", 2), // not published yet
      articleBlock("a3", 3), // deleted
      articleBlock("a4", 4), // another magazine's article
      editorialBlock("e2"),
    ];

    const reader = fakePayload(articles);
    const readerViews = await loadIssueItemViews(
      blocks,
      ctx(reader.payload, "full"),
    );
    expect(reader.find).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false }),
    );
    expect(readerViews.map((v) => v.itemId)).toEqual(["a1", "e1", "e2"]);
    expect(readerViews[0]).toEqual({
      kind: "article",
      itemId: "a1",
      intro: null,
      article: {
        id: 1,
        slug: "article-1",
        title: "Article 1",
        authorName: "Author 1",
        excerpt: `${Array.from({ length: 40 }, (_, i) => `w${i + 1}`).join(" ")}…`,
        readingMinutes: 1,
        imageUrl: null,
      },
    });
    expect(readerViews[1]).toEqual({
      kind: "editorial",
      itemId: "e1",
      intro: null,
      heading: "Heading e1",
      body: richText("Hello readers"),
    });

    const editor = fakePayload(articles);
    const editorViews = await loadIssueItemViews(
      blocks,
      ctx(editor.payload, "editor"),
    );
    expect(editor.find).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true }),
    );
    expect(
      editorViews.map((v) =>
        "unavailable" in v ? `${v.itemId}:${v.reason}` : v.itemId,
      ),
    ).toEqual(["a1", "e1", "a2", "a3:missing", "a4:other_magazine", "e2"]);
  });

  it("asks each kind whether a loaded view is readable", async () => {
    const { payload } = fakePayload([]);
    vi.spyOn(ITEM_KINDS.editorial, "isReadable").mockReturnValue(false);
    const blocks = [editorialBlock("e1")];

    expect(await loadIssueItemViews(blocks, ctx(payload, "full"))).toEqual([]);
    expect(
      (await loadIssueItemViews(blocks, ctx(payload, "editor"))).map(
        (v) => v.itemId,
      ),
    ).toEqual(["e1"]);
  });
});
