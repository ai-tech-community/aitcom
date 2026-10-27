import { afterEach, describe, expect, it, vi } from "vitest";

import { magazineArticleEditPath } from "@/lib/magazines/paths";
import { PICKABLE_ITEM_KINDS, PICKER_LIMIT } from "@/lib/magazines/picker";

import type { Deps, PayloadClient } from "../deps";
import { ITEM_PICKERS, searchPickerCandidates } from "./pickers";
import { ITEM_KINDS } from "./registry";
import type { PickerContext } from "./types";

function context(payload = {} as PayloadClient): PickerContext {
  return {
    deps: { db: {} as Deps["db"], payload },
    magazineId: 1,
    community: { id: "community", slug: "community" },
    viewerId: "editor",
    locale: "en",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("item picker registry", () => {
  it("has one picker source per pickable kind", () => {
    expect(Object.keys(ITEM_PICKERS)).toEqual([...PICKABLE_ITEM_KINDS]);
  });

  it("every pickable kind is a registry kind other than editorial", () => {
    expect([...PICKABLE_ITEM_KINDS]).toEqual(
      Object.keys(ITEM_KINDS).filter((kind) => kind !== "editorial"),
    );
  });

  it("gives every candidate its reference key", async () => {
    const candidate = {
      input: { kind: "article" as const, articleId: 7 },
      title: "Agents at work",
      facts: [{ type: "byline" as const, name: "Greg" }],
      openHref: null,
    };
    vi.spyOn(ITEM_PICKERS.article, "search").mockResolvedValue([candidate]);

    expect(await searchPickerCandidates("article", "agent", context())).toEqual(
      [{ ...candidate, reference: "article:7" }],
    );
  });

  it("offers at most twelve articles with bylines and edit links for their authors", async () => {
    const docs = Array.from({ length: PICKER_LIMIT + 1 }, (_, i) => ({
      id: i + 1,
      slug: `article-${i + 1}`,
      title: `Article ${i + 1}`,
      authorName: i === 0 ? "Greg" : null,
      authorId: i === 0 ? "editor" : "another-editor",
      updatedAt: "2026-10-26T12:00:00.000Z",
    }));
    const payload = {
      find: vi.fn().mockResolvedValue({ docs }),
    } as unknown as PayloadClient;

    const candidates = await searchPickerCandidates(
      "article",
      "",
      context(payload),
    );

    expect(candidates).toHaveLength(12);
    expect(candidates[0]).toEqual({
      input: { kind: "article", articleId: 1 },
      reference: "article:1",
      title: "Article 1",
      facts: [{ type: "byline", name: "Greg" }],
      openHref: magazineArticleEditPath("community", "article-1"),
    });
    expect(candidates[1]).toEqual({
      input: { kind: "article", articleId: 2 },
      reference: "article:2",
      title: "Article 2",
      facts: [],
      openHref: null,
    });
  });
});

describe("picker exclusions", () => {
  it.each(["article", "event", "forumThread"] as const)(
    "%s excludes its held ids in the source query before the limit",
    async (kind) => {
      const find = vi.fn().mockResolvedValue({ docs: [] });
      const ctx = context({ find } as unknown as PayloadClient);
      await searchPickerCandidates(kind, "", ctx, [
        `${kind}:7`,
        `${kind}:8`,
        "newsItem:other",
      ]);
      expect(find).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          where: expect.objectContaining({
            and: expect.arrayContaining([{ id: { not_in: [7, 8] } }]),
          }),
          limit: PICKER_LIMIT,
        }),
      );
    },
  );
});
