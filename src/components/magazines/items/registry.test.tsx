// Each item kind renders through its own renderer (ADR-0043); editors see a
// marker in place of an item whose content cannot be shown.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import nl from "../../../../messages/nl.json";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  articleView,
  launchpadProjectView,
  editorialView,
  eventView,
  forumThreadView,
  newsItemView,
  storylineView,
  unavailableView,
} from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { IssueItem, ITEM_RENDERERS } from "./registry";

const href = (slug: string) => `/magazines/agents-weekly/issue-4/${slug}`;

describe("issue item registry", () => {
  it.each([
    [
      articleView(1, { imageUrl: "https://example.test/cover.png" }),
      "Article 1",
      "Article",
      "4 min read",
    ],
    [editorialView(2), "Editorial 2", "Editorial", null],
    [storylineView(), "Story 1", "From AIT News", "14 sources"],
    [newsItemView(), "Headline 1", "From AIT News", "01 Nov 2026"],
    [eventView(), "Event 1", "Event", "24 Oct 2026"],
    [forumThreadView(), "Thread 1", "From the forum", "42 replies"],
    [launchpadProjectView(), "Project 1", "Launchpad project", "120 upvotes"],
  ] as const)(
    "every kind renders a row (%#)",
    (view, title, kindLine, fact) => {
      const { container } = renderWithIntl(
        <IssueItem
          view={{ ...view, intro: "Editor's introduction" }}
          size="row"
          href={href}
          teaser={null}
        />,
      );
      expect(screen.getByRole("heading")).toHaveTextContent(title);
      expect(screen.getByText(kindLine, { exact: true })).toBeVisible();
      expect(screen.getByText("Editor's introduction")).toHaveClass(
        "text-muted-foreground",
        "line-clamp-1",
      );
      if (fact) expect(screen.getByText(fact)).toHaveClass("font-mono");
      expect(container.querySelectorAll(".font-mono")).toHaveLength(
        fact ? 1 : 0,
      );
      expect(container.querySelector("img")).toBeNull();
      for (const text of [
        "Excerpt of article 1.",
        "Opening of article 1.",
        "Body of editorial 2.",
        "Overview of story 1.",
        "Summary of headline 1.",
        "Build together.",
        "By Sanne",
        "By Author 1",
        "Amsterdam",
        "example.com",
        "Prototype",
      ])
        expect(screen.queryByText(text)).toBeNull();
      expect(
        screen.queryByRole("link", { name: /Read article|Read the story/ }),
      ).toBeNull();
    },
  );

  it.each([
    articleView(1),
    editorialView(2),
    storylineView(),
    newsItemView(),
    eventView(),
    forumThreadView(),
    launchpadProjectView(),
  ])("renders the related size for $kind", (view) => {
    const { container } = renderWithIntl(
      <IssueItem view={view} size="related" href={href} teaser={null} />,
    );
    expect(
      container.querySelector(`[data-item-kind="${view.kind}"]`),
    ).not.toBeNull();
    expect(screen.getByRole("heading")).toBeVisible();
    if (view.kind === "article") {
      expect(screen.getByText("Excerpt of article 1.")).toBeVisible();
      expect(container.querySelector("img")).toBeNull();
      expect(screen.queryByRole("link", { name: "Read article" })).toBeNull();
    }
  });

  it("rows keep headlines without a URL as plain text and allow notes without a title", () => {
    renderWithIntl(
      <>
        <IssueItem
          view={newsItemView(1, { url: null })}
          size="row"
          href={href}
          teaser={null}
        />
        <IssueItem
          view={editorialView(1, { heading: null })}
          size="row"
          href={href}
          teaser={null}
        />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Headline 1" })).toBeVisible();
    expect(screen.getByText("A note from the editors")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    newsItemView(),
    eventView(),
    forumThreadView(),
    launchpadProjectView(),
    articleView(1),
  ])("places the $kind intro immediately after its heading", (view) => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={{ ...view, intro: "Editor's introduction" }}
        size="card"
        href={href}
      />,
    );
    expect(screen.getByRole("heading").nextElementSibling).toBe(
      screen.getByText("Editor's introduction"),
    );
  });

  it.each([articleView(1), storylineView(), newsItemView(), eventView()])(
    "separates adjacent $kind facts visually and with a spoken comma",
    (view) => {
      const { container } = renderWithIntl(
        <IssueItem teaser={null} view={view} size="card" href={href} />,
      );
      const separator = [
        ...container.querySelectorAll('span[aria-hidden="true"]'),
      ].find((element) => element.textContent?.trim() === "·");
      expect(separator).toBeDefined();
      expect(separator?.nextElementSibling).toHaveClass("sr-only");
      expect(separator?.nextElementSibling).toHaveTextContent(",");
    },
  );

  it("renders each kind through its own renderer", () => {
    expect(Object.keys(ITEM_RENDERERS).sort()).toEqual([
      "article",
      "editorial",
      "event",
      "forumThread",
      "launchpadProject",
      "newsItem",
      "storyline",
    ]);

    const { container } = renderWithIntl(
      <>
        <IssueItem
          teaser={null}
          view={articleView(1)}
          size="card"
          href={href}
        />
        <IssueItem
          teaser={null}
          view={editorialView(2)}
          size="card"
          href={href}
        />
      </>,
    );

    const articleLink = screen.getByRole("link", { name: "Article 1" });
    expect(articleLink).toHaveAttribute(
      "href",
      "/magazines/agents-weekly/issue-4/article-1",
    );
    expect(screen.getByText("Author 1", { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Editorial 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Body of editorial 2.")).toBeInTheDocument();
    expect(
      container.querySelector('[data-item-kind="article"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-item-kind="editorial"]'),
    ).not.toBeNull();
  });

  it("renders a story card that links to the story", () => {
    const view = { ...storylineView(), intro: "Our take" };
    const { container } = renderWithIntl(
      <IssueItem teaser={null} view={view} size="lead" href={href} />,
    );
    expect(screen.getByText("From AIT News")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Story 1" })).toHaveAttribute(
      "href",
      "/news/stories/story-1",
    );
    expect(screen.getByText("Our take")).toBeInTheDocument();
    expect(screen.getByText("Overview of story 1.")).toBeInTheDocument();
    expect(screen.getByText("14 sources").parentElement).toHaveClass(
      "font-mono",
    );
    expect(screen.getByText("Updated 24 Oct 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Read the story" }),
    ).toHaveAttribute("href", "/news/stories/story-1");
    expect(
      container.querySelector('[data-item-kind="storyline"]'),
    ).not.toBeNull();
    expect(screen.getByText("Overview of story 1.")).not.toHaveClass(
      "line-clamp-3",
    );
  });

  it("clamps other story cards and leaves out an absent update date", () => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={storylineView(2, { sourceCount: 1, updatedAt: null })}
        size="card"
        href={href}
      />,
    );
    expect(screen.getByText("Overview of story 2.")).toHaveClass(
      "line-clamp-3",
    );
    expect(screen.getByText("1 source")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Read the story" })).toBeNull();
    expect(screen.queryByText(/Updated/)).toBeNull();
  });

  it("shows the story facts and reading link in everyday Dutch", () => {
    render(
      <NextIntlClientProvider locale="nl" messages={nl} timeZone="UTC">
        <IssueItem
          teaser={null}
          view={storylineView()}
          size="lead"
          href={href}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Uit AIT News")).toBeInTheDocument();
    expect(screen.getByText("Bijgewerkt op 24 okt 2026")).toBeInTheDocument();
    expect(screen.getByText("14 bronnen")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Lees het verhaal" }),
    ).toHaveAttribute("href", "/news/stories/story-1");
  });

  it("renders a headline with its source, date and accessible external link", () => {
    const { container } = renderWithIntl(
      <IssueItem
        teaser={null}
        view={{ ...newsItemView(), intro: "Our take" }}
        size="lead"
        href={href}
      />,
    );
    expect(screen.getByText("From AIT News")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "Headline 1 (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://www.example.com/news-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("(opens in a new tab)")).toHaveClass("sr-only");
    expect(screen.getByText("01 Nov 2026")).toHaveClass("font-mono");
    expect(screen.getByText("example.com").closest(".font-mono")).toBeNull();
    expect(screen.getByText("Our take")).toBeInTheDocument();
    expect(screen.getByText("Summary of headline 1.")).toBeInTheDocument();
    expect(
      container.querySelector('[data-item-kind="newsItem"]'),
    ).not.toBeNull();
  });

  it("shows a plain headline without a web URL and leaves summaries out of compact cards", () => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={newsItemView(1, { url: null, source: null, publishedAt: null })}
        size="card"
        href={href}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Headline 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Summary of headline 1.")).toBeNull();
    expect(screen.queryByText("·", { exact: false })).toBeNull();
  });

  it("renders a single news fact without a stray separator", () => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={newsItemView(1, { publishedAt: null })}
        size="card"
        href={href}
      />,
    );
    expect(
      screen.getByText("example.com", { exact: true }).closest(".font-mono"),
    ).toBeNull();
    expect(screen.queryByText("·")).toBeNull();
  });

  it("announces the news link in everyday Dutch", () => {
    render(
      <NextIntlClientProvider locale="nl" messages={nl} timeZone="UTC">
        <IssueItem
          teaser={null}
          view={newsItemView()}
          size="card"
          href={href}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Uit AIT News")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Headline 1 (opent in een nieuw tabblad)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("01 nov 2026")).toHaveClass("font-mono");
  });

  it("shows editors a 'No longer available' marker and renders nothing else for it", () => {
    const { container } = renderWithIntl(
      <IssueItem
        teaser={null}
        view={unavailableView(1)}
        size="card"
        href={href}
      />,
    );

    expect(screen.getByText("No longer available")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector("[data-item-kind]")).toBeNull();
  });
});

describe("event cards", () => {
  it("links an event with its date range, city, cancelled badge and intro", () => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={{
          ...eventView(1, {
            status: "cancelled",
            endDate: "2026-10-25T00:00:00.000Z",
          }),
          intro: "Meet our neighbours",
        }}
        size="lead"
        href={href}
      />,
    );
    expect(screen.getByText("Event", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Event 1" })).toHaveAttribute(
      "href",
      "/events/event-1",
    );
    expect(screen.getByText("24–25 Oct 2026")).toHaveClass("font-mono");
    expect(screen.getByText("Amsterdam")).not.toHaveClass("font-mono");
    expect(screen.getByText("Cancelled")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getByText("Meet our neighbours")).toBeInTheDocument();
  });

  it("shows online events and completed status in everyday Dutch", () => {
    render(
      <NextIntlClientProvider locale="nl" messages={nl} timeZone="UTC">
        <IssueItem
          teaser={null}
          view={eventView(1, { online: true, status: "completed" })}
          size="card"
          href={href}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Evenement", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("24 okt 2026")).toHaveClass("font-mono");
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Afgelopen")).toBeInTheDocument();
    expect(screen.queryByText(/Amsterdam/)).toBeNull();
  });

  it("leaves out an absent city and the status badge for a published event", () => {
    const { container } = renderWithIntl(
      <IssueItem
        teaser={null}
        view={eventView(1, { city: null })}
        size="card"
        href={href}
      />,
    );
    expect(screen.queryByText(/·/)).toBeNull();
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();
  });
});

describe("forum thread cards", () => {
  it("uses the server-built path, with a byline, reply count and intro", () => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={{
          ...forumThreadView(1, {
            path: "/communities/custom/forum/server-built",
          }),
          intro: "Join the conversation",
        }}
        size="lead"
        href={href}
      />,
    );
    expect(screen.getByText("From the forum")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thread 1" })).toHaveAttribute(
      "href",
      "/communities/custom/forum/server-built",
    );
    expect(screen.getByText("By Sanne")).not.toHaveClass("font-mono");
    expect(screen.getByText("42 replies")).toHaveClass("font-mono");
    expect(screen.getByText("Join the conversation")).toBeInTheDocument();
  });

  it("shows a single reply and no absent author", () => {
    renderWithIntl(
      <IssueItem
        teaser={null}
        view={forumThreadView(1, { replyCount: 1, authorName: null })}
        size="card"
        href={href}
      />,
    );
    expect(screen.getByText("1 reply")).toBeInTheDocument();
    expect(screen.queryByText(/^By /)).toBeNull();
  });

  it("shows forum copy and reply plurals in everyday Dutch", () => {
    render(
      <NextIntlClientProvider locale="nl" messages={nl} timeZone="UTC">
        <IssueItem
          teaser={null}
          view={forumThreadView()}
          size="card"
          href={href}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Uit het forum")).toBeInTheDocument();
    expect(screen.getByText("Door Sanne")).toBeInTheDocument();
    expect(screen.getByText("42 reacties")).toBeInTheDocument();
  });
});

it("renders a project with its existing stage label, pitch, votes, byline and intro", () => {
  renderWithIntl(
    <IssueItem
      teaser={null}
      view={{ ...launchpadProjectView(), intro: "Our pick" }}
      size="card"
      href={href}
    />,
  );
  expect(screen.getByText("Launchpad project")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Project 1" })).toHaveAttribute(
    "href",
    "/launchpad/project-1",
  );
  expect(screen.getByText("Build together.")).toHaveClass("line-clamp-3");
  expect(screen.getByText("Prototype")).toBeInTheDocument();
  expect(screen.getByText("120 upvotes")).toHaveClass("font-mono");
  expect(screen.getByText("By Sanne")).toBeInTheDocument();
  expect(screen.getByText("Our pick")).toBeInTheDocument();
});

it("renders Dutch project copy and an unclamped lead pitch without an absent author", () => {
  render(
    <NextIntlClientProvider locale="nl" messages={nl}>
      <IssueItem
        teaser={null}
        view={launchpadProjectView(2, {
          voteCount: 1,
          authorName: null,
          stage: "idea",
        })}
        size="lead"
        href={href}
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("Launchpad-project")).toBeInTheDocument();
  expect(screen.getByText("Idee")).toBeInTheDocument();
  expect(screen.getByText("1 stem")).toHaveClass("font-mono");
  expect(screen.getByText("Build together.")).not.toHaveClass("line-clamp-3");
  expect(screen.queryByText(/Sanne/)).toBeNull();
});
