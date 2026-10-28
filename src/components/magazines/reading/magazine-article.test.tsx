// The magazine article long-read: context line, title, byline, body with a
// contents list, "Next in this issue", comments and JSON-LD.
import { screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const commentProps = vi.hoisted(() => ({ last: null as unknown }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// The real thread talks to tRPC and auth; the page only owes it the props.
vi.mock("@/components/blog/article-comments", () => ({
  ArticleComments: (props: unknown) => {
    commentProps.last = props;
    return <section data-testid="article-comments" />;
  },
}));

import {
  articlePage,
  lexicalWithHeadings,
  magazineArticle,
} from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { MagazineArticle } from "./magazine-article";

const noop = () => undefined;

beforeAll(() => {
  // jsdom has no IntersectionObserver; the contents list highlights with it.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const comments = [
  {
    id: 11,
    content: "Great read.",
    parentId: null,
    createdAt: "2026-11-03T10:00:00.000Z",
    authorId: "user-2",
    authorName: "Ada",
  },
];

function jsonLd(container: HTMLElement): Record<string, unknown>[] {
  return [
    ...container.querySelectorAll('script[type="application/ld+json"]'),
  ].map((el) => JSON.parse(el.textContent ?? "{}") as Record<string, unknown>);
}

describe("MagazineArticle", () => {
  it("renders the body with the shared Lexical renderer and a contents list from its headings", () => {
    renderWithIntl(
      <MagazineArticle
        data={articlePage()}
        comments={comments}
        currentUserId="user-1"
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Agents that know when to stop",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Every agent needs a way to say no."),
    ).toBeInTheDocument();

    const contents = screen.getByRole("navigation", {
      name: "In this article",
    });
    const links = within(contents).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Why agents refuse",
      "What changes for builders",
    ]);
    // Every contents entry lands on a heading the renderer drew.
    for (const link of links) {
      const target = link.getAttribute("href")!.slice(1);
      expect(document.getElementById(target)?.tagName).toBe("H2");
    }

    expect(screen.getByText("By Sanne de Vries")).toBeInTheDocument();
    expect(screen.getByText("1 min read")).toHaveClass("font-mono");
  });

  it("has no contents list for an article with fewer than two headings", () => {
    renderWithIntl(
      <MagazineArticle
        data={articlePage({
          article: magazineArticle({
            content: lexicalWithHeadings("A short note.", ["Only heading"]),
          }),
        })}
        comments={[]}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "In this article" }),
    ).not.toBeInTheDocument();
  });

  it("links back to the issue and to the next article in the issue", () => {
    renderWithIntl(
      <MagazineArticle data={articlePage()} comments={comments} />,
    );

    const context = screen.getByRole("navigation", {
      name: "Where this article appears",
    });
    expect(
      within(context).getByRole("link", { name: "Agents Weekly" }),
    ).toHaveAttribute("href", "/magazines/agents-weekly");
    expect(
      within(context).getByRole("link", { name: "Issue 04" }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/issue-4");

    const next = screen.getByRole("region", { name: "Next in this issue" });
    expect(
      within(next).getByRole("link", { name: "Article 2" }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/issue-4/article-2");
  });

  it("the last article in an issue offers the way back to the issue", () => {
    renderWithIntl(
      <MagazineArticle
        data={articlePage({ nextInIssue: null })}
        comments={comments}
      />,
    );
    const next = screen.getByRole("region", { name: "Next in this issue" });
    expect(
      within(next).getByRole("link", { name: "Back to the issue" }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/issue-4");
  });

  it("marks preview articles as not fully accessible for free in JSON-LD", () => {
    const { container } = renderWithIntl(
      <MagazineArticle
        data={articlePage({
          access: "teaser",
          issue: {
            visibility: "teaser",
            effectiveVisibility: "teaser",
            outsiderReach: "teaser",
          },
        })}
        comments={[]}
      />,
    );
    expect(jsonLd(container)[0]).toMatchObject({
      "@type": "Article",
      isAccessibleForFree: false,
    });
  });

  it("emits JSON-LD only when the issue reaches outsiders", () => {
    const { container, unmount } = renderWithIntl(
      <MagazineArticle data={articlePage()} comments={comments} />,
    );
    const [data] = jsonLd(container);
    expect(data).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Agents that know when to stop",
      datePublished: "2026-11-02T09:00:00.000Z",
      author: { "@type": "Person", name: "Sanne de Vries" },
      url: "https://www.aitcommunity.org/en/magazines/agents-weekly/issue-4/agents-that-know-when-to-stop",
      isPartOf: {
        "@type": "PublicationIssue",
        issueNumber: 4,
        name: "The month agents learned to say no",
        url: "https://www.aitcommunity.org/en/magazines/agents-weekly/issue-4",
        isPartOf: {
          "@type": "Periodical",
          name: "Agents Weekly",
          url: "https://www.aitcommunity.org/en/magazines/agents-weekly",
        },
      },
    });
    unmount();

    // Stored public but unconfirmed in an unlisted community: members-only.
    for (const data of [
      articlePage({
        magazine: { ...articlePage().magazine, staffHidden: true },
      }),
      articlePage({
        issue: {
          visibility: "public",
          effectiveVisibility: "members",
          outsiderReach: "none",
        },
      }),
      articlePage({
        issue: {
          visibility: "members",
          effectiveVisibility: "members",
          outsiderReach: "none",
        },
      }),
      articlePage({
        access: "editor",
        issue: { status: "draft", outsiderReach: "none" },
      }),
    ]) {
      const { container: other, unmount: done } = renderWithIntl(
        <MagazineArticle data={data} comments={comments} />,
      );
      expect(jsonLd(other)).toEqual([]);
      done();
    }
  });

  it("hands the comments to the shared thread, and shows editors a quiet note on a draft instead", () => {
    renderWithIntl(
      <MagazineArticle
        data={articlePage()}
        comments={comments}
        currentUserId="user-1"
      />,
    );
    expect(screen.getByTestId("article-comments")).toBeInTheDocument();
    expect(commentProps.last).toEqual({
      articleId: 1,
      initialComments: comments,
      currentUserId: "user-1",
    });
    expect(
      screen.queryByText("Draft — only editors can see this"),
    ).not.toBeInTheDocument();
  });

  it("an unpublished article (editors only) has the draft note and no comment thread", () => {
    renderWithIntl(
      <MagazineArticle
        data={articlePage({
          access: "editor",
          issue: { status: "draft", publishedAt: null, outsiderReach: "none" },
          article: magazineArticle({ status: "draft", publishedAt: null }),
        })}
        comments={[]}
      />,
    );
    expect(
      screen.getByText("Draft — only editors can see this"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("article-comments")).not.toBeInTheDocument();
  });
});
