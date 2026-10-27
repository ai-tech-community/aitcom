import { describe, expect, it, vi } from "vitest";

import type { MagazineIssue } from "@/payload-types";

import type { Deps } from "./deps";
vi.mock("./auto-draft/picks", () => ({
  loadAutoDraftForIssue: vi.fn(async () => null),
}));

import { loadIssueEditorView } from "./issue-editing";

describe("issue editor view", () => {
  it("collects saved-item open links through kind strategies and the article author gate", async () => {
    const articles = [
      { id: 11, slug: "own-story", authorId: "editor" },
      { id: 12, slug: "other-story", authorId: "someone-else" },
    ].map((article) => ({
      ...article,
      title: article.slug,
      magazine: 7,
      magazineIssue: 1,
      status: "draft",
      reviewStatus: "approved",
      content: null,
    }));
    const find = vi.fn(async () => ({ docs: articles }));
    const deps = { db: {}, payload: { find } } as unknown as Deps;
    const issue = {
      id: 1,
      magazine: 7,
      items: [
        { blockType: "article", id: "first", article: 11 },
        { blockType: "article", id: "second", article: 12 },
        { blockType: "editorial", id: "note", heading: "Note", body: null },
      ],
    } as unknown as MagazineIssue;

    const view = await loadIssueEditorView(deps, issue, {
      userId: "editor",
      community: { id: "community", slug: "town", isListedInDirectory: true },
    });

    expect(view.autoDraft).toBeNull();
    expect(view).toHaveProperty("openHrefs", {
      "article:11": "/communities/town/magazine/articles/own-story/edit",
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "articles",
        where: { and: [{ id: { in: [11, 12] } }, { magazine: { equals: 7 } }] },
        select: { slug: true, authorId: true },
        draft: true,
        limit: 2,
      }),
    );
  });
});
