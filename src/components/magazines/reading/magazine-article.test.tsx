vi.mock("./read-tracker", () => ({
  ReadTracker: (props: {
    issueId: number;
    articleId?: number;
    enabled: boolean;
    trackEnd: boolean;
  }) => <div data-testid="read-tracker" data-props={JSON.stringify(props)} />,
}));

vi.mock("./subscribe-button", () => ({
  SubscribeButton: (props: {
    issueId?: number;
    magazineSlug: string;
    magazineName: string;
  }) => <div data-testid="subscribe" data-props={JSON.stringify(props)} />,
}));
// The magazine article long-read: context line, title, byline, body with a
// contents list, "Next in this issue", comments and JSON-LD.
import { screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const commentProps = vi.hoisted(() => ({ last: null as unknown }));

import type * as JoinPrompt from "./magazine-join-prompt";

vi.mock("./magazine-join-prompt", async (original) => {
  const { MagazineJoinPromptView } = await original<typeof JoinPrompt>();
  return {
    MagazineJoinPrompt: (
      props: React.ComponentProps<typeof JoinPrompt.MagazineJoinPrompt>,
    ) => (
      <div
        data-testid={`join-${props.variant}`}
        data-focus-target={props.focusTargetId}
        data-source={JSON.stringify(props.source)}
      >
        <MagazineJoinPromptView
          community={props.community}
          variant={props.variant}
          action={{ kind: "join" }}
          onRun={() => undefined}
          busy={false}
        />
      </div>
    ),
  };
});

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
  previewArticlePage,
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
  it.each(["teaser", "full", "editor"] as const)(
    "tracks article reads for %s readers and passes the subscription source",
    (access) => {
      const data =
        access === "teaser" ? previewArticlePage() : articlePage({ access });
      renderWithIntl(<MagazineArticle data={data} comments={[]} />);
      expect(
        JSON.parse(screen.getByTestId("read-tracker").dataset.props!),
      ).toEqual({
        issueId: data.issue.id,
        articleId: data.article.id,
        enabled: access !== "editor",
        trackEnd: data.mode === "full",
      });
      expect(
        JSON.parse(screen.getByTestId("subscribe").dataset.props!),
      ).toEqual({
        magazineSlug: data.magazine.slug,
        magazineName: data.magazine.name,
        issueId: data.issue.id,
      });
    },
  );

  it.each(["none", "teaser", "full"] as const)(
    "sharing after the article follows outsider reach %s",
    (outsiderReach) => {
      const data =
        outsiderReach === "teaser"
          ? previewArticlePage()
          : articlePage({ issue: { outsiderReach } });
      renderWithIntl(<MagazineArticle data={data} comments={[]} />);
      expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
      expect(screen.queryByRole("link", { name: /Share on X/ }) !== null).toBe(
        outsiderReach !== "none",
      );
    },
  );
  it("a preview article shows the start, the join panel and no comments", () => {
    const { container } = renderWithIntl(
      <MagazineArticle data={previewArticlePage()} comments={comments} />,
    );
    expect(
      screen.getByText("Every agent needs a way to say no."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This is the start of the article."),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("heading", { level: 1 }).closest("header")!,
      ).getByText("4 min read"),
    ).toHaveClass("font-mono");
    expect(
      screen.queryByRole("navigation", { name: "In this article" }),
    ).toBeNull();
    expect(screen.queryByTestId("article-comments")).toBeNull();
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("join-panel")).toHaveAttribute(
      "data-focus-target",
      title.id,
    );
    expect(
      JSON.parse(screen.getByTestId("join-panel").dataset.source!),
    ).toEqual({ via: "magazine", magazineId: 3, issueId: 7 });
    expect(container.querySelectorAll('[data-variant="default"]')).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("link", { name: "Back to the issue" }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/issue-4");
    expect(screen.getByRole("link", { name: "Article 2" })).toHaveAttribute(
      "href",
      "/magazines/agents-weekly/issue-4/article-2",
    );
    expect(screen.queryByTestId("join-inline")).toBeNull();
    expect(
      within(
        screen.getByRole("region", { name: "Next in this issue" }),
      ).getByText("Excerpt of article 2."),
    ).toBeInTheDocument();
  });

  it("marks a preview article as not free in structured data", () => {
    const { container } = renderWithIntl(
      <MagazineArticle data={previewArticlePage()} comments={[]} />,
    );
    expect(jsonLd(container)[0]).toMatchObject({
      "@type": "Article",
      isAccessibleForFree: false,
    });
  });

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
    expect(within(next).getByText("Excerpt of article 2.")).toBeInTheDocument();
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
      <MagazineArticle data={previewArticlePage()} comments={[]} />,
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
