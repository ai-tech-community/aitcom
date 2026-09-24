import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  reels: { items: [] as unknown[] },
  reelsQuery: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
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
vi.mock("./post-composer", () => ({ PostComposer: () => null }));
vi.mock("./community-sidebar", () => ({ CommunitySidebar: () => null }));
vi.mock("./topic-chips", () => ({ TopicChips: () => null }));
vi.mock("./community-activity-feed", () => ({
  CommunityActivityFeed: () => null,
  FeedSkeleton: () => null,
}));
vi.mock("@/components/communities/onboarding/welcome-checklist", () => ({
  WelcomeChecklist: () => null,
}));
vi.mock("@/components/communities/first-session-path", () => ({
  HubFirstSessionPath: () => null,
}));

import { FeedPage } from "./feed-page";

function renderPage(member: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedPage
        slug="mlops"
        memberRole={member ? "member" : null}
        currentUserId={member ? "user-1" : undefined}
        feedPostPolicy="all_members"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.reels = { items: [] };
  m.reelsQuery.mockClear();
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
