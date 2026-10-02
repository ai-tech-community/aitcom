import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

type Membership = {
  communityId: string;
  role: "owner" | "admin" | "moderator" | "member";
  status: "active" | "pending_approval" | "invited" | "banned";
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

type Query<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

const state = vi.hoisted(() => ({
  communities: undefined as unknown as Query<Membership[]>,
  requests: undefined as unknown as Query<
    { communityId: string; slug: string; name: string; count: number }[]
  >,
  requestsArgs: [] as unknown[],
  accept: vi.fn((_: { slug: string }) => Promise.resolve({ success: true })),
  decline: vi.fn((_: { slug: string }) => Promise.resolve({ success: true })),
  confirm: vi.fn((_: unknown) => Promise.resolve(true)),
  invalidated: [] as string[],
}));

vi.mock("@/trpc/react", () => {
  const invalidate = (name: string) => () => {
    state.invalidated.push(name);
    return Promise.resolve();
  };
  return {
    api: {
      useUtils: () => ({
        communities: {
          getMyCommunities: { invalidate: invalidate("getMyCommunities") },
          getBySlug: { invalidate: invalidate("getBySlug") },
          getMembers: { invalidate: invalidate("getMembers") },
        },
        home: { nextUp: { invalidate: invalidate("home.nextUp") } },
        feed: {
          getHomeActivity: { invalidate: invalidate("feed.getHomeActivity") },
        },
      }),
      communities: {
        getMyCommunities: { useQuery: () => state.communities },
        getMyPendingJoinRequests: {
          useQuery: (...args: unknown[]) => {
            state.requestsArgs = args;
            return state.requests;
          },
        },
        join: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        requestToJoin: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        leave: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        acceptInvite: { useMutation: () => ({ mutateAsync: state.accept }) },
        declineInvite: {
          useMutation: () => ({ mutateAsync: state.decline }),
        },
      },
    },
  };
});

vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => state.confirm,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { MyCommunities } from "./my-communities";

function loaded<T>(data: T): Query<T> {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

function membership(
  slug: string,
  role: Membership["role"],
  status: Membership["status"] = "active",
): Membership {
  return {
    communityId: `id-${slug}`,
    role,
    status,
    name: slug[0]!.toUpperCase() + slug.slice(1),
    slug,
    description: `About ${slug}`,
    logoUrl: null,
  };
}

function tab(locale: "en" | "nl" = "en") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <MyCommunities />
    </NextIntlClientProvider>
  );
}

function renderTab(locale: "en" | "nl" = "en") {
  return render(tab(locale));
}

function rowFor(name: string): HTMLElement {
  return screen
    .getByText(name, { selector: "span" })
    .closest<HTMLElement>("li")!;
}

describe("MyCommunities", () => {
  beforeEach(() => {
    state.requests = loaded([]);
    state.requestsArgs = [];
    state.invalidated = [];
    state.confirm.mockReset();
    state.confirm.mockImplementation(() => Promise.resolve(true));
    state.accept.mockClear();
    state.decline.mockClear();
  });

  it("shows a skeleton while loading", () => {
    state.communities = {
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    };
    const { container } = renderTab();

    expect(
      screen.getByRole("heading", { level: 2, name: /your communities/i }),
    ).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("shows an error with retry, never 'not a member', when the load fails", () => {
    const refetch = vi.fn();
    state.communities = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    };
    renderTab();

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(en.communities.dashboard.emptyTitle)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("teaches the next step when the member has joined nothing", () => {
    state.communities = loaded([]);
    renderTab();

    expect(screen.getByText(en.communities.dashboard.emptyTitle)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Explore communities" }),
    ).toHaveAttribute("href", "/communities");
  });

  it("lists active communities without nesting links, and waiting ones below", () => {
    state.communities = loaded([
      membership("makers", "owner"),
      membership("readers", "member"),
      membership("pending", "member", "pending_approval"),
      membership("invite", "member", "invited"),
      membership("banned", "member", "banned"),
    ]);
    const { container } = renderTab();

    expect(container.querySelector("a a")).toBeNull();
    expect(
      screen.getByRole("link", { name: /Makers/ }).getAttribute("href"),
    ).toBe("/communities/makers");
    expect(within(rowFor("Makers")).getByText("Owner")).toBeTruthy();

    const waiting = screen
      .getByRole("heading", { level: 2, name: /waiting for a reply/i })
      .closest("section")!;
    expect(within(waiting).getByText("Request sent")).toBeTruthy();
    expect(within(waiting).getByText("You're invited")).toBeTruthy();
    expect(screen.queryByText("Banned")).toBeNull();
  });

  it("shows a member who is only waiting their requests, not 'haven't joined'", () => {
    state.communities = loaded([
      membership("pending", "member", "pending_approval"),
      membership("invite", "member", "invited"),
    ]);
    renderTab();

    expect(screen.queryByText(en.communities.dashboard.emptyTitle)).toBeNull();
    expect(screen.getByText(en.communities.dashboard.onlyWaiting)).toBeTruthy();
    expect(screen.getByText("Request sent")).toBeTruthy();
    expect(screen.getByText("You're invited")).toBeTruthy();
  });

  it("accepts an invitation from its row, and refreshes Home and the list", async () => {
    state.communities = loaded([
      membership("pending", "member", "pending_approval"),
      membership("invite", "member", "invited"),
    ]);
    renderTab();

    // A request waits on the organizers: nothing to answer on its row.
    expect(
      within(rowFor("Pending")).queryByRole("button", { name: "Accept" }),
    ).toBeNull();

    fireEvent.click(
      within(rowFor("Invite")).getByRole("button", { name: "Accept" }),
    );
    await waitFor(() =>
      expect(state.accept).toHaveBeenCalledWith({ slug: "invite" }),
    );
    expect(state.confirm).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(state.invalidated).toEqual(
        expect.arrayContaining([
          "getMyCommunities",
          "home.nextUp",
          "feed.getHomeActivity",
        ]),
      ),
    );
  });

  it("asks before declining an invitation, and declines only on yes", async () => {
    state.communities = loaded([membership("invite", "member", "invited")]);
    renderTab();
    const decline = within(rowFor("Invite")).getByRole("button", {
      name: "Decline",
    });

    state.confirm.mockImplementationOnce(() => Promise.resolve(false));
    fireEvent.click(decline);
    await waitFor(() => expect(state.confirm).toHaveBeenCalledTimes(1));
    expect(state.confirm.mock.calls[0]![0]).toMatchObject({
      title: "Decline the invitation to Invite?",
      destructive: true,
    });
    expect(state.decline).not.toHaveBeenCalled();

    fireEvent.click(decline);
    await waitFor(() =>
      expect(state.decline).toHaveBeenCalledWith({ slug: "invite" }),
    );
    expect(state.confirm).toHaveBeenCalledTimes(2);
  });

  it("after accepting, focus follows the community into Your communities", async () => {
    state.communities = loaded([
      membership("readers", "member"),
      membership("invite", "member", "invited"),
    ]);
    const { rerender } = renderTab();
    fireEvent.click(
      within(rowFor("Invite")).getByRole("button", { name: "Accept" }),
    );
    await waitFor(() => expect(state.accept).toHaveBeenCalled());

    // The list reloads with the invitation accepted.
    state.communities = loaded([
      membership("readers", "member"),
      membership("invite", "member", "active"),
    ]);
    rerender(tab());
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /^Invite/ })).toHaveFocus(),
    );
  });

  it("after declining, focus moves to the next row still waiting", async () => {
    state.communities = loaded([
      membership("invite", "member", "invited"),
      membership("pending", "member", "pending_approval"),
    ]);
    const { rerender } = renderTab();
    fireEvent.click(
      within(rowFor("Invite")).getByRole("button", { name: "Decline" }),
    );
    await waitFor(() => expect(state.decline).toHaveBeenCalled());

    state.communities = loaded([
      membership("pending", "member", "pending_approval"),
    ]);
    rerender(tab());
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /^Pending/ })).toHaveFocus(),
    );
  });

  it("shows join requests only on rows the member owns or administers", () => {
    state.communities = loaded([
      membership("makers", "owner"),
      membership("builders", "admin"),
      membership("quiet", "admin"),
      membership("readers", "member"),
      membership("mods", "moderator"),
    ]);
    // A count for a community the member only belongs to must not show.
    state.requests = loaded([
      { communityId: "id-makers", slug: "makers", name: "Makers", count: 3 },
      { communityId: "id-builders", slug: "builders", name: "B", count: 1 },
      { communityId: "id-readers", slug: "readers", name: "R", count: 9 },
    ]);
    renderTab();

    expect(state.requestsArgs).toEqual([undefined, { enabled: true }]);
    expect(
      within(rowFor("Makers"))
        .getByRole("link", { name: "3 join requests" })
        .getAttribute("href"),
    ).toBe("/communities/makers/settings/members");
    expect(
      within(rowFor("Builders")).getByRole("link", { name: "1 join request" }),
    ).toBeTruthy();
    expect(
      within(rowFor("Quiet")).queryByRole("link", { name: /join request/ }),
    ).toBeNull();
    expect(within(rowFor("Readers")).queryByText(/join request/)).toBeNull();
    expect(within(rowFor("Mods")).queryByText(/join request/)).toBeNull();

    // Manage only where the member runs the community.
    expect(
      within(rowFor("Quiet")).getByRole("link", { name: "Manage" }),
    ).toHaveAttribute("href", "/communities/quiet/settings");
    expect(
      within(rowFor("Readers")).queryByRole("link", { name: "Manage" }),
    ).toBeNull();
  });

  it("does not ask for join requests when the member runs no community", () => {
    state.communities = loaded([membership("readers", "member")]);
    renderTab();

    expect(state.requestsArgs).toEqual([undefined, { enabled: false }]);
  });

  it("renders in Dutch with plural join requests", () => {
    state.communities = loaded([membership("makers", "owner")]);
    state.requests = loaded([
      { communityId: "id-makers", slug: "makers", name: "Makers", count: 2 },
    ]);
    renderTab("nl");

    expect(
      screen.getByRole("heading", { level: 2, name: /jouw communities/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "2 aanvragen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Beheren" })).toBeTruthy();
  });
});
