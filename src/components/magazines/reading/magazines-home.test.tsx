// The `/magazines` home (mockup screen 1): the featured issue beside
// "Just published", then every magazine with topic chips.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { homeData, magazineCard, issueCard } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { MagazinesHome } from "./magazines-home";

/** Every dotted key path of a messages object. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("MagazinesHome", () => {
  it("features the newest issue and lists the next four as just published", () => {
    renderWithIntl(<MagazinesHome data={homeData()} activeTopic={null} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Stories from the communities building AI",
      }),
    ).toBeInTheDocument();

    const featured = screen.getByRole("region", { name: /Featured issue/ });
    expect(
      within(featured).getByRole("heading", { name: "Featured issue title" }),
    ).toBeInTheDocument();
    expect(
      within(featured).getByRole("link", { name: "Read the issue" }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/featured-issue");
    // The cover is decorative: the heading beside it names the issue.
    const cover = featured.querySelector("img");
    expect(cover).toHaveAttribute("src", "https://example.test/cover.png");
    expect(cover).toHaveAttribute("alt", "");
    // The home's one orange action.
    expect(
      within(featured).getByRole("link", { name: "Read the issue" }),
    ).toHaveAttribute("data-variant", "default");

    const justPublished = screen.getByRole("region", {
      name: /Just published/,
    });
    const items = within(justPublished).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      within(justPublished)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([2, 3, 4, 5].map((n) => `/magazines/agents-weekly/issue-${n}`));
    // A cross-magazine list names each issue's magazine.
    expect(within(items[0]!).getByText("Agents Weekly")).toBeInTheDocument();
  });

  it.each([
    ["the only public issue has a cover", { justPublished: [] }],
    [
      "the only public issue has no cover",
      {
        featured: null,
        justPublished: [
          issueCard({ id: 2, slug: "issue-2", title: "Featured issue title" }),
        ],
      },
    ],
  ])(
    "gives a lone featured issue the full width when %s",
    (_label, overrides) => {
      renderWithIntl(
        <MagazinesHome data={homeData(overrides)} activeTopic={null} />,
      );
      const featured = screen.getByRole("region", { name: /Featured issue/ });
      expect(
        within(featured).getByRole("heading", { name: "Featured issue title" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: /Just published/ }),
      ).toBeNull();
      // No second track is reserved for a column that is not there.
      expect(featured.parentElement!.className).not.toMatch(/grid-cols/);
    },
  );

  it("keeps the side column beside the featured issue when there is more", () => {
    renderWithIntl(<MagazinesHome data={homeData()} activeTopic={null} />);
    const featured = screen.getByRole("region", { name: /Featured issue/ });
    expect(featured.parentElement!.className).toMatch(
      /lg:grid-cols-\[minmax\(0,1fr\)_22rem\]/,
    );
  });

  it("features the newest issue when no issue has a cover", () => {
    const data = homeData({
      featured: null,
      justPublished: [2, 3, 4].map((n) =>
        issueCard({ id: n, slug: `issue-${n}`, title: `Just published ${n}` }),
      ),
    });
    renderWithIntl(<MagazinesHome data={data} activeTopic={null} />);

    const featured = screen.getByRole("region", { name: /Featured issue/ });
    expect(
      within(featured).getByRole("heading", { name: "Just published 2" }),
    ).toBeInTheDocument();
    const justPublished = screen.getByRole("region", {
      name: /Just published/,
    });
    expect(within(justPublished).getAllByRole("listitem")).toHaveLength(2);
  });

  it("topic chips filter by link and mark the active topic", () => {
    renderWithIntl(<MagazinesHome data={homeData()} activeTopic="evals" />);

    const chips = screen.getByRole("navigation", {
      name: "Filter magazines by topic",
    });
    const links = within(chips).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["All", "/magazines"],
      ["agents", "/magazines?topic=agents"],
      ["evals", "/magazines?topic=evals"],
      ["robots", "/magazines?topic=robots"],
    ]);
    const current = links.filter((link) => link.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("evals");
    expect(current[0]).toHaveAttribute("aria-current", "page");
    // The active chip is ink, never Signal Orange (One Voice Rule).
    expect(current[0]!.className).toContain("bg-foreground");
    expect(current[0]!.className).not.toMatch(/bg-primary\b/);

    // Every magazine card links to its shelf.
    const all = screen.getByRole("region", { name: /All magazines/ });
    expect(
      within(all)
        .getAllByRole("link", { name: /Magazine \d/ })
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/magazines/magazine-1", "/magazines/magazine-2"]);
  });

  it("names a magazine tile by the magazine, not by its newest issue's cover", () => {
    const withCover = magazineCard(1);
    withCover.latest = {
      ...withCover.latest,
      coverImageUrl: "https://example.test/latest.png",
    };
    renderWithIntl(
      <MagazinesHome
        data={homeData({ magazines: [withCover] })}
        activeTopic={null}
      />,
    );
    const all = screen.getByRole("region", { name: /All magazines/ });
    const tile = within(all).getByRole("link", { name: /Magazine 1/ });
    expect(tile.querySelector("img")).toHaveAttribute("alt", "");
    expect(tile).not.toHaveAccessibleName(/Latest of magazine 1/);
  });

  it("marks 'All' when no topic is chosen and keeps an active topic missing from the chips", () => {
    const { unmount } = renderWithIntl(
      <MagazinesHome data={homeData()} activeTopic={null} />,
    );
    const chips = screen.getByRole("navigation", {
      name: "Filter magazines by topic",
    });
    expect(within(chips).getByRole("link", { name: "All" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    unmount();

    renderWithIntl(
      <MagazinesHome data={homeData({ magazines: [] })} activeTopic="space" />,
    );
    const filtered = screen.getByRole("navigation", {
      name: "Filter magazines by topic",
    });
    expect(
      within(filtered).getByRole("link", { name: "space" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByText("No magazines about space yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Show all magazines" }),
    ).toHaveAttribute("href", "/magazines");
  });

  it("shows a teaching empty state when nothing is public yet", () => {
    renderWithIntl(
      <MagazinesHome
        data={{ featured: null, justPublished: [], magazines: [], topics: [] }}
        activeTopic={null}
      />,
    );
    expect(screen.getByText("No magazines to read yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Communities make magazines from their members/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Explore communities" }),
    ).toHaveAttribute("href", "/communities");
    expect(screen.queryByRole("region", { name: /Featured issue/ })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Filter magazines by topic" }),
    ).toBeNull();
  });

  it("has every home and shelf text in English and Dutch", () => {
    for (const ns of ["home", "shelf", "meta"] as const) {
      expect(keyPaths(nl.magazines[ns]).sort()).toEqual(
        keyPaths(en.magazines[ns]).sort(),
      );
    }
  });
});
