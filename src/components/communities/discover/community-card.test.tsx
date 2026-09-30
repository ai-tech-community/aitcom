import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DirectoryItem } from "./community-signals";

vi.mock("@/trpc/react", () => ({ api: {} })); // MemberStackView's module pulls trpc; keep it off the server
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/communities/member-stack", () => ({
  MemberStackView: () => <div data-testid="stack" />,
}));

import { CommunityCard } from "./community-card";

function item(over: Partial<DirectoryItem> = {}): DirectoryItem {
  return {
    id: "c1",
    slug: "acme",
    name: "ACME Builders",
    description: "Builders who ship",
    logoUrl: null,
    joinPolicy: "open",
    createdAt: new Date("2025-01-01"),
    memberCount: 12,
    activeRecently: 3,
    newJoins: 0,
    score: 9,
    isNew: false,
    nextEvent: {
      slug: "meetup",
      title: "Meetup",
      date: "2026-10-14T00:00:00.000Z",
      startTime: "19:00",
      timezone: "Europe/Amsterdam",
      city: "Amsterdam",
      online: false,
    },
    places: ["Amsterdam"],
    faces: [],
    ...over,
  };
}

describe("CommunityCard", () => {
  it("links to the community page, named by the community", () => {
    render(<CommunityCard community={item()} />);
    const link = screen.getByRole("link", { name: "ACME Builders" });
    expect(link).toHaveAttribute("href", "/communities/acme");
  });

  it("shows the next event with its day and city", () => {
    render(<CommunityCard community={item()} />);
    expect(
      screen.getByText('nextEventAt:{"when":"Wed 14 Oct","place":"Amsterdam"}'),
    ).toBeInTheDocument();
  });

  it("says plainly when nothing is planned", () => {
    render(<CommunityCard community={item({ nextEvent: null })} />);
    expect(screen.getByText("noEvent")).toBeInTheDocument();
  });

  it("names an online event's place as online", () => {
    render(
      <CommunityCard
        community={item({
          nextEvent: { ...item().nextEvent!, city: null, online: true },
        })}
      />,
    );
    expect(
      screen.getByText(
        'nextEventAt:{"when":"Wed 14 Oct","place":"placeOnline"}',
      ),
    ).toBeInTheDocument();
  });

  it("shows recent activity, the real join policy and the member count", () => {
    render(
      <CommunityCard
        community={item({ joinPolicy: "approval_required", memberCount: 1 })}
      />,
    );
    expect(screen.getByText('activeRecently:{"count":3}')).toBeInTheDocument();
    expect(screen.getByText("joinApproval")).toBeInTheDocument();
    expect(screen.getByText('membersCount:{"count":1}')).toBeInTheDocument();
  });

  it("marks a new community", () => {
    const { rerender } = render(<CommunityCard community={item()} />);
    expect(screen.queryByText("isNew")).toBeNull();
    rerender(<CommunityCard community={item({ isNew: true })} />);
    expect(screen.getByText("isNew")).toBeInTheDocument();
  });

  it("hides the face stack from screen readers (the count is in text)", () => {
    render(<CommunityCard community={item()} />);
    expect(screen.getByTestId("stack").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
