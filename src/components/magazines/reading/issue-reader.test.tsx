// The issue reading view (mockup screen 2): contents, cover, editor's note,
// the layout and the rail.
vi.mock("./read-tracker", () => ({
  ReadTracker: (props: {
    issueId: number;
    articleId?: number;
    enabled: boolean;
    trackEnd: boolean;
  }) => <div data-testid="read-tracker" data-props={JSON.stringify(props)} />,
}));
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./subscribe-button", () => ({
  SubscribeButton: ({
    magazineSlug,
    magazineName,
    issueId,
  }: {
    magazineSlug: string;
    magazineName: string;
    issueId?: number;
  }) => (
    <div data-testid="subscribe" data-slug={magazineSlug} data-issue={issueId}>
      {magazineName}
    </div>
  ),
}));

import type * as JoinPrompt from "./magazine-join-prompt";

vi.mock("./magazine-join-prompt", async (original) => {
  const { MagazineJoinPromptView } = await original<typeof JoinPrompt>();
  return {
    MagazineJoinPromptProvider: ({ children }: { children: React.ReactNode }) =>
      children,
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

import {
  articleView,
  editorialView,
  issuePage,
  unavailableView,
} from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { IssueReader } from "./issue-reader";
import { itemAnchorId } from "./anchors";

describe("IssueReader", () => {
  it.each(["teaser", "full", "editor"] as const)(
    "tracks issue views for %s readers and passes the subscription source",
    (access) => {
      renderWithIntl(
        <IssueReader
          url="https://example.test/en/magazines/agents-weekly/issue-4"
          data={issuePage({ access })}
          locale="en"
        />,
      );
      expect(
        JSON.parse(screen.getByTestId("read-tracker").dataset.props!),
      ).toEqual({ issueId: 7, enabled: access !== "editor", trackEnd: false });
      expect(screen.getByTestId("subscribe")).toHaveAttribute(
        "data-issue",
        "7",
      );
    },
  );

  it.each(["none", "teaser", "full"] as const)(
    "sharing in the rail follows outsider reach %s",
    (outsiderReach) => {
      renderWithIntl(
        <IssueReader
          url="https://example.test/en/magazines/agents-weekly/issue-4"
          data={issuePage({ issue: { outsiderReach } })}
          locale="en"
        />,
      );
      expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
      expect(screen.getByRole("group", { name: "Share" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Share on X/ }) !== null).toBe(
        outsiderReach !== "none",
      );
    },
  );
  it("a preview shows openings and join prompts instead of Read article", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({
          access: "teaser",
          items: [articleView(1), articleView(2)],
        })}
        locale="en"
      />,
    );
    expect(screen.getByText("Opening of article 1.")).toBeInTheDocument();
    expect(screen.getByText("Opening of article 2.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Read article/ })).toBeNull();
    expect(screen.getAllByTestId("join-inline")).toHaveLength(2);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveAttribute("tabindex", "-1");
    expect(title.id).not.toBe("");
    for (const prompt of [
      ...screen.getAllByTestId("join-inline"),
      ...screen.getAllByTestId("join-panel"),
    ]) {
      expect(prompt).toHaveAttribute("data-focus-target", title.id);
      expect(JSON.parse(prompt.dataset.source!)).toEqual({
        via: "magazine",
        magazineId: 3,
        issueId: 7,
      });
    }
  });

  it("places complementary responsive join panels after the hero and before the layout", () => {
    const { container } = renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ access: "teaser" })}
        locale="en"
      />,
    );
    const panels = screen.getAllByTestId("join-panel");
    expect(panels).toHaveLength(2);
    const [mobile, rail] = panels.map((panel) => panel.parentElement!);
    expect(mobile).toHaveClass("xl:hidden");
    expect(mobile).not.toHaveClass("hidden");
    expect(rail).toHaveClass("hidden", "xl:block");
    expect(rail).not.toHaveClass("xl:hidden");
    const hero = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(hero.nextElementSibling).toBe(mobile);
    expect(
      mobile!.compareDocumentPosition(screen.getByTestId("issue-lead")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const panel of panels) {
      expect(within(panel).getByRole("button")).toHaveAttribute(
        "data-variant",
        "default",
      );
    }
    for (const prompt of screen.getAllByTestId("join-inline")) {
      expect(within(prompt).getByRole("button")).toHaveAttribute(
        "data-variant",
        "outline",
      );
    }
    const ids = [...container.querySelectorAll("[id]")].map(
      (element) => element.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a preview editorial shows its heading and intro, not its body", () => {
    const { container } = renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({
          access: "teaser",
          items: [
            editorialView(2, { intro: "An editorial intro.", body: null }),
          ],
        })}
        locale="en"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Editorial 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("An editorial intro.")).toBeInTheDocument();
    expect(screen.queryByText("Body of editorial 2.")).toBeNull();
    expect(
      container.querySelector('[data-item-kind="editorial"] > div'),
    ).toBeNull();
    expect(screen.queryByTestId("join-inline")).toBeNull();
  });

  it("tells an editor a scheduled issue is not public yet", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({
          access: "editor",
          issue: { status: "scheduled", publishedAt: null },
        })}
        locale="en"
      />,
    );
    expect(
      screen.getByText("Scheduled. Readers cannot see it yet."),
    ).toBeVisible();
    expect(screen.queryByText("Draft — only editors can see this")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Edit issue" }),
    ).toBeInTheDocument();
  });
  it("offers to subscribe in the rail", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage()}
        locale="en"
      />,
    );
    const subscribe = screen.getByTestId("subscribe");
    expect(subscribe).toHaveAttribute("data-slug", "agents-weekly");
    expect(subscribe).toHaveTextContent("Agents Weekly");
    const section = subscribe.closest("section")!;
    expect(
      within(section).getByText("A monthly magazine about agents that work."),
    ).toBeInTheDocument();
    const visit = within(section).getByRole("link", {
      name: "Visit Amsterdam AI Builders",
    });
    expect(visit).toHaveAttribute("data-variant", "outline");
    expect(
      subscribe.compareDocumentPosition(visit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("contents list links to every item anchor in order", () => {
    const data = issuePage();
    const { container } = renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={data}
        locale="en"
      />,
    );

    const contents = screen.getByRole("navigation", { name: "Contents" });
    const links = within(within(contents).getByRole("list")).getAllByRole(
      "link",
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#from-the-editor",
      ...data.items.map((item) => `#${itemAnchorId(item.itemId)}`),
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("From the editor"),
      expect.stringContaining("Article 1"),
      expect.stringContaining("Editorial 2"),
      expect.stringContaining("Article 3"),
    ]);
    // Every link lands on an element of the page.
    for (const link of links) {
      const id = link.getAttribute("href")!.slice(1);
      expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
    }
    expect(within(contents).getByText(/8 min read/)).toBeInTheDocument();
    expect(within(contents).getByText(/3 items/)).toBeInTheDocument();
  });

  it("leaves 'From the editor' out when the issue has no note", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ issue: { editorNote: null } })}
        locale="en"
      />,
    );
    const contents = screen.getByRole("navigation", { name: "Contents" });
    expect(within(contents).queryByText("From the editor")).toBeNull();
  });

  it("leaves 'From the editor' out when the note was cleared to an empty paragraph", () => {
    const cleared = {
      root: {
        type: "root",
        version: 1,
        children: [{ type: "paragraph", version: 1, children: [] }],
      },
    };
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ issue: { editorNote: cleared } })}
        locale="en"
      />,
    );
    const contents = screen.getByRole("navigation", { name: "Contents" });
    expect(within(contents).queryByText("From the editor")).toBeNull();
    expect(screen.queryByText("From the editor")).toBeNull();
  });

  it("only one primary (orange) button on the page", () => {
    const { container } = renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ access: "editor" })}
        locale="en"
      />,
    );
    expect(
      container.querySelectorAll('[data-variant="default"]').length,
    ).toBeLessThanOrEqual(1);
    expect(
      container.querySelectorAll(".bg-primary").length,
    ).toBeLessThanOrEqual(1);
  });

  it("shows the cover, the rail and a link to the community", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage()}
        locale="en"
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "The month agents learned to say no",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Issue 04/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visit Amsterdam AI Builders" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai");
    expect(screen.getByRole("link", { name: /Issue three/ })).toHaveAttribute(
      "href",
      "/magazines/agents-weekly/issue-3",
    );
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
  });

  it("opens on the hero: cover beside the title, community, date and the signed note", () => {
    const { container } = renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({
          issue: {
            coverImageUrl: "https://example.test/cover.png",
            publishedAt: "2026-11-02T10:00:00.000Z",
          },
        })}
        locale="en"
      />,
    );
    const hero = screen.getByRole("heading", { level: 1 }).closest("header")!;
    // The cover is decorative: the heading names the issue.
    expect(hero.querySelector("img")).toHaveAttribute("alt", "");
    expect(hero.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/cover.png",
    );
    expect(
      within(hero).getByText(/A magazine by Amsterdam AI Builders/),
    ).toBeInTheDocument();
    expect(
      within(hero).getByText("Published November 2, 2026"),
    ).toHaveAttribute("dateTime", "2026-11-02T10:00:00.000Z");
    const note = within(hero).getByRole("region", { name: /From the editor/ });
    expect(
      within(note).getByText("Welcome to this issue."),
    ).toBeInTheDocument();
    expect(within(note).getByText("— Noa K., editor")).toBeInTheDocument();
    // The note opens the issue in the hero, not again in the layout.
    expect(container.querySelectorAll("#from-the-editor")).toHaveLength(1);
  });

  it("typesets the cover when the issue has no cover image", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ issue: { coverImageUrl: null } })}
        locale="en"
      />,
    );
    const hero = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(hero.querySelector("img")).toBeNull();
    const typeset = hero.querySelector('[aria-hidden="true"]');
    expect(typeset).toHaveTextContent("04");
    expect(typeset).toHaveTextContent("Agents Weekly");
    expect(typeset).toHaveTextContent("The month agents learned to say no");
  });

  it("links to the magazine's shelf from every issue, the first one included", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ pastIssues: [] })}
        locale="en"
      />,
    );
    expect(screen.getByRole("link", { name: "Agents Weekly" })).toHaveAttribute(
      "href",
      "/magazines/agents-weekly",
    );
  });

  it("draft notice and Edit link appear only for editors", () => {
    const draft = { status: "draft" as const, publishedAt: null };

    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({
          access: "editor",
          issue: draft,
          items: [unavailableView(9)],
        })}
        locale="en"
      />,
    );
    expect(
      screen.getByText("Draft — only editors can see this"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit issue" })).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/issues/7/edit",
    );
    // The marker stands in for the item, and the contents name it too.
    expect(
      within(screen.getByRole("note")).getByText("No longer available"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Contents" })).getByText(
        "No longer available",
      ),
    ).toBeInTheDocument();
  });

  it("readers get neither the draft notice nor the Edit link", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage()}
        locale="en"
      />,
    );
    expect(screen.queryByText("Draft — only editors can see this")).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit issue" })).toBeNull();
  });

  it("editors of a published issue get the Edit link without the draft notice", () => {
    renderWithIntl(
      <IssueReader
        url="https://example.test/en/magazines/agents-weekly/issue-4"
        data={issuePage({ access: "editor" })}
        locale="en"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Edit issue" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Draft — only editors can see this")).toBeNull();
  });
});
