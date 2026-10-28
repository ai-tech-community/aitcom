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
        lead={false}
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
        <IssueItem teaser={null} view={view} lead={false} href={href} />,
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
          lead={false}
          href={href}
        />
        <IssueItem
          teaser={null}
          view={editorialView(2)}
          lead={false}
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
      <IssueItem teaser={null} view={view} lead={true} href={href} />,
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
        lead={false}
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
          lead={true}
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
        lead={true}
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
        lead={false}
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
        lead={false}
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
          lead={false}
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
        lead={false}
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
        lead={true}
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
          lead={false}
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
        lead={false}
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
        lead={true}
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
        lead={false}
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
          lead={false}
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
      lead={false}
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
        lead={true}
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
