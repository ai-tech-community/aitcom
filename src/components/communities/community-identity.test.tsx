import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import type { RouterOutputs } from "@/trpc/react";

const m = vi.hoisted(() => ({ joinProps: [] as unknown[] }));

vi.mock("./join-button", () => ({
  JoinButton: (props: { slug: string }) => {
    m.joinProps.push(props);
    return <button type="button">Join</button>;
  },
}));
vi.mock("./member-stack", () => ({ MemberStack: () => null }));

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
  memberRole: "member" | null = null,
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
    expect(screen.queryByText(en.communities.profile.memberBadge)).toBeNull();
    unmount();
    renderIdentity("active", "member");
    expect(
      screen.getByText(en.communities.profile.memberBadge),
    ).toBeInTheDocument();
  });
});
