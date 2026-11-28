import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Component, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
const state = vi.hoisted(() => ({
  path: "/magazines/gazette/issue-1",
  segments: [] as string[],
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.path,
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("./shells/shell-unread", () => ({
  ShellUnreadProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => state.segments,
}));
import {
  resolveSiteShell,
  SiteChromeGate,
  SiteContent,
  SiteHubChrome,
  SiteShellProvider,
  type SiteShell,
} from "./site-chrome-gate";
import { PageMain, ShellMain } from "./page-main";
import NotFound from "@/app/[locale]/not-found";
import LocaleError from "@/app/[locale]/error";

function go(path: string) {
  state.path = path;
  state.segments = path.split("/").filter(Boolean);
}

function HubChrome() {
  return (
    <>
      <header>
        <nav aria-label="Hub navigation">Hub nav</nav>
        <button>Find a page</button>
        <button>Account</button>
      </header>
      <nav aria-label="Hub shortcuts">Mobile nav</nav>
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteShellProvider hubChrome={<HubChrome />}>
        <SiteChromeGate>
          <span>Legacy nav</span>
        </SiteChromeGate>
        <SiteHubChrome />
        <SiteContent>{children}</SiteContent>
        <SiteChromeGate slot="footer">
          <span>Footer</span>
        </SiteChromeGate>
        <SiteChromeGate slot="session">
          <span>Session chrome</span>
        </SiteChromeGate>
      </SiteShellProvider>
    </NextIntlClientProvider>
  );
}

function assertHubLandmarks() {
  expect(screen.getAllByRole("main")).toHaveLength(1);
  const main = screen.getByRole("main");
  expect(main).toHaveAttribute("data-site-shell", "hub");
  expect(main).toHaveAttribute("id", "shell-content");
  const header = screen.getByRole("banner");
  expect(header.parentElement).toBe(main.parentElement);
  expect(
    screen.getByRole("navigation", { name: "Hub shortcuts" }).parentElement,
  ).toBe(main.parentElement);
  expect(header).toContainElement(
    screen.getByRole("button", { name: "Find a page" }),
  );
  expect(header).toContainElement(
    screen.getByRole("button", { name: "Account" }),
  );
  expect(screen.queryByText("Legacy nav")).toBeNull();
}

describe("SiteChromeGate", () => {
  it("restores site navigation when a reader leaves the issue", () => {
    const { rerender } = render(
      <SiteChromeGate>
        <nav>Site navigation</nav>
      </SiteChromeGate>,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
    state.path = "/magazines/gazette";
    rerender(
      <SiteChromeGate>
        <nav>Site navigation</nav>
      </SiteChromeGate>,
    );
    expect(screen.getByRole("navigation")).toHaveTextContent("Site navigation");
  });
});

// Locale-free deep links from every row of the redesign route inventory.
const inventory: Record<SiteShell, string[]> = {
  hub: [
    "/",
    "/unknown/path",
    "/privacy",
    "/security",
    "/terms",
    "/communities",
    "/discover",
    "/community",
    "/community/sample",
    "/forum",
    "/forum/new",
    "/forum/sample",
    "/messages",
    "/messages/conversation-id",
    "/events",
    "/events/sample",
    "/events/world-summit-ai-amsterdam-2026",
    "/events/sample/agents",
    "/events/sample/gallery",
    "/events/sample/participants",
    "/events/sample/projects",
    "/events/sample/team",
    "/events/sample/timeline",
    "/events/sample/winners",
    "/events/sample/workspace",
    "/dashboard/events",
    "/members",
    "/members/member",
    "/members/member/activity",
    "/members/member/agent",
    "/members/member/work",
    "/members/member/badges",
    "/members/member/badges/sample",
    "/dashboard/notifications",
    "/unsubscribe",
    "/auth/signin",
    "/auth/signup",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/join",
    "/join/code",
    "/invite/token",
    "/invitations/unsubscribe",
    "/dashboard/onboarding",
    "/dashboard/payments",
    "/my-payments",
    "/dashboard",
    "/dashboard/settings",
    "/dashboard/communities",
    "/magazines",
    "/magazines/magazine-slug",
    "/magazine-subscriptions/confirm",
    "/launchpad",
    "/launchpad/new",
    "/launchpad/sample",
    "/launchpad/sample/edit",
    "/ideas",
    "/jobs",
    "/jobs/role-slug",
    "/dashboard/jobs",
    "/roles",
    "/news",
    "/news/stories",
    "/news/stories/sample",
    "/news/stories/contribute",
    "/news/stories/drafts",
    "/news/stories/drafts/draft-id",
    "/news/stories/manage",
    "/blog",
    "/blog/sample",
    "/blog/write",
    "/blog/edit/sample",
    "/blog/my-articles",
    "/agents",
    "/claim/token",
    "/dashboard/agent",
    "/setup",
    "/guides/agent-ready-community",
    "/guides/mcp-registry-vs-community-hub",
    "/guides/register-agent-mcp",
    "/investigations",
    "/investigations/awesome-ai-oss",
    "/investigations/awesome-ai-oss/insights",
    "/investigations/awesome-ai-oss/review",
    "/investigations/datacenters",
    "/investigations/datacenters/energy-growth",
    "/investigations/datacenters/market-power",
    "/investigations/datacenters/red-flags",
    "/investigations/datacenters/sample",
    "/investigations/datacenters/method",
    "/investigations/operators/sample",
    "/investigations/startups/sample",
    "/investigations/suppliers/sample",
    "/startups",
    "/startups/sample",
    "/startups/ai-tools-list",
    "/startups/claim",
    "/startups/insights",
    "/startups/submit",
    "/collectors/about",
    "/dashboard/collectors",
    "/dashboard/collectors/new/preset-id",
    "/dashboard/collectors/opt-outs",
    "/dashboard/collectors/runs",
    "/dashboard/collectors/runs/run-id",
    "/sponsors",
  ],
  focus: [
    "/og",
    "/communities/workbench-notes/events/new",
    "/communities/workbench-notes/events/event-slug/edit",
    "/communities/workbench-notes/classroom/course-slug/edit",
    "/members/member/badges/sample/image",
    "/communities/workbench-notes/magazine/issues/issue-id/edit",
    "/og/magazine/magazine-slug/issue-slug",
    "/og/magazine/magazine-slug/issue-slug/article-slug",
  ],
  community: [
    "/communities/workbench-notes",
    "/communities/workbench-notes/forum",
    "/communities/workbench-notes/forum/thread-slug",
    "/communities/workbench-notes/spaces/space-slug",
    "/communities/workbench-notes/events",
    "/communities/workbench-notes/events/event-slug/attendees",
    "/communities/workbench-notes/events/event-slug/judge",
    "/communities/workbench-notes/events/event-slug/manage",
    "/communities/workbench-notes/events/event-slug/manage/analytics",
    "/communities/workbench-notes/events/event-slug/manage/lifecycle",
    "/communities/workbench-notes/events/event-slug/manage/tasks",
    "/communities/workbench-notes/classroom",
    "/communities/workbench-notes/classroom/new",
    "/communities/workbench-notes/classroom/course-slug",
    "/communities/workbench-notes/members",
    "/communities/workbench-notes/settings",
    "/communities/workbench-notes/settings/general",
    "/communities/workbench-notes/settings/ownership",
    "/communities/workbench-notes/settings/themes",
    "/communities/workbench-notes/settings/members",
    "/communities/workbench-notes/settings/invites",
    "/communities/workbench-notes/settings/spaces",
    "/communities/workbench-notes/settings/rules",
    "/communities/workbench-notes/settings/links",
    "/communities/workbench-notes/settings/topics",
    "/communities/workbench-notes/settings/classroom",
    "/communities/workbench-notes/settings/matching",
    "/communities/workbench-notes/settings/acquire",
    "/communities/workbench-notes/settings/autonomy",
    "/communities/workbench-notes/settings/broadcast",
    "/communities/workbench-notes/settings/integrations",
    "/communities/workbench-notes/settings/magazine",
    "/communities/workbench-notes/settings/news",
    "/communities/workbench-notes/settings/payments",
    "/communities/workbench-notes/gallery",
    "/communities/workbench-notes/launchpad",
    "/communities/workbench-notes/ideas",
    "/communities/workbench-notes/match",
    "/communities/workbench-notes/offers",
    "/communities/workbench-notes/offers/offer-id",
    "/communities/workbench-notes/reels",
    "/communities/workbench-notes/rituals",
    "/communities/workbench-notes/referrals",
    "/communities/workbench-notes/insights",
    "/communities/workbench-notes/magazine",
    "/communities/workbench-notes/magazine/write",
    "/communities/workbench-notes/magazine/articles/article-slug/edit",
    "/communities/workbench-notes/magazine/review/article-slug",
    "/communities/workbench-notes/magazine/issues/issue-id/stats",
    "/communities/workbench-notes/magazine/agent-issues/draft-id",
    "/communities/workbench-notes/magazine/auto-draft",
    "/communities/workbench-notes/magazine/settings",
    "/communities/workbench-notes/magazine/team",
  ],
  magazine: [
    "/magazines/magazine-slug/issue-slug",
    "/magazines/magazine-slug/issue-slug/article-slug",
  ],
};

describe("resolveSiteShell", () => {
  for (const [shell, paths] of Object.entries(inventory)) {
    it.each(paths)(`assigns %s to ${shell}`, (path) => {
      const segments =
        path === "/unknown/path"
          ? ["unknown/path"]
          : path.split("/").filter(Boolean);
      expect(resolveSiteShell(path, segments)).toBe(shell);
    });
  }

  it.each([
    "/communities/workbench-notes/unknown",
    "/magazines/gazette/unknown/item/extra",
    "/og/unknown",
  ])("keeps the Hub shell for the matched catch-all at %s", (path) => {
    expect(resolveSiteShell(path, [path.slice(1)])).toBe("hub");
  });

  it("recognizes a workspace through Next.js route groups", () => {
    expect(
      resolveSiteShell("/communities/workbench-notes/classroom/course/edit", [
        "communities",
        "workbench-notes",
        "classroom",
        "(authoring)",
        "course",
        "edit",
      ]),
    ).toBe("focus");
  });

  it("switches chrome on navigation and keeps one content landmark", () => {
    go("/communities/workbench-notes/events");
    const { rerender } = render(
      <Frame>
        <ShellMain data-site-shell="community">Page</ShellMain>
      </Frame>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByText("Hub nav")).toBeNull();
    expect(screen.getByText("Session chrome")).toBeInTheDocument();

    go("/communities/workbench-notes/events/new");
    rerender(
      <Frame>
        <ShellMain data-site-shell="focus">Workspace</ShellMain>
      </Frame>,
    );
    expect(screen.queryByText("Session chrome")).toBeNull();
    expect(screen.queryByText("Footer")).toBeNull();
    expect(screen.getByRole("main")).toHaveAttribute(
      "data-site-shell",
      "focus",
    );

    go("/magazines/gazette/issue");
    rerender(
      <Frame>
        <PageMain>Magazine page</PageMain>
      </Frame>,
    );
    expect(screen.queryByText("Hub nav")).toBeNull();
    expect(screen.queryByText("Footer")).toBeNull();

    go("/communities");
    rerender(
      <Frame>
        <PageMain>Hub page</PageMain>
      </Frame>,
    );
    expect(screen.getByText("Hub nav")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    assertHubLandmarks();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByText("Hub page"),
    );
  });

  it("uses the Hub frame for the missing-community not-found boundary", () => {
    go("/communities/missing");
    expect(resolveSiteShell(state.path, state.segments)).toBe("community");
    expect(resolveSiteShell(state.path, state.segments, true)).toBe("hub");
    render(
      <Frame>
        <NotFound />
      </Frame>,
    );
    assertHubLandmarks();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: en.notFound.title }),
    );
  });

  it("uses the Hub frame when a community child throws into the locale error boundary", () => {
    const reset = vi.fn();
    class Boundary extends Component<
      { children: ReactNode },
      { error: Error | null }
    > {
      state: { error: Error | null } = { error: null };
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      render() {
        const error = this.state.error;
        return error ? (
          <LocaleError error={error} reset={reset} />
        ) : (
          this.props.children
        );
      }
    }
    function BrokenPage(): ReactNode {
      throw new Error("Community child failed");
    }
    go("/communities/workbench-notes/events");
    render(
      <Frame>
        <Boundary>
          <BrokenPage />
        </Boundary>
      </Frame>,
      { onCaughtError: () => undefined },
    );
    assertHubLandmarks();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: en.common.errorTitle }),
    );
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
