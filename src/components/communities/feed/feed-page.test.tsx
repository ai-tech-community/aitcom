import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  reels: { items: [] as unknown[] },
  reelsQuery: vi.fn(),
  topicsQuery: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    topics: { list: { useQuery: m.topicsQuery } },
    feed: {
      getReels: {
        useQuery: (input: unknown) => {
          m.reelsQuery(input);
          return { data: m.reels };
        },
      },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ promptAuth: vi.fn(), requireAuth: vi.fn() }),
}));
vi.mock("./post-composer", () => ({
  PostComposer: ({ canPost }: { canPost: boolean }) =>
    canPost ? <button>Composer</button> : null,
}));
vi.mock("./community-sidebar", () => ({
  CommunitySidebar: () => <div data-testid="community-sidebar" />,
}));
vi.mock("@/components/communities/community-about", () => ({
  CommunityAbout: ({ className }: { className?: string }) => (
    <section data-testid="community-about" className={className} />
  ),
}));
vi.mock("./community-activity-feed", () => ({
  CommunityActivityFeed: () => <div data-testid="community-activity-feed" />,
  FeedSkeleton: () => null,
}));
vi.mock("@/components/communities/onboarding/welcome-checklist", () => ({
  WelcomeChecklist: () => null,
}));
vi.mock("@/components/communities/first-session-path", () => ({
  HubFirstSessionPath: () => null,
}));

import { FeedPage } from "./feed-page";

function renderPage(member: boolean, feedFirst = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedPage
        slug="mlops"
        memberRole={member ? "member" : null}
        user={member ? { id: "user-1" } : null}
        feedPostPolicy="all_members"
        feedFirst={feedFirst}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.reels = { items: [] };
  m.reelsQuery.mockClear();
  m.topicsQuery.mockReset().mockReturnValue({ data: [] });
});

describe("FeedPage Reels entry", () => {
  it("shows Reels to a visitor when the community has a video they may watch", () => {
    m.reels = { items: [{ id: 1 }] };
    renderPage(false);
    expect(screen.getByRole("link", { name: "Reels" })).toHaveAttribute(
      "href",
      "/communities/mlops/reels",
    );
    expect(m.reelsQuery).toHaveBeenCalledWith({
      communitySlug: "mlops",
      limit: 1,
    });
  });

  it("shows Reels to a member too", () => {
    m.reels = { items: [{ id: 1 }] };
    renderPage(true);
    expect(screen.getByRole("link", { name: "Reels" })).toBeInTheDocument();
  });

  it("hides Reels when there are no videos", () => {
    renderPage(false);
    expect(
      screen.queryByRole("link", { name: "Reels" }),
    ).not.toBeInTheDocument();
  });
});

function home(role: "member" | "moderator" | null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedPage
        slug="workbench"
        home={{ communityName: "Workbench" }}
        feedPostPolicy="admins_only"
        memberRole={role}
        user={{ id: "user-1", name: "Test Member" }}
      />
    </NextIntlClientProvider>,
  );
}

describe("Community home posting access", () => {
  it("keeps a staff-only feed readable by an ordinary member", () => {
    home("member");
    expect(screen.getByText(en.redesign.homeFeed.readOnly)).toBeVisible();
    expect(screen.getByTestId("community-activity-feed")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Composer" }),
    ).not.toBeInTheDocument();
  });

  it("keeps moderator posting permissions", () => {
    home("moderator");
    expect(screen.getByRole("button", { name: "Composer" })).toBeVisible();
  });

  it("keeps member-only feed queries out of the visitor view", () => {
    home(null);
    expect(screen.getByText(en.communities.feed.joinTitle)).toBeVisible();
    expect(
      screen.queryByTestId("community-activity-feed"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("community-about")).toBeVisible();
  });
});

describe("Community home topic filters", () => {
  const general = { id: 1, slug: "general", label: "General" };
  const repairs = { id: 2, slug: "repairs", label: "Repairs" };

  it("hides the topic filters when General is the only topic", () => {
    m.topicsQuery.mockReturnValue({ data: [general] });
    home("member");

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByTestId("community-activity-feed")).toBeVisible();
  });

  it("offers All and both topics when there are two topics", () => {
    m.topicsQuery.mockReturnValue({ data: [general, repairs] });
    home("member");

    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "General" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Repairs" })).toBeVisible();
  });

  it.each([
    { data: undefined, cache: "without cached topics" },
    { data: [general, repairs], cache: "with cached topics" },
  ])("keeps Home readable when the topic query fails $cache", ({ data }) => {
    m.topicsQuery.mockReturnValue({ data, isError: true });
    home("member");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByTestId("community-activity-feed")).toBeVisible();
  });
});

describe("FeedPage side panel", () => {
  it("renders the side panel once, beside or below the feed by screen size", () => {
    const { container } = renderPage(true);
    expect(screen.getAllByTestId("community-sidebar")).toHaveLength(1);
    const panel = container.querySelector("[data-feed-side-panel]");
    expect(panel).toContainElement(screen.getByTestId("community-sidebar"));
    // Beside the feed only from xl: below that the community rail is
    // already taking the left of the page.
    expect(panel?.className).toMatch(/\bxl:sticky\b/);
    expect(panel?.className).not.toMatch(/\b(hidden|lg:sticky)\b/);
  });

  it("puts About first in reading order, then the feed, then the panel", () => {
    const { container } = renderPage(false);
    const about = screen.getByTestId("community-about");
    const panel = container.querySelector("[data-feed-side-panel]")!;
    expect(screen.getAllByTestId("community-about")).toHaveLength(1);
    // Same order in code as on screen, so keyboard and screen-reader users
    // meet About first at every size: no CSS `order` reshuffle.
    const grid = about.parentElement!;
    expect(grid.firstElementChild).toBe(about);
    expect(grid.lastElementChild).toBe(panel);
    expect(about.className).not.toMatch(/\border-/);
    // From xl, About and the panel share the right column.
    expect(about.className).toMatch(/\bxl:col-start-2\b/);
    expect(panel.className).toMatch(/\bxl:col-start-2\b/);
  });
});

it("puts the joined member’s feed before About in shell reading order", () => {
  renderPage(true, true);
  const about = screen.getByTestId("community-about");
  const feed = screen.getByTestId("community-activity-feed");
  expect(
    feed.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getAllByTestId("community-about")).toHaveLength(1);
});
