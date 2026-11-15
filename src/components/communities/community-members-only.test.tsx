import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import type {
  JoinPolicy,
  MembershipStatus,
} from "@/server/communities/invite-policy";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CommunityMembersOnly } from "./community-members-only";

function renderPanel(
  joinPolicy: JoinPolicy,
  membershipStatus: MembershipStatus | null = null,
  description: string | null = "Networking and more.",
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityMembersOnly
        community={{
          slug: "connect-inspire",
          name: "Connect & Inspire",
          description,
          joinPolicy,
        }}
        membershipStatus={membershipStatus}
      />
    </NextIntlClientProvider>,
  );
}

const copy = en.communities.membersOnly;
const said = (text: string) => text.replace("{community}", "Connect & Inspire");

describe("CommunityMembersOnly", () => {
  it("says a private community is private, under its description", () => {
    renderPanel("invite_only");
    expect(
      screen.getByRole("heading", { name: copy.titlePrivate }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /About/ })).toHaveTextContent(
      "Networking and more.",
    );
  });

  it.each<[JoinPolicy, MembershipStatus | null, string]>([
    ["invite_only", null, copy.inviteOnly],
    ["approval_required", null, copy.request],
    ["approval_required", "pending_approval", copy.pending],
    ["invite_only", "invited", copy.invited],
    ["approval_required", "invited", copy.invited],
    ["invite_only", "banned", copy.unavailable],
  ])(
    "on a %s community, a %s viewer reads the next step",
    (policy, status, text) => {
      renderPanel(policy, status);
      expect(screen.getByText(said(text))).toBeInTheDocument();
    },
  );

  it("says only members see inside an open community it may not show", () => {
    renderPanel("open");
    expect(
      screen.getByRole("heading", { name: copy.titleMembersOnly }),
    ).toBeInTheDocument();
    expect(screen.getByText(said(copy.join))).toBeInTheDocument();
  });

  it("points a member whose paid membership lapsed to the offers", () => {
    renderPanel("open", "active");
    expect(screen.getByText(said(copy.lapsed))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.offers })).toHaveAttribute(
      "href",
      "/communities/connect-inspire/offers",
    );
  });

  it("has no join button of its own: the rail's join control is the one action", () => {
    renderPanel("approval_required");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("leaves the About section out when there is no description", () => {
    renderPanel("invite_only", null, "  ");
    expect(screen.queryByRole("region", { name: /About/ })).toBeNull();
  });
});
