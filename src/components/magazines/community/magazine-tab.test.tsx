// The community's Magazine tab: the latest issue, the archive shelf, and the
// editor desk for editors only.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CommunityMagazineTabData } from "@/server/magazines/reading";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The desk is a client island with its own data; here only who gets it.
vi.mock("../editor/editor-desk", () => ({
  EditorDesk: ({ slug }: { slug: string }) => (
    <section aria-label="Editor desk stub" data-slug={slug} />
  ),
}));

import { issueCard } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { MagazineTab } from "./magazine-tab";

const latest = issueCard();
const older = issueCard({
  id: 6,
  number: 3,
  slug: "issue-3",
  title: "Issue three",
  visibility: "members",
  effectiveVisibility: "members",
});

function tabData(
  overrides: Partial<CommunityMagazineTabData> = {},
): CommunityMagazineTabData {
  return {
    magazine: {
      id: 3,
      name: "Agents Weekly",
      slug: "agents-weekly",
      logoUrl: null,
      description: "A monthly magazine about agents that work.",
      topics: ["agents"],
    },
    latest,
    issues: [latest, older],
    viewerIsEditor: false,
    ...overrides,
  };
}

describe("MagazineTab", () => {
  it("leads with the latest issue and shelves the older ones", () => {
    renderWithIntl(
      <MagazineTab data={tabData()} communitySlug="amsterdam-ai" />,
    );

    const read = screen.getByRole("link", { name: "Read the issue" });
    expect(read).toHaveAttribute("href", "/magazines/agents-weekly/issue-4");
    // Ink, not orange: the community frame's Join is this page's one orange
    // action, so a signed-in non-member never sees two (One Voice Rule).
    expect(read).toHaveAttribute("data-variant", "ink");
    const shelf = screen.getByRole("region", { name: /Past issues/ });
    const covers = within(shelf).getAllByRole("listitem");
    expect(covers).toHaveLength(1);
    expect(within(covers[0]!).getByText("Issue three")).toBeInTheDocument();
    expect(within(covers[0]!).getByText("Members only")).toBeInTheDocument();
  });

  it("spends no orange of its own: the community frame owns it", () => {
    const { container } = renderWithIntl(
      <MagazineTab data={tabData()} communitySlug="amsterdam-ai" />,
    );
    expect(container.querySelectorAll('[data-variant="default"]')).toHaveLength(
      0,
    );
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(0);
  });

  it("shows the editor desk only to editors", () => {
    const { unmount } = renderWithIntl(
      <MagazineTab data={tabData()} communitySlug="amsterdam-ai" />,
    );
    expect(
      screen.queryByRole("region", { name: "Editor desk stub" }),
    ).toBeNull();
    unmount();

    renderWithIntl(
      <MagazineTab
        data={tabData({ viewerIsEditor: true })}
        communitySlug="amsterdam-ai"
      />,
    );
    expect(
      screen.getByRole("region", { name: "Editor desk stub" }),
    ).toHaveAttribute("data-slug", "amsterdam-ai");
  });

  it("empty state for editors when there is no magazine yet", () => {
    renderWithIntl(
      <MagazineTab
        data={tabData({
          magazine: null,
          latest: null,
          issues: [],
          viewerIsEditor: true,
        })}
        communitySlug="amsterdam-ai"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Start a magazine" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai/settings/magazine");
    expect(
      screen.queryByRole("region", { name: "Editor desk stub" }),
    ).toBeNull();
  });

  it("teaches readers that the first issue is coming when none is published", () => {
    renderWithIntl(
      <MagazineTab
        data={tabData({ latest: null, issues: [] })}
        communitySlug="amsterdam-ai"
      />,
    );
    expect(screen.getByText("No issues yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Read the issue" })).toBeNull();
  });
});
