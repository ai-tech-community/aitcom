import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Where } from "payload";

import { publicArticleWhere } from "@/server/articles/public-articles";

type FakeArticle = {
  id: number;
  slug: string;
  title: string;
  type: string;
  tags: { tag: string }[];
  status: string;
  authorType: string;
  reviewStatus: string | null;
  magazine: number | null;
};

const state = vi.hoisted(() => ({
  articles: [] as FakeArticle[],
  finds: [] as { collection: string; where: unknown }[],
}));

/**
 * A Payload `find` that understands only what this page asks for: the
 * slug, and the blog's read rule (as the exact `publicArticleWhere()`
 * object, so the test pins that the lookup uses the one rule).
 */
function matches(article: FakeArticle, where: Where | undefined): boolean {
  if (!where) return true;
  if (JSON.stringify(where) === JSON.stringify(publicArticleWhere())) {
    return (
      article.magazine === null &&
      article.status === "published" &&
      (article.authorType !== "member" || article.reviewStatus === "approved")
    );
  }
  if (Array.isArray(where.and)) {
    return where.and.every((clause) => matches(article, clause));
  }
  const slug = (where.slug as { equals?: string } | undefined)?.equals;
  if (slug !== undefined) return article.slug === slug;
  const status = (where.status as { equals?: string } | undefined)?.equals;
  if (status !== undefined) return article.status === status;
  throw new Error(`unexpected where ${JSON.stringify(where)}`);
}

vi.mock("server-only", () => ({}));

vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    find: async (args: { collection: string; where?: Where }) => {
      state.finds.push({ collection: args.collection, where: args.where });
      if (args.collection !== "articles") return { docs: [], totalDocs: 0 };
      const docs = state.articles.filter((a) => matches(a, args.where));
      return { docs, totalDocs: docs.length };
    },
  }),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => null,
}));

vi.mock("@/lib/metadata", () => ({
  localeAlternates: async (path: string) => ({ canonical: path }),
  buildOgMeta: (title: string) => ({ openGraph: { title } }),
}));

vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/components/blog/article-comments", () => ({
  ArticleComments: () => null,
}));
vi.mock("@/components/blog/blog-toc", () => ({ BlogToc: () => null }));
vi.mock("@/components/json-ld", () => ({ JsonLd: () => null }));

import ArticleDetailPage, { generateMetadata } from "./page";

function article(overrides: Partial<FakeArticle> = {}): FakeArticle {
  return {
    id: 42,
    slug: "our-funding-plans",
    title: "Our funding plans",
    type: "article",
    tags: [{ tag: "funding" }],
    status: "published",
    authorType: "member",
    reviewStatus: "approved",
    magazine: null,
    ...overrides,
  };
}

const params = () => Promise.resolve({ slug: "our-funding-plans" });

beforeEach(() => {
  state.articles = [];
  state.finds = [];
});

describe("blog article page read rule", () => {
  it("a published magazine article has no blog metadata and no blog page", async () => {
    // Published because its (members-only) issue was published.
    state.articles = [article({ magazine: 3 })];

    expect(await generateMetadata({ params: params() })).toEqual({});
    await expect(ArticleDetailPage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    // Nothing else on the route was read for it (no comments, no related).
    expect(state.finds.every((f) => f.collection === "articles")).toBe(true);
    expect(state.finds).toHaveLength(2);
  });

  it("the lookup itself applies the blog's one read rule", async () => {
    state.articles = [article()];
    await generateMetadata({ params: params() });
    expect(state.finds[0]).toEqual({
      collection: "articles",
      where: {
        and: [{ slug: { equals: "our-funding-plans" } }, publicArticleWhere()],
      },
    });
  });

  it("a member's article still in review has no blog metadata", async () => {
    state.articles = [article({ reviewStatus: "pending_review" })];
    expect(await generateMetadata({ params: params() })).toEqual({});
  });

  it("a public blog article keeps its metadata", async () => {
    state.articles = [article()];
    const meta = await generateMetadata({ params: params() });
    expect(meta.title).toBe("Our funding plans");
    expect(meta.description).toBe("Article - funding");
  });
});
