import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { CommunityShell } from "./community-shell";
import { PageMain } from "@/components/page-main";
import { Link } from "@/i18n/navigation";
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
  unreadRooms: new Map<string, number>(),
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
    locationControl,
    section,
    destinations,
  }: {
    location: string;
    locationControl?: React.ReactNode;
    section: string;
    destinations: { href: string }[];
  }) => (
    <header>
      {locationControl ?? location} / {section}
      <span data-testid="search-destinations">
        {destinations.map(({ href }) => href).join(" ")}
      </span>
    </header>
  ),
}));
vi.mock("@/components/inbox/messages-nav-link", () => ({
  MessagesNavLink: () => <Link href="/messages">Messages</Link>,
}));
vi.mock("./shell-unread", () => ({
  useShellUnread: () => ({
    rooms: m.unreadRooms,
    communities: new Set(["neighbor"]),
  }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      list: { useQuery: m.listSpaces },
      listRooms: { useQuery: m.listRooms },
    },
  },
}));

beforeEach(() => {
  m.pathname = "/communities/workbench-notes/spaces/workshop";
  m.listSpaces.mockReset().mockReturnValue({ data: m.spaces });
  m.listRooms.mockReset().mockReturnValue({ data: m.rooms });
  m.unreadRooms = new Map([
    ["workshop", 3],
    ["locked", 7],
  ]);
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
        memberships={
          role
            ? [
                {
                  slug: "workbench-notes",
                  name: "Workbench Notes",
                  status: "active",
                  role,
                },
                {
                  slug: "neighbor",
                  name: "Neighbor Community",
                  status: "active",
                  role: "member",
                },
                {
                  slug: "locked-site",
                  name: "Restricted Community",
                  status: "invited",
                  role: "member",
                },
              ]
            : []
        }
        showCover
      >
        <PageMain>Child page</PageMain>
      </CommunityShell>
    </NextIntlClientProvider>
  );
  const view = render(tree());
  return { ...view, update: () => view.rerender(tree()) };
}

describe("CommunityShell", () => {
  it("puts the header, rail and bottom navigation alongside the page landmark", () => {
    renderShell(true, "member");
    const [main] = screen.getAllByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(main).toContainElement(screen.getByText("Child page"));
    for (const chrome of [
      screen.getByRole("banner"),
      screen.getByRole("complementary"),
      screen.getByRole("navigation", { name: "Community shortcuts" }),
    ]) {
      expect(chrome.parentElement).toBe(main!.parentElement);
      expect(main).not.toContainElement(chrome);
    }
  });
  it("groups community pages and rooms, shows active-room unread and keeps owner links", () => {
    renderShell(true, "owner");
    const navigation = screen.getByRole("navigation", {
      name: "Community navigation",
    });
    const forum = within(navigation).getByRole("link", { name: "Forum" });
    expect(within(navigation).getAllByRole("link").slice(0, 3)).toEqual([
      within(navigation).getByRole("link", { name: "Home" }),
      within(navigation).getByRole("link", { name: "Events" }),
      forum,
    ]);
    expect(
      within(navigation).getByRole("group", { name: "Community" }),
    ).toContainElement(forum);
    expect(
      within(navigation).getByRole("group", { name: "Spaces" }),
    ).not.toContainElement(forum);
    expect(screen.getByRole("banner")).toHaveTextContent("Workbench Notes");
    expect(screen.getByRole("banner")).toHaveTextContent("Workshop");
    const rail = navigation.closest("[data-community-rail]")!;
    expect(
      within(rail as HTMLElement).getByRole("link", {
        name: "Workbench Notes",
      }),
    ).toHaveAttribute("aria-current", "location");
    expect(
      within(rail as HTMLElement).getByRole("button", {
        name: "See all communities",
      }),
    ).toBeVisible();
    const shortcut = screen.getByRole("link", {
      name: "Neighbor Community, unread messages",
    });
    expect(shortcut).toHaveAttribute("href", "/communities/neighbor");
    expect(navigation.parentElement).not.toContainElement(shortcut);
    expect(
      screen.queryByRole("link", { name: /Restricted Community/ }),
    ).toBeNull();
    expect(
      within(navigation).getByRole("link", {
        name: "Workshop, 3 unread posts",
      }),
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

  it("reflects the shared room snapshot and keeps the badge clear once marked read", () => {
    m.pathname = "/communities/workbench-notes";
    const { update } = renderShell(true, "member");
    expect(
      screen.getByRole("button", { name: "Spaces, 3 unread posts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Workshop, 3 unread posts" }),
    ).toBeInTheDocument();
    m.pathname = "/communities/workbench-notes/spaces/workshop";
    update();
    expect(
      screen.getByRole("link", { name: "Workshop, 3 unread posts" }),
    ).toHaveAttribute("aria-current", "page");
    m.unreadRooms = new Map();
    update();
    expect(screen.queryByRole("button", { name: /unread/ })).toBeNull();
    m.pathname = "/communities/workbench-notes/forum";
    update();
    expect(screen.getByRole("link", { name: "Workshop" })).toBeInTheDocument();
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
