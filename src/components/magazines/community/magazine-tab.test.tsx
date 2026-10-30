// The community's Magazine tab: the latest issue, the archive shelf, and the
// editor desk for editors only.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { roleCan, type MagazineRole } from "@/lib/magazines/roles";
import type { CommunityMagazineTabData } from "@/server/magazines/reading";

vi.mock("../reading/subscribe-button", () => ({
  SubscribeButton: ({
    magazineSlug,
    magazineName,
  }: {
    magazineSlug: string;
    magazineName: string;
  }) => (
    <div data-testid="subscribe" data-slug={magazineSlug}>
      {magazineName}
    </div>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The desk is a client island with its own data; here only who gets it.
vi.mock("../editor/editor-desk", () => ({
  EditorDesk: ({ slug, canManage }: { slug: string; canManage: boolean }) => (
    <section
      aria-label="Editor desk stub"
      data-slug={slug}
      data-manage={canManage}
    />
  ),
}));

vi.mock("../editor/contributor-desk", () => ({
  ContributorDesk: ({ slug }: { slug: string }) => (
    <section aria-label="Writing desk stub" data-slug={slug} />
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
      staffHidden: false,
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
    viewerRole: null,
    draftIssues: [],
    ...overrides,
  };
}

describe("MagazineTab", () => {
  it.each(["contributor", "editor", "editor_in_chief", null] as const)(
    "offers to subscribe on the Magazine tab (%s)",
    (viewerRole) => {
      renderWithIntl(
        <MagazineTab
          communitySlug="amsterdam-ai"
          data={tabData({
            viewerRole,
            viewerIsEditor: roleCan(viewerRole, "edit"),
          })}
        />,
      );
      const subscribe = screen.getByTestId("subscribe");
      expect(subscribe).toHaveAttribute("data-slug", "agents-weekly");
      expect(subscribe).toHaveTextContent("Agents Weekly");
      const header = screen
        .getByRole("heading", { name: "Agents Weekly" })
        .closest("header")!;
      expect(header).toContainElement(subscribe);
      expect(
        within(subscribe.parentElement!).getByRole("link", {
          name: "Magazine page",
        }),
      ).toHaveAttribute("data-variant", "outline");
    },
  );

  it.each([true, false])(
    "offers no subscription when the community has no magazine (editor: %s)",
    (viewerIsEditor) => {
      renderWithIntl(
        <MagazineTab
          communitySlug="amsterdam-ai"
          data={tabData({
            magazine: null,
            latest: null,
            issues: [],
            viewerIsEditor,
          })}
        />,
      );
      expect(screen.queryByTestId("subscribe")).toBeNull();
    },
  );

  it.each(["contributor", "editor", "editor_in_chief", null] as const)(
    "shows the writing desk to contributors and the editor's desk to editors (%s)",
    (viewerRole: MagazineRole | null) => {
      renderWithIntl(
        <MagazineTab
          communitySlug="amsterdam-ai"
          data={tabData({
            viewerRole,
            viewerIsEditor: roleCan(viewerRole, "edit"),
          })}
        />,
      );
      const editor = screen.queryByRole("region", { name: "Editor desk stub" });
      const writer = screen.queryByRole("region", {
        name: "Writing desk stub",
      });
      if (viewerRole === "contributor") {
        expect(writer).toHaveAttribute("data-slug", "amsterdam-ai");
        expect(editor).toBeNull();
      } else if (viewerRole !== null) {
        expect(editor).toHaveAttribute(
          "data-manage",
          String(viewerRole === "editor_in_chief"),
        );
        expect(writer).toBeNull();
      } else {
        expect(editor).toBeNull();
        expect(writer).toBeNull();
      }
    },
  );

  it("reuses the reader's empty description for contributors", () => {
    renderWithIntl(
      <MagazineTab
        communitySlug="amsterdam-ai"
        data={tabData({ latest: null, issues: [], viewerRole: "contributor" })}
      />,
    );
    expect(
      screen.getByText("The first issue of Agents Weekly is on its way."),
    ).toBeInTheDocument();
  });

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
        data={tabData({ viewerIsEditor: true, viewerRole: "editor_in_chief" })}
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
          viewerRole: "editor_in_chief",
        })}
        communitySlug="amsterdam-ai"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Start a magazine" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai/magazine/settings");
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

  it("shows an editor their drafts instead of saying there are no issues", () => {
    const draft = issueCard({
      id: 8,
      status: "draft",
      title: "Week one draft",
      slug: "week-one",
      publishedAt: null,
    });
    renderWithIntl(
      <MagazineTab
        data={tabData({
          latest: null,
          issues: [],
          viewerIsEditor: true,
          viewerRole: "editor_in_chief",
          draftIssues: [draft],
        })}
        communitySlug="amsterdam-ai"
      />,
    );
    expect(screen.queryByText("No issues yet")).toBeNull();
    expect(screen.getByRole("region", { name: "Drafts" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Week one draft")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Week one draft/ }),
    ).toHaveAttribute("href", "/magazines/agents-weekly/week-one");
  });

  it("does not show drafts to a reader", () => {
    renderWithIntl(
      <MagazineTab
        data={tabData({
          draftIssues: [
            issueCard({ id: 8, status: "draft", title: "Secret draft" }),
          ],
        })}
        communitySlug="amsterdam-ai"
      />,
    );
    expect(screen.queryByText("Secret draft")).toBeNull();
    expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
  });
});
