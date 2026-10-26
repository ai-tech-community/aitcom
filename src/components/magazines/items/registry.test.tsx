// Each item kind renders through its own renderer (ADR-0043); editors see a
// marker in place of an item whose content cannot be shown.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { articleView, editorialView, unavailableView } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { IssueItem, ITEM_RENDERERS } from "./registry";

const href = (slug: string) => `/magazines/agents-weekly/issue-4/${slug}`;

describe("issue item registry", () => {
  it("renders each kind through its own renderer", () => {
    expect(Object.keys(ITEM_RENDERERS).sort()).toEqual([
      "article",
      "editorial",
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
