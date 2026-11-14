import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import type { RouterOutputs } from "@/trpc/react";

const m = vi.hoisted(() => ({
  joinProps: [] as unknown[],
  menuProps: [] as { onLeft?: () => void }[],
}));

vi.mock("./join-button", () => ({
  JoinButton: (props: { slug: string }) => {
    m.joinProps.push(props);
    return <button type="button">Join</button>;
  },
}));
vi.mock("./member-stack", () => ({ MemberStack: () => null }));
vi.mock("./community-actions-menu", () => ({
  CommunityActionsMenu: (props: { onLeft?: () => void }) => {
    m.menuProps.push(props);
    return <button type="button">Community options</button>;
  },
}));

import { CommunityIdentity } from "./community-identity";

const community = {
  slug: "mlops",
  name: "MLOps Amsterdam",
  description: "Practitioners shipping models to production.",
  logoUrl: null,
  memberCount: 42,
  joinPolicy: "open",
} as unknown as RouterOutputs["communities"]["getBySlug"];

function renderIdentity(
  membershipStatus: "active" | null = null,
  memberRole: "owner" | "admin" | "moderator" | "member" | null = null,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityIdentity
        community={community}
        membershipStatus={membershipStatus}
        memberRole={memberRole}
      />
    </NextIntlClientProvider>,
  );
}

describe("CommunityIdentity", () => {
  it("shows a banner when the community has one", () => {
    const { unmount } = renderIdentity();
    expect(document.querySelector("[data-community-banner]")).toBeNull();
    unmount();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommunityIdentity
          community={
            {
              ...community,
              bannerUrl: "https://cdn.example.test/banner.png",
            } as typeof community
          }
          membershipStatus={null}
        />
      </NextIntlClientProvider>,
    );
    const banner = document.querySelector("[data-community-banner]");
    expect(banner).toHaveAttribute(
      "src",
      "https://cdn.example.test/banner.png",
    );
    expect(banner).toHaveAttribute("alt", "");
  });

  it("uses the banner alt text when the community has one", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommunityIdentity
          community={
            {
              ...community,
              bannerUrl: "https://cdn.example.test/banner.png",
              bannerAlt: "The town square",
            } as typeof community
          }
          membershipStatus={null}
        />
      </NextIntlClientProvider>,
    );
    expect(document.querySelector("[data-community-banner]")).toHaveAttribute(
      "alt",
      "The town square",
    );
  });

  it("renders the page's one h1, tagline, and member count", () => {
    renderIdentity();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "MLOps Amsterdam" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Practitioners shipping models to production."),
    ).toBeInTheDocument();
    expect(screen.getByText(/42 members/)).toBeInTheDocument();
  });

  it("says member, not members, for one", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommunityIdentity
          community={{ ...community, memberCount: 1 } as typeof community}
          membershipStatus={null}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("1 member")).toBeInTheDocument();
  });

  it("adds how many were active this week, when anyone was", () => {
    const { unmount } = renderIdentity();
    expect(screen.queryByText(/active this week/)).toBeNull();
    unmount();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CommunityIdentity
          community={
            {
              ...community,
              liveness: { activeContributors: 3 },
            } as typeof community
          }
          membershipStatus={null}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText(/42 members · 3 active this week/),
    ).toBeInTheDocument();
  });

  it("renders one join control, wired to focus the heading after an answer", () => {
    m.joinProps = [];
    renderIdentity();
    expect(screen.getAllByRole("button", { name: "Join" })).toHaveLength(1);
    expect(m.joinProps).toHaveLength(1);
    const props = m.joinProps[0] as {
      slug: string;
      focusAfterAnswer: { current: HTMLElement | null };
    };
    expect(props.slug).toBe("mlops");
    expect(props.focusAfterAnswer.current).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
  });

  it("shows the Member badge to an active member only", () => {
    const { unmount } = renderIdentity();
    expect(screen.queryByText(en.communities.roles.member)).toBeNull();
    unmount();
    renderIdentity("active", "member");
    expect(screen.getByText(en.communities.roles.member)).toBeInTheDocument();
  });

  it("shows the same role the Members tab uses", () => {
    renderIdentity("active", "owner");
    expect(screen.getByText(en.communities.roles.owner)).toBeInTheDocument();
    expect(screen.queryByText(en.communities.roles.member)).toBeNull();
  });

  describe("compact", () => {
    function renderCompact() {
      m.joinProps = [];
      return render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CommunityIdentity
            community={
              {
                ...community,
                bannerUrl: "https://cdn.example.test/banner.png",
                liveness: { activeContributors: 3 },
              } as typeof community
            }
            membershipStatus="active"
            memberRole="owner"
            density="compact"
          />
        </NextIntlClientProvider>,
      );
    }

    it("keeps the page's one h1 and the role badge", () => {
      renderCompact();
      expect(
        screen.getByRole("heading", { level: 1, name: "MLOps Amsterdam" }),
      ).toBeInTheDocument();
      expect(screen.getByText(en.communities.roles.owner)).toBeInTheDocument();
    });

    it("leaves out the banner, tagline, members line and join control", () => {
      renderCompact();
      expect(document.querySelector("[data-community-banner]")).toBeNull();
      expect(document.querySelector("[data-community-tagline]")).toBeNull();
      expect(screen.queryByText(/42 members/)).toBeNull();
      expect(m.joinProps).toHaveLength(0);
    });

    it("offers the community menu in the row", () => {
      m.menuProps = [];
      renderCompact();
      expect(
        screen.getByRole("button", { name: "Community options" }),
      ).toBeInTheDocument();
      expect(m.menuProps).toHaveLength(1);
    });

    it("moves focus to the heading once leaving opens the full identity", () => {
      m.menuProps = [];
      const { rerender } = render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CommunityIdentity
            community={community}
            membershipStatus="active"
            memberRole="member"
            density="compact"
          />
        </NextIntlClientProvider>,
      );
      screen.getByRole("button", { name: "Community options" }).focus();
      act(() => m.menuProps.at(-1)?.onLeft?.());
      rerender(
        <NextIntlClientProvider locale="en" messages={en}>
          <CommunityIdentity
            community={community}
            membershipStatus={null}
            density="full"
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });

    it("leaves focus alone when the density changes for another reason", () => {
      const { rerender } = render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CommunityIdentity
            community={community}
            membershipStatus="active"
            memberRole="member"
            density="compact"
          />
        </NextIntlClientProvider>,
      );
      rerender(
        <NextIntlClientProvider locale="en" messages={en}>
          <CommunityIdentity
            community={community}
            membershipStatus={null}
            density="full"
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    });
  });
});
