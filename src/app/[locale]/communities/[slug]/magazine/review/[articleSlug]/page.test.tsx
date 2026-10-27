import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/magazines/test-intl";
import type { ReviewPageData } from "@/server/magazines/article-review";

import en from "../../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  data: null as ReviewPageData | null,
  gateCalls: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => state.session,
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/article-review", () => ({
  loadArticleForReview: async (_deps: unknown, opts: unknown) => {
    state.gateCalls.push(opts);
    return state.data;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/magazines/editor/review/review-actions", () => ({
  ReviewActions: () => <section aria-label="Your decision" />,
}));

import MagazineReviewPage, { dynamic, generateMetadata } from "./page";

const params = () =>
  Promise.resolve({ locale: "en", slug: "night-owls", articleSlug: "evals" });

beforeEach(() => {
  state.session = { user: { id: "editor-1" } };
  state.gateCalls = [];
  state.data = {
    magazine: { id: 42, name: "The Gazette" },
    article: {
      id: 7,
      slug: "evals",
      title: "Why evals matter",
      type: "article",
      authorName: "Ada",
      content: {
        root: {
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "Start with a question." }],
            },
          ],
        },
      },
      reviewStatus: "pending_review",
      reviewNote: null,
      updatedAt: "2026-10-27T09:00:00.000Z",
    },
  };
});

describe("magazine review page", () => {
  it("is rendered per request and never indexed", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(await generateMetadata({ params: params() })).toMatchObject({
      title: "Read an article",
      robots: { index: false },
    });
  });

  it("sends guests to sign in and back", async () => {
    state.session = null;
    await expect(MagazineReviewPage({ params: params() })).rejects.toThrow(
      "NEXT_REDIRECT /en/auth/signin?redirect=/en/communities/night-owls/magazine/review/evals",
    );
    expect(state.gateCalls).toEqual([]);
  });

  it.each(["contributor", "member", "editor-from-another-community"])(
    "answers 404 when the gate says no (%s)",
    async (viewerId) => {
      state.session = { user: { id: viewerId } };
      state.data = null;
      await expect(MagazineReviewPage({ params: params() })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      expect(state.gateCalls).toEqual([
        { communitySlug: "night-owls", articleSlug: "evals", viewerId },
      ]);
    },
  );

  it("renders the article and the decision panel for a waiting article", async () => {
    const page = await MagazineReviewPage({ params: params() });
    expect(page.props).toEqual({
      data: state.data,
      communitySlug: "night-owls",
    });
    renderWithIntl(page);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Why evals matter",
    );
    expect(screen.getByText("Start with a question.")).toBeVisible();
    const stamp = screen.getByText("Oct 27, 2026");
    expect(stamp).toHaveClass("font-mono");
    expect(stamp).toHaveAttribute("datetime", "2026-10-27T09:00:00.000Z");
    expect(stamp.parentElement).toHaveTextContent("By Ada · sent Oct 27, 2026");
    expect(stamp.parentElement).not.toHaveClass("font-mono");
    expect(
      screen.getByRole("link", { name: "Back to the Magazine tab" }),
    ).toHaveAttribute("href", "/communities/night-owls/magazine");
    expect(screen.getByRole("region", { name: "Your decision" })).toBeVisible();
  });

  it.each([
    ["approved", "Approved", null],
    ["changes_requested", "Changes asked for", "Add a source"],
    ["rejected", "Not accepted", "Outside this issue's topic"],
  ])(
    "shows the decision and no panel for an article already decided (%s)",
    async (reviewStatus, label, reviewNote) => {
      Object.assign(state.data!.article, { reviewStatus, reviewNote });
      renderWithIntl(await MagazineReviewPage({ params: params() }));
      expect(screen.getByRole("status")).toHaveTextContent(label);
      if (reviewNote) expect(screen.getByText(reviewNote)).toBeVisible();
      expect(
        screen.queryByRole("region", { name: "Your decision" }),
      ).toBeNull();
      expect(screen.getByText("Start with a question.")).toBeVisible();
    },
  );
});
