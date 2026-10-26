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
  editorialView,
  storylineView,
  unavailableView,
} from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { IssueItem, ITEM_RENDERERS } from "./registry";

const href = (slug: string) => `/magazines/agents-weekly/issue-4/${slug}`;

describe("issue item registry", () => {
  it("renders each kind through its own renderer", () => {
    expect(Object.keys(ITEM_RENDERERS).sort()).toEqual([
      "article",
      "editorial",
      "storyline",
    ]);

    const { container } = renderWithIntl(
      <>
        <IssueItem view={articleView(1)} lead={false} href={href} />
        <IssueItem view={editorialView(2)} lead={false} href={href} />
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
      <IssueItem view={view} lead={true} href={href} />,
    );
    expect(screen.getByText("From AIT News")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Story 1" })).toHaveAttribute(
      "href",
      "/news/stories/story-1",
    );
    expect(screen.getByText("Our take")).toBeInTheDocument();
    expect(screen.getByText("Overview of story 1.")).toBeInTheDocument();
    expect(screen.getByText("14 sources · Updated 24 Oct 2026")).toHaveClass(
      "font-mono",
    );
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
        <IssueItem view={storylineView()} lead={true} href={href} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Uit AIT News")).toBeInTheDocument();
    expect(
      screen.getByText("14 bronnen · Bijgewerkt op 24 okt 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Lees het verhaal" }),
    ).toHaveAttribute("href", "/news/stories/story-1");
  });

  it("shows editors a 'No longer available' marker and renders nothing else for it", () => {
    const { container } = renderWithIntl(
      <IssueItem view={unavailableView(1)} lead={false} href={href} />,
    );

    expect(screen.getByText("No longer available")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector("[data-item-kind]")).toBeNull();
  });
});
