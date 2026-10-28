import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueStats } from "@/test/magazine-issue-stats";
import { renderWithIntl } from "../../test-intl";
import { IssueStatsView } from "./issue-stats-view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const props = {
  stats: issueStats,
  communityName: "Night Owls",
  communitySlug: "night-owls",
};

beforeEach(() => vi.clearAllMocks());

describe("issue numbers", () => {
  it("renders tiles and the articles table with mono numbers and Sans labels", () => {
    renderWithIntl(<IssueStatsView {...props} />);
    expect(
      screen.getByRole("heading", { name: "How issue 3 is doing" }),
    ).toBeVisible();
    expect(
      screen.getByText("Numbers").closest("[data-slot=section-label]"),
    ).not.toBeNull();
    for (const [label, value] of [
      ["Views", "30"],
      ["Readers", "12"],
      ["New subscribers", "4"],
      ["Joined Night Owls", "2"],
    ]) {
      const term = screen
        .getAllByText(label!)
        .find((element) => element.tagName === "DT")!;
      expect(term).not.toHaveClass("font-mono");
      expect(term.nextElementSibling).toHaveTextContent(value!);
      expect(term.nextElementSibling).toHaveClass("font-mono");
    }
    const table = screen.getByRole("table", { name: "Articles" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Article", "Readers", "Read to the end"]);
    for (const cell of within(table).getAllByRole("columnheader")) {
      expect(cell).toHaveAttribute("scope", "col");
      expect(cell).not.toHaveClass("font-mono");
    }
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Building together", "Small steps"]);
    for (const cell of within(table).getAllByRole("rowheader"))
      expect(cell).toHaveAttribute("scope", "row");
    expect(
      within(table)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["10", "6", "0", "0"]);
    for (const cell of within(table).getAllByRole("cell"))
      expect(cell).toHaveClass("font-mono");
    expect(
      screen.getByText(
        "People who are not signed in count once a day. Your own visits as an editor are not counted.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to the issue" }),
    ).toHaveAttribute("href", "/communities/night-owls/magazine/issues/5/edit");
    expect(screen.queryByText(/No reads yet/)).toBeNull();
  });

  it("shows what will appear when everything is zero", () => {
    renderWithIntl(
      <IssueStatsView
        {...props}
        stats={{
          ...issueStats,
          views: 0,
          readers: 0,
          newSubscribers: 0,
          joins: 0,
          articles: issueStats.articles.map((article) => ({
            ...article,
            readers: 0,
            readToEnd: 0,
          })),
        }}
      />,
    );
    expect(
      screen.getByText(
        "No reads yet. Numbers show up here when people open the issue.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("rowheader", { name: "Small steps" }),
    ).toBeVisible();
  });

  it("keeps numbers when an issue has subscribers but no reads", () => {
    renderWithIntl(
      <IssueStatsView
        {...props}
        stats={{ ...issueStats, views: 0, readers: 0, joins: 0, articles: [] }}
      />,
    );
    expect(screen.queryByText(/No reads yet/)).toBeNull();
  });
});
