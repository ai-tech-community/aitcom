// The cover-story layout: the first item leads, the rest follow in a grid,
// in issue order.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { articleView, editorialView } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { CoverStoryLayout } from "./cover-story";
import { LAYOUTS } from "./registry";

const href = (slug: string) => `/magazines/agents-weekly/issue-4/${slug}`;

describe("cover-story layout", () => {
  it("the lead and grid pass teaser to each item", () => {
    renderWithIntl(
      <CoverStoryLayout
        items={[articleView(1), articleView(2)]}
        href={href}
        teaser={{ inlinePrompt: <p>Join to read the rest.</p> }}
      />,
    );
    for (const region of [
      screen.getByTestId("issue-lead"),
      screen.getByTestId("issue-grid"),
    ]) {
      expect(
        within(region).getByText("Join to read the rest."),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Opening of article 2.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Read article/ })).toBeNull();
  });

  it("is the layout registered for cover-story", () => {
    expect(LAYOUTS["cover-story"]).toBe(CoverStoryLayout);
  });

  it("renders the first item as the lead and the rest in the grid, in order", () => {
    renderWithIntl(
      <CoverStoryLayout
        teaser={null}
        items={[articleView(1), editorialView(2), articleView(3)]}
        href={href}
      />,
    );

    const lead = screen.getByTestId("issue-lead");
    expect(
      within(lead).getByRole("heading", { name: "Article 1" }),
    ).toBeInTheDocument();
    expect(within(lead).getByText("Excerpt of article 1.")).toBeInTheDocument();
    expect(
      within(lead).getByRole("link", { name: /Read article/ }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/issue-4/article-1");

    const grid = screen.getByTestId("issue-grid");
    const headings = within(grid)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(headings).toEqual(["Editorial 2", "Article 3"]);
    // The lead's excerpt is shown only on the lead.
    expect(within(grid).queryByText("Excerpt of article 3.")).toBeNull();
  });

  it("an issue of only editorial blocks still renders", () => {
    renderWithIntl(
      <CoverStoryLayout
        teaser={null}
        items={[editorialView(1), editorialView(2)]}
        href={href}
      />,
    );

    expect(
      within(screen.getByTestId("issue-lead")).getByText(
        "Body of editorial 1.",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("issue-grid")).getByText(
        "Body of editorial 2.",
      ),
    ).toBeInTheDocument();
  });

  it("an issue without items renders neither a lead nor a grid", () => {
    renderWithIntl(<CoverStoryLayout teaser={null} items={[]} href={href} />);
    expect(screen.queryByTestId("issue-lead")).toBeNull();
    expect(screen.queryByTestId("issue-grid")).toBeNull();
  });
});
