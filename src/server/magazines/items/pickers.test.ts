import { afterEach, describe, expect, it, vi } from "vitest";

import { magazineArticleEditPath } from "@/lib/magazines/paths";
import { PICKABLE_ITEM_KINDS, PICKER_LIMIT } from "@/lib/magazines/picker";

import type { Deps, PayloadClient } from "../deps";
import {
  ITEM_PICKERS,
  pickerCandidatesFor,
  searchPickerCandidates,
  type SuggestionLoader,
} from "./pickers";
import { ITEM_KINDS, type InputOf } from "./registry";
import { suggestCandidates } from "./suggesters";
import type {
  PickerContext,
  PickerSourceCandidate,
  SuggestContext,
} from "./types";

vi.mock("./suggesters");

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
  vi.mocked(suggestCandidates).mockReset();
});

describe("picker suggestions", () => {
  function candidate(
    threadId: number,
    openHref: string | null = null,
  ): PickerSourceCandidate<InputOf<"forumThread">> {
    return {
      input: { kind: "forumThread", threadId },
      title: `Thread ${threadId}`,
      facts: [],
      openHref,
    };
  }

  function suggestion(threadId: number, openHref: string | null = null) {
    return {
      ...candidate(threadId, openHref),
      reference: `forumThread:${threadId}`,
      reason: { type: "mostReplies" as const, count: 10 },
    };
  }

  function setup() {
    const ctx = context();
    const now = new Date("2026-10-27T12:00:00Z");
    const suggestCtx: SuggestContext = {
      ...ctx,
      community: { ...ctx.community, name: "Our community" },
      topics: ["ai"],
      now,
    };
    const window = { since: new Date("2026-10-20T12:00:00Z"), until: now };
    const loadSuggestion = vi.fn<SuggestionLoader>().mockResolvedValue({
      ctx: suggestCtx,
      window,
    });
    const search = vi.spyOn(ITEM_PICKERS.forumThread, "search");
    return { ctx, suggestCtx, window, loadSuggestion, search };
  }

  it("puts suggestions first and fills up with search", async () => {
    const { ctx, suggestCtx, window, loadSuggestion, search } = setup();
    const suggestions = [suggestion(1), suggestion(2)];
    vi.mocked(suggestCandidates).mockResolvedValue(suggestions);
    search.mockResolvedValue([candidate(2), candidate(3), candidate(4)]);
    const exclude = ["forumThread:99"];

    expect(
      await pickerCandidatesFor(
        "forumThread",
        "",
        ctx,
        exclude,
        loadSuggestion,
      ),
    ).toEqual([
      ...suggestions,
      { ...candidate(3), reference: "forumThread:3", reason: null },
      { ...candidate(4), reference: "forumThread:4", reason: null },
    ]);
    expect(loadSuggestion).toHaveBeenCalledExactlyOnceWith();
    expect(suggestCandidates).toHaveBeenCalledExactlyOnceWith(
      "forumThread",
      suggestCtx,
      window,
      { limit: PICKER_LIMIT, exclude },
    );
    expect(search).toHaveBeenCalledExactlyOnceWith("", ctx, exclude);
  });

  it("a duplicate keeps the search entry's open link", async () => {
    const { ctx, loadSuggestion, search } = setup();
    const suggested = suggestion(2);
    vi.mocked(suggestCandidates).mockResolvedValue([suggested]);
    search.mockResolvedValue([
      { ...candidate(2, "/x"), title: "Search title" },
    ]);

    expect(
      await pickerCandidatesFor("forumThread", "", ctx, [], loadSuggestion),
    ).toEqual([{ ...suggested, openHref: "/x" }]);
  });

  it("keeps the limit", async () => {
    const { ctx, loadSuggestion, search } = setup();
    const suggestions = Array.from({ length: PICKER_LIMIT + 1 }, (_, i) =>
      suggestion(i + 1),
    );
    vi.mocked(suggestCandidates).mockResolvedValue(suggestions);

    expect(
      await pickerCandidatesFor("forumThread", "", ctx, [], loadSuggestion),
    ).toEqual(suggestions.slice(0, PICKER_LIMIT));
    expect(search).not.toHaveBeenCalled();
  });

  it("a typed search does not ask for suggestions", async () => {
    const { ctx, loadSuggestion, search } = setup();
    search.mockResolvedValue([candidate(2), candidate(1)]);
    const exclude = ["forumThread:99"];

    expect(
      await pickerCandidatesFor(
        "forumThread",
        "thread",
        ctx,
        exclude,
        loadSuggestion,
      ),
    ).toEqual([
      { ...candidate(2), reference: "forumThread:2", reason: null },
      { ...candidate(1), reference: "forumThread:1", reason: null },
    ]);
    expect(search).toHaveBeenCalledExactlyOnceWith("thread", ctx, exclude);
    expect(loadSuggestion).not.toHaveBeenCalled();
    expect(suggestCandidates).not.toHaveBeenCalled();
  });
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

    expect(candidates).toHaveLength(PICKER_LIMIT);
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
