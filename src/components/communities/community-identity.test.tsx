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
  bannerUrl: "https://cdn.example.test/banner.png",
  memberCount: 42,
  liveness: { activeContributors: 3 },
  joinPolicy: "open",
  themeId: "plain",
} as unknown as RouterOutputs["communities"]["getBySlug"];

type Status = "active" | "invited" | null;
type Role = "owner" | "admin" | "moderator" | "member" | null;

function view(membershipStatus: Status = null, memberRole: Role = null) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityIdentity
        community={community}
        membershipStatus={membershipStatus}
        memberRole={memberRole}
      />
    </NextIntlClientProvider>
  );
}

function renderIdentity(
  membershipStatus: Status = null,
  memberRole: Role = null,
) {
  m.joinProps = [];
  m.menuProps = [];
  return render(view(membershipStatus, memberRole));
}

describe("CommunityIdentity", () => {
  it("renders the page's one h1", () => {
    renderIdentity();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "MLOps Amsterdam" }),
    ).toBeInTheDocument();
  });

  it("sets the name in the community look's heading face", () => {
    renderIdentity();
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "font-community-heading",
    );
  });

  it("stays one short row: the banner, description and members live on the Overview", () => {
    renderIdentity();
    expect(document.querySelector("[data-community-banner]")).toBeNull();
    expect(
      screen.queryByText("Practitioners shipping models to production."),
    ).toBeNull();
    expect(screen.queryByText(/42 members/)).toBeNull();
  });

  describe("someone who has not joined", () => {
    it("gets one join control, wired to focus the heading once it is replaced", () => {
      renderIdentity();
      expect(screen.getAllByRole("button", { name: "Join" })).toHaveLength(1);
      expect(m.joinProps).toHaveLength(1);
      const props = m.joinProps[0] as {
        slug: string;
        focusAfterChange: { current: HTMLElement | null };
      };
      expect(props.slug).toBe("mlops");
      expect(props.focusAfterChange.current).toBe(
        screen.getByRole("heading", { level: 1 }),
      );
    });

    it("gets the join control while invited too, to answer there", () => {
      renderIdentity("invited", "member");
      expect(m.joinProps).toHaveLength(1);
      expect(m.menuProps).toHaveLength(0);
    });

    it("has no community menu and no role badge", () => {
      renderIdentity();
      expect(m.menuProps).toHaveLength(0);
      expect(screen.queryByText(en.communities.roles.member)).toBeNull();
    });
  });

  describe("a member", () => {
    it("gets the community menu instead of the join control", () => {
      renderIdentity("active", "member");
      expect(
        screen.getByRole("button", { name: "Community options" }),
      ).toBeInTheDocument();
      expect(m.joinProps).toHaveLength(0);
    });

    it("shows the same role the Members tab uses", () => {
      renderIdentity("active", "owner");
      expect(screen.getByText(en.communities.roles.owner)).toBeInTheDocument();
      expect(screen.queryByText(en.communities.roles.member)).toBeNull();
    });

    it("moves focus to the heading once leaving has dropped the membership", () => {
      const { rerender } = renderIdentity("active", "member");
      const trigger = screen.getByRole("button", { name: "Community options" });
      trigger.focus();
      act(() => m.menuProps.at(-1)?.onLeft?.());
      // The leave went through, but the membership has not reloaded yet.
      expect(trigger).toHaveFocus();
      rerender(view(null, null));
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });

    it("leaves focus alone when the membership drops for another reason", () => {
      const { rerender } = renderIdentity("active", "member");
      rerender(view(null, null));
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    });
  });
});
