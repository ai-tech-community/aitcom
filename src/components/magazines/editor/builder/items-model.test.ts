import { describe, expect, it } from "vitest";

import type { ItemProblem } from "@/lib/magazines/item-views";

import {
  addEditorial,
  addItem,
  type BuilderItem,
  isSavableItem,
  moveItem,
  publishBlockers,
  removeItem,
  toBuilderItems,
  toItemInputs,
} from "./items-model";

const article = (key: string, articleId: number): BuilderItem => ({
  kind: "article",
  key,
  articleId,
});

const textBody = (text: string) => ({
  root: {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", text }] }],
  },
});

const keys = (items: BuilderItem[]) => items.map((i) => i.key);

const abc = [article("a", 1), article("b", 2), article("c", 3)];

describe("moveItem", () => {
  it("moves an item up and down", () => {
    expect(keys(moveItem(abc, 1, 0))).toEqual(["b", "a", "c"]);
    expect(keys(moveItem(abc, 1, 2))).toEqual(["a", "c", "b"]);
    expect(keys(moveItem(abc, 0, 2))).toEqual(["b", "c", "a"]);
  });

  it("leaves the list alone at the edges and for unknown positions", () => {
    expect(moveItem(abc, 0, -1)).toBe(abc);
    expect(moveItem(abc, 2, 3)).toBe(abc);
    expect(moveItem(abc, 5, 0)).toBe(abc);
    expect(moveItem(abc, 1, 1)).toBe(abc);
  });

  it("does not change the list it was given", () => {
    moveItem(abc, 0, 2);
    expect(keys(abc)).toEqual(["a", "b", "c"]);
  });
});

describe("removeItem", () => {
  it("removes the item with the key", () => {
    expect(keys(removeItem(abc, "b"))).toEqual(["a", "c"]);
  });

  it("leaves the list alone for an unknown key", () => {
    expect(keys(removeItem(abc, "zz"))).toEqual(["a", "b", "c"]);
  });
});

describe("addItem", () => {
  it("adds the item at the end with a fresh key", () => {
    const next = addItem(abc, { kind: "article", articleId: 9 });
    expect(next).toHaveLength(4);
    expect(next[3]).toMatchObject({ kind: "article", articleId: 9 });
    expect(keys(abc)).not.toContain(next[3]!.key);
  });

  it("never adds the same referenced content (an article) twice", () => {
    expect(addItem(abc, { kind: "article", articleId: 2 })).toBe(abc);
  });

  it("adds content the issue owns (an editorial block) every time", () => {
    const block = { kind: "editorial" as const, body: textBody("Hi") };
    expect(addItem(addItem(abc, block), block)).toHaveLength(5);
  });
});

describe("addEditorial", () => {
  it("adds an empty editorial block with a unique key", () => {
    const one = addEditorial(abc);
    const two = addEditorial(one);
    expect(one[3]).toMatchObject({ kind: "editorial", body: null });
    expect(new Set(keys(two)).size).toBe(5);
  });
});

describe("toBuilderItems / toItemInputs", () => {
  it("keys saved items by their block id and drops the key on the way out", () => {
    const items = toBuilderItems([
      { kind: "article", id: "blk-1", articleId: 4 },
      { kind: "editorial", body: textBody("Hi") },
    ]);
    expect(items[0]!.key).toBe("blk-1");
    expect(items[1]!.key).toEqual(expect.any(String));
    expect(toItemInputs(items)).toEqual([
      { kind: "article", id: "blk-1", articleId: 4 },
      { kind: "editorial", body: textBody("Hi") },
    ]);
  });

  it("sends the block id a save gave an item that had none", () => {
    const [item] = addItem([], { kind: "article", articleId: 4 });
    expect(toItemInputs([item!], new Map([[item!.key, "blk-9"]]))).toEqual([
      { kind: "article", id: "blk-9", articleId: 4 },
    ]);
  });
});

describe("isSavableItem", () => {
  it("needs some text in an editorial block", () => {
    const editorial = (body: unknown): BuilderItem => ({
      kind: "editorial",
      key: "e",
      body,
    });
    const [empty] = addEditorial([]);
    expect(isSavableItem(empty!)).toBe(false);
    expect(isSavableItem(editorial(textBody("  ")))).toBe(false);
    expect(isSavableItem(editorial(textBody("Welcome")))).toBe(true);
    expect(isSavableItem(article("a", 1))).toBe(true);
  });
});

describe("publishBlockers", () => {
  const problem: ItemProblem = { itemIndex: 0, code: "ARTICLE_NOT_READY" };

  it("is empty for a titled issue with valid items", () => {
    expect(
      publishBlockers({ title: "June", items: abc, problems: [] }),
    ).toEqual([]);
  });

  it("names an empty title", () => {
    expect(publishBlockers({ title: "   ", items: abc, problems: [] })).toEqual(
      ["NO_TITLE"],
    );
  });

  it("names an issue without items", () => {
    expect(publishBlockers({ title: "June", items: [], problems: [] })).toEqual(
      ["NO_ITEMS"],
    );
  });

  it("names invalid items: a server problem or an unfinished block", () => {
    expect(
      publishBlockers({ title: "June", items: abc, problems: [problem] }),
    ).toEqual(["INVALID_ITEM"]);
    expect(
      publishBlockers({
        title: "June",
        items: addEditorial(abc),
        problems: [],
      }),
    ).toEqual(["INVALID_ITEM"]);
  });

  it("lists every blocker at once", () => {
    expect(
      publishBlockers({ title: "", items: [], problems: [problem] }),
    ).toEqual(["NO_TITLE", "NO_ITEMS", "INVALID_ITEM"]);
  });
});
