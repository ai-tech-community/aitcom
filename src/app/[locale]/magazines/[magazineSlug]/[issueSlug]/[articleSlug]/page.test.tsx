// The article page answers 404 when the read model does, loads comments
// only for an article readers can reach, and is indexed only when its
// issue is effectively public (preflight F10).
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../messages/en.json";
import {
  articlePage,
  magazineArticle,
} from "@/components/magazines/test-fixtures";
import type { MagazineArticlePageData } from "@/server/magazines/reading";

const state = vi.hoisted(() => ({
  data: null as MagazineArticlePageData | null,
  calls: [] as unknown[],
  commentReads: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
  getLocale: async () => "en",
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => ({ user: { id: "viewer-1" } }),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/reading", () => ({
  loadMagazineArticlePage: async (_deps: unknown, opts: unknown) => {
    state.calls.push(opts);
    return state.data;
  },
}));
vi.mock("@/server/articles/article-comments", () => ({
  listArticleComments: async (_payload: unknown, articleId: number) => {
    state.commentReads.push(articleId);
    return [{ id: 1, content: "Hi", parentId: null }];
  },
}));
vi.mock("@/components/magazines/reading/magazine-article", () => ({
  MagazineArticle: () => null,
}));

import MagazineArticlePage, { dynamic, generateMetadata } from "./page";

const params = Promise.resolve({
  locale: "en",
  magazineSlug: "agents-weekly",
  issueSlug: "issue-4",
  articleSlug: "agents-that-know-when-to-stop",
});

/** The props the page hands the long-read. */
async function renderedProps() {
  const element = (await MagazineArticlePage({ params })) as {
    props: { comments: unknown[] };
  };
  return element.props;
}

beforeEach(() => {
  state.data = null;
  state.calls = [];
  state.commentReads = [];
});

describe("magazine article page", () => {
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is a 404 with empty metadata when the read model answers null", async () => {
    await expect(MagazineArticlePage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(await generateMetadata({ params })).toEqual({});
    expect(state.calls[0]).toEqual({
      magazineSlug: "agents-weekly",
      issueSlug: "issue-4",
      articleSlug: "agents-that-know-when-to-stop",
      viewerId: "viewer-1",
      locale: "en",
    });
  });

  it("indexes an article in an effectively public issue", async () => {
    state.data = articlePage();
    const meta = await generateMetadata({ params });
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe("Agents that know when to stop · Agents Weekly");
    expect(meta.description).toBe(
      "An article in issue 4 of Agents Weekly, a magazine by Amsterdam AI Builders.",
    );
    expect(meta.alternates?.canonical).toMatch(
      /\/en\/magazines\/agents-weekly\/issue-4\/agents-that-know-when-to-stop$/,
    );
  });

  it("keeps it out of search when the issue is members-only in effect, or a preview", async () => {
    for (const data of [
      articlePage({
        issue: { visibility: "public", effectiveVisibility: "members" },
      }),
      articlePage({
        issue: { visibility: "members", effectiveVisibility: "members" },
      }),
      articlePage({ access: "editor", issue: { status: "draft" } }),
    ]) {
      state.data = data;
      expect((await generateMetadata({ params })).robots).toEqual({
        index: false,
      });
    }
  });

  it("keeps a staff-hidden magazine out of search while the page still opens", async () => {
    state.data = articlePage();
    state.data.magazine.staffHidden = true;
    expect((await generateMetadata({ params })).robots).toEqual({
      index: false,
    });
    await expect(MagazineArticlePage({ params })).resolves.toBeTruthy();
  });

  it("uses the article image as the share image when there is one", async () => {
    state.data = articlePage({
      article: magazineArticle({ mediaUrl: "https://cdn.example.com/a.jpg" }),
    });
    const meta = await generateMetadata({ params });
    expect(meta.openGraph?.images).toEqual(["https://cdn.example.com/a.jpg"]);
  });

  it("hands the article, its comments and the viewer to the long-read", async () => {
    state.data = articlePage();
    const props = await renderedProps();
    expect(state.commentReads).toEqual([1]);
    expect(props).toEqual({
      data: state.data,
      comments: [{ id: 1, content: "Hi", parentId: null }],
      currentUserId: "viewer-1",
    });
  });

  it("does not read comments for an editor's preview of a draft", async () => {
    state.data = articlePage({
      access: "editor",
      article: magazineArticle({ status: "draft" }),
    });
    const props = await renderedProps();
    expect(state.commentReads).toEqual([]);
    expect(props.comments).toEqual([]);
  });
});
