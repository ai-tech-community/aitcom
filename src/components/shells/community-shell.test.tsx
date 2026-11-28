import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { CommunityShell } from "./community-shell";
import { usableMemberships } from "./community-switcher";

const m = vi.hoisted(() => ({
  pathname: "/communities/workbench-notes/spaces/workshop",
  spaces: [
    {
      id: "events",
      kind: "builtin",
      builtinSurface: "events",
      name: null,
      slug: "events",
    },
    {
      id: "forum",
      kind: "builtin",
      builtinSurface: "forum",
      name: null,
      slug: "forum",
    },
  ],
  rooms: [
    {
      id: "workshop",
      slug: "workshop",
      name: "Workshop",
      visibility: "public",
      membership: "active",
    },
    {
      id: "locked",
      slug: "locked",
      name: "Private workshop",
      visibility: "private",
      membership: null,
    },
  ],
  listSpaces: vi.fn(),
  listRooms: vi.fn(),
  summaries: vi.fn(),
  refreshSummaries: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    onNavigate: _,
    ...props
  }: React.ComponentProps<"a"> & { onNavigate?: () => void }) => (
    <a href={href} {...props} />
  ),
  usePathname: () => m.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/communities/join-button", () => ({
  JoinButton: () => <button type="button">Join</button>,
}));
vi.mock("@/components/onboarding/onboarding-reminder", () => ({
  OnboardingReminderProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  OnboardingReminderRow: () => <button type="button">Getting started</button>,
}));
vi.mock("@/components/communities/theme/community-theme-cover", () => ({
  CommunityThemeCover: () => <div>Cover</div>,
}));
vi.mock("@/components/communities/theme/community-theme-scope", () => ({
  CommunityThemeScope: ({
    themeId,
    children,
  }: {
    themeId: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="theme" data-look={themeId}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/shells/shell-header", () => ({
  ShellHeader: ({
    location,
    section,
    destinations,
  }: {
    location: string;
    section: string;
    destinations: { href: string }[];
  }) => (
    <header>
      {location} / {section}
      <span data-testid="search-destinations">
        {destinations.map(({ href }) => href).join(" ")}
      </span>
    </header>
  ),
}));
vi.mock("@/components/inbox/messages-nav-link", () => ({
  MessagesNavLink: () => <a href="/messages">Messages</a>,
}));
vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      list: { useQuery: m.listSpaces },
      listRooms: { useQuery: m.listRooms },
    },
    inbox: {
      listConversations: { useInfiniteQuery: m.summaries },
    },
  },
}));

beforeEach(() => {
  m.pathname = "/communities/workbench-notes/spaces/workshop";
  m.listSpaces.mockReset().mockReturnValue({ data: m.spaces });
  m.listRooms.mockReset().mockReturnValue({ data: m.rooms });
  m.refreshSummaries.mockReset().mockResolvedValue(undefined);
  m.summaries.mockReset().mockReturnValue({
    refetch: m.refreshSummaries,
    data: {
      pages: [
        {
          conversations: [
            {
              isRoom: true,
              communitySlug: "workbench-notes",
              spaceId: "workshop",
              unreadCount: 3,
            },
            {
              isRoom: true,
              communitySlug: "somewhere-else",
              spaceId: "workshop",
              unreadCount: 42,
            },
            {
              isRoom: true,
              communitySlug: "workbench-notes",
              spaceId: "locked",
              unreadCount: 7,
            },
          ],
        },
      ],
    },
  });
});

function renderShell(canRead: boolean, role: "owner" | "member" | null) {
  const community = {
    slug: "workbench-notes",
    name: "Workbench Notes",
    viewerCanReadContent: canRead,
    themeId: "night",
  } as React.ComponentProps<typeof CommunityShell>["community"];
  const tree = () => (
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityShell
        community={community}
        membershipStatus={role ? "active" : null}
        memberRole={role}
        user={role ? { id: "viewer" } : null}
        memberships={[]}
        showCover
      >
        <p>Child page</p>
      </CommunityShell>
    </NextIntlClientProvider>
  );
  const view = render(tree());
  return { ...view, update: () => view.rerender(tree()) };
}

describe("CommunityShell", () => {
  it("renders one ordered Spaces group, clears unread on the active room and shows owner links", () => {
    renderShell(true, "owner");
    const navigation = screen.getByRole("navigation", {
      name: "Community navigation",
    });
    const [home, events, forum] = within(navigation).getAllByRole("link");
    expect(home).toHaveTextContent("Home");
    expect(events).toHaveTextContent("Events");
    expect(forum).toHaveTextContent("Forum");
    expect(
      within(navigation).getByRole("link", { name: "Workshop" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getByRole("button", { name: "Getting started" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByRole("link", { name: "Invite friends" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Invite friends" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("search-destinations")).not.toHaveTextContent(
      "/referrals",
    );
    expect(
      within(navigation).getByRole("link", {
        name: "Private workshop, Private room, access required",
      }),
    ).not.toHaveTextContent("7");
    expect(
      within(navigation).getByRole("link", { name: "Settings" }),
    ).toBeInTheDocument();
    const theme = screen.getByTestId("theme");
    expect(theme).toHaveAttribute("data-look", "night");
    expect(theme).toContainElement(navigation);
    expect(theme).toContainElement(screen.getByRole("banner"));
    expect(theme).toContainElement(screen.getByText("Child page"));
  });

  it("adds readable room counts to the mobile tab and refreshes after leaving a chat", () => {
    m.pathname = "/communities/workbench-notes";
    const { update } = renderShell(true, "member");
    expect(
      screen.getByRole("button", { name: "Spaces, 3 unread" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Workshop, 3 unread" }),
    ).toBeInTheDocument();
    m.pathname = "/communities/workbench-notes/spaces/workshop";
    update();
    expect(screen.queryByRole("button", { name: /unread/ })).toBeNull();
    expect(m.refreshSummaries).not.toHaveBeenCalled();
    m.pathname = "/communities/workbench-notes/forum";
    update();
    expect(m.refreshSummaries).toHaveBeenCalledOnce();
  });

  it("omits stale restricted rows from the rail, finder and unread queries for outsiders", () => {
    renderShell(false, null);
    expect(screen.getByTestId("search-destinations")).not.toHaveTextContent(
      /\/workbench-notes\//,
    );
    expect(screen.queryByRole("link", { name: "Forum" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(m.listSpaces).toHaveBeenCalledWith(
      { slug: "workbench-notes" },
      { enabled: false },
    );
    expect(m.listRooms).toHaveBeenCalledWith(
      { slug: "workbench-notes" },
      { enabled: false },
    );
    expect(m.summaries).toHaveBeenCalledWith(
      { limit: 50 },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("keeps the Forum active for a discussion deep link and hides Manage for members", () => {
    m.pathname = "/communities/workbench-notes/forum/a-thread";
    renderShell(true, "member");
    expect(screen.getByRole("link", { name: "Forum" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });
});

describe("community switcher", () => {
  it("only accepts active and usable memberships", () => {
    const rows = (
      ["active", "pending_approval", "invited", "banned"] as const
    ).map((status) => ({
      slug: status,
      role: "member" as const,
      status,
    }));
    expect(usableMemberships(rows)).toEqual([rows[0]]);
  });
});
