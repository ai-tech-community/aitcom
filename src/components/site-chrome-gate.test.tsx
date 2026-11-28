import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  path: "/magazines/gazette/issue-1",
  segments: [] as string[],
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => state.path }));
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => state.segments,
}));
import {
  resolveSiteShell,
  SiteChromeGate,
  SiteContent,
  SiteShellProvider,
  type SiteShell,
} from "./site-chrome-gate";

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

  it("switches chrome on navigation without replacing the content landmark", () => {
    function Frame() {
      return (
        <SiteShellProvider>
          <SiteChromeGate>
            <span>Legacy nav</span>
          </SiteChromeGate>
          <SiteChromeGate slot="hub">
            <span>Hub nav</span>
          </SiteChromeGate>
          <SiteContent>Page</SiteContent>
          <SiteChromeGate slot="footer">
            <span>Footer</span>
          </SiteChromeGate>
          <SiteChromeGate slot="session">
            <span>Session chrome</span>
          </SiteChromeGate>
        </SiteShellProvider>
      );
    }
    function go(path: string) {
      state.path = path;
      state.segments = path.split("/").filter(Boolean);
    }

    go("/communities/workbench-notes/events");
    const { rerender } = render(<Frame />);
    const main = screen.getByRole("main");
    expect(screen.queryByText("Hub nav")).toBeNull();
    expect(screen.getByText("Session chrome")).toBeInTheDocument();

    go("/communities/workbench-notes/events/new");
    rerender(<Frame />);
    expect(screen.queryByText("Session chrome")).toBeNull();
    expect(screen.queryByText("Footer")).toBeNull();
    expect(screen.getByRole("main")).toBe(main);

    go("/magazines/gazette/issue");
    rerender(<Frame />);
    expect(screen.queryByText("Hub nav")).toBeNull();
    expect(screen.queryByText("Footer")).toBeNull();

    go("/communities");
    rerender(<Frame />);
    expect(screen.getByText("Hub nav")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "shell-content");
    expect(screen.queryByText("Legacy nav")).toBeNull();
  });
});
