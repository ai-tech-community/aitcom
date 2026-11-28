import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CommunityOverviewPageClient } from "./_overview-client";

const state = vi.hoisted(() => ({
  redesigned: true,
  shell: null as "community" | null,
  createdAt: new Date(),
  memberCount: 1,
  themeId: "plain",
  joinPolicy: "open",
  posts: [] as unknown[],
  invites: [] as unknown[],
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => state.redesigned,
}));
vi.mock("@/components/site-chrome-gate", () => ({
  useSiteShell: () => state.shell,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { complete?: number }) =>
    values?.complete !== undefined ? `${key} ${values.complete}` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getBySlug: {
        useQuery: () => ({
          data: {
            slug: "sketch-club",
            createdAt: state.createdAt,
            isListedInDirectory: true,
            joinPolicy: state.joinPolicy,
            memberCount: state.memberCount,
            themeId: state.themeId,
            liveness: { activeContributors: 0, recentThreads: 0 },
          },
        }),
      },
      getMyCommunities: { useQuery: () => ({ data: undefined }) },
      getInviteLinks: { useQuery: () => ({ data: state.invites }) },
    },
    feed: { getFeed: { useQuery: () => ({ data: { posts: state.posts } }) } },
  },
}));
vi.mock("@/components/communities/feed/feed-page", () => ({
  FeedPage: ({
    composerTextareaId,
    feedFirst,
    renderFirstWeek,
  }: {
    composerTextareaId?: string;
    feedFirst?: boolean;
    renderFirstWeek?: (composer: ReactNode) => ReactNode;
  }) => {
    const composer = (
      <textarea
        id={composerTextareaId}
        aria-label="Post body"
        data-first-week={!!renderFirstWeek}
        data-feed-first={feedFirst}
      />
    );
    return renderFirstWeek ? renderFirstWeek(composer) : composer;
  },
}));

async function overview(role: "owner" | "member") {
  const params = Promise.resolve({ slug: "sketch-club" });
  await act(async () => {
    render(
      <CommunityOverviewPageClient
        params={params}
        initialUser={null}
        initialMemberships={[{ slug: "sketch-club", role, status: "active" }]}
      />,
    );
  });
}

afterEach(() => {
  Object.assign(state, {
    redesigned: true,
    shell: null,
    createdAt: new Date(),
    themeId: "plain",
    memberCount: 1,
    joinPolicy: "open",
    posts: [],
    invites: [],
  });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("community creation handoff", () => {
  it("focuses the existing composer, shows access, and copies the general invite link", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://community.example/catalog");
    vi.spyOn(window, "navigator", "get").mockReturnValue({
      clipboard: { writeText: state.writeText },
    } as unknown as Navigator);
    await overview("owner");
    const postRow = screen.getByRole("button", { name: "writePost" });
    expect(screen.getAllByRole("button", { name: "writePost" })).toHaveLength(
      1,
    );
    expect(postRow).toHaveTextContent("writePost");
    expect(postRow).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("textbox", { name: "Post body" }),
    ).not.toBeInTheDocument();
    fireEvent.click(postRow);
    const composer = screen.getByRole("textbox", { name: "Post body" });
    expect(postRow).toHaveAttribute("aria-expanded", "true");
    expect(composer.closest("li")).toBe(postRow.closest("li"));
    expect(composer).toHaveFocus();
    expect(composer).toHaveAttribute("data-first-week", "true");
    fireEvent.change(composer, { target: { value: "A welcome in progress" } });
    fireEvent.click(postRow);
    expect(
      screen.queryByRole("textbox", { name: "Post body" }),
    ).not.toBeInTheDocument();
    fireEvent.click(postRow);
    expect(screen.getByRole("textbox", { name: "Post body" })).toHaveValue(
      "A welcome in progress",
    );
    expect(screen.getByText("publicAccess")).toBeInTheDocument();
    const publicUrl = "https://community.example/communities/sketch-club";
    expect(screen.getAllByText(publicUrl)).toHaveLength(1);
    const view = screen.getByRole("link", { name: "viewVisitor" });
    expect(view).toHaveAttribute("href", publicUrl);
    expect(view).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button", { name: "copyAddress" }));
    await waitFor(() =>
      expect(state.writeText).toHaveBeenCalledWith(publicUrl),
    );
    expect(
      screen.getByRole("link", { name: "editVisibility" }),
    ).toHaveAttribute("href", "/communities/sketch-club/settings/general");
    expect(screen.getByRole("link", { name: "chooseLook" })).toHaveAttribute(
      "href",
      "/communities/sketch-club/settings/themes",
    );
    expect(screen.getByRole("status")).toHaveTextContent("progress 0");
    expect(
      screen.queryByRole("link", { name: "referrals" }),
    ).not.toBeInTheDocument();
    const copyInvite = screen.getByRole("button", { name: "copyInvite" });
    const inviteUrl = "https://community.example/invite/sketch-club";
    expect(screen.getByText(inviteUrl).closest("li")).toBe(
      copyInvite.closest("li"),
    );
    expect(copyInvite.closest("li")).toHaveTextContent("inviteLink");
    const sharing = screen.getByRole("group", { name: "shareStep" });
    expect(sharing).toHaveAccessibleDescription("sharingPublic");
    expect(sharing).toContainElement(
      screen.getByRole("button", { name: "copyAddress" }),
    );
    expect(sharing).toContainElement(copyInvite);
    expect(copyInvite).toHaveAttribute("data-variant", "ghost");
    expect(screen.getByRole("button", { name: "copyAddress" })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(screen.getByRole("link", { name: "createEvent" })).toHaveAttribute(
      "href",
      "/communities/sketch-club/events/new",
    );
    expect(postRow.querySelector("svg.lucide-chevron-down")).toBeNull();
    fireEvent.click(copyInvite);
    await waitFor(() =>
      expect(state.writeText).toHaveBeenCalledWith(inviteUrl),
    );
  });

  it("reads progress from the feed, active members and saved look", async () => {
    Object.assign(state, {
      memberCount: 2,
      themeId: "night",
      posts: [{ id: 1 }],
    });
    await overview("owner");
    expect(screen.getByRole("status")).toHaveTextContent("progress 3");
    expect(
      screen
        .getByRole("region", { name: "title" })
        .querySelector('[data-community-cover-look="night"]'),
    ).toBeInTheDocument();
    const postAgain = screen.getByRole("button", { name: "writePost" });
    expect(postAgain).toHaveAccessibleDescription(
      "stepComplete postTitle nextPostHelp",
    );
    fireEvent.click(postAgain);
    expect(screen.getByRole("textbox", { name: "Post body" })).toHaveFocus();
  });

  it("keeps the shell's feed order and leaves the cover and referrals to the shell", async () => {
    state.shell = "community";
    state.themeId = "night";
    await overview("owner");

    const welcome = screen.getByRole("region", { name: "title" });
    expect(
      welcome.querySelector('[data-community-cover-look="night"]'),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "referrals" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "writePost" }));
    const composer = screen.getByRole("textbox", { name: "Post body" });
    expect(composer).toHaveFocus();
    expect(composer).toHaveAttribute("data-feed-first", "true");
  });

  it("uses existing invite settings when an invite-only community has no shareable link", async () => {
    state.joinPolicy = "invite_only";
    state.invites = [
      { code: "targeted", targetEmail: "friend@example.com" },
      { code: "used-up", maxUses: 1, useCount: 1 },
      { code: "admin-invite", role: "admin" },
      { code: "expired", expiresAt: new Date(0) },
    ];
    await overview("owner");
    const sharing = screen.getByRole("group", { name: "shareStep" });
    expect(sharing).toHaveAccessibleDescription("sharingInviteFirst");
    expect(sharing.querySelector("dt")).toHaveTextContent("inviteLink");
    expect(screen.getByRole("button", { name: "copyAddress" })).toHaveAttribute(
      "data-variant",
      "ghost",
    );
    expect(screen.getByRole("link", { name: "createInvite" })).toHaveAttribute(
      "href",
      "/communities/sketch-club/settings/invites",
    );
    expect(
      screen.queryByRole("button", { name: "copyInvite" }),
    ).not.toBeInTheDocument();
  });

  it("offers the existing general-purpose invite code for an invite-only community", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3102");
    state.joinPolicy = "invite_only";
    state.invites = [
      { code: "shareable", role: "member", useCount: 0, maxUses: null },
    ];
    await overview("owner");
    expect(
      screen.getByText("https://www.aitcommunity.org/invite/shareable"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "copyInvite" }),
    ).toBeInTheDocument();
  });

  it.each([
    { redesigned: false, ageDays: 0, role: "owner" },
    { redesigned: true, ageDays: 7, role: "owner" },
    { redesigned: true, ageDays: 0, role: "member" },
  ] as const)(
    "keeps the standard overview for %o",
    async ({ redesigned, ageDays, role }) => {
      state.redesigned = redesigned;
      state.createdAt = new Date(Date.now() - ageDays * 86_400_000);
      await overview(role);
      expect(
        screen.getByRole("textbox", { name: "Post body" }),
      ).toHaveAttribute("data-first-week", "false");
      expect(
        screen.queryByRole("heading", { name: "title" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "referrals" }),
      ).toBeInTheDocument();
    },
  );
});
