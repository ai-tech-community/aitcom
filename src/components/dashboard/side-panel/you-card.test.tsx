import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

type Query = {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

const queries = vi.hoisted(() => ({
  profile: {} as Query,
  streak: {} as Query,
  boost: {} as Query,
  chart: {} as Query,
  history: {} as Query,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    members: {
      getMyProfile: { useQuery: () => queries.profile },
      getMyStreak: { useQuery: () => queries.streak },
      getActiveBoost: { useQuery: () => queries.boost },
      getMyPointsChart: { useQuery: () => queries.chart },
      getMyPointsHistory: { useQuery: () => queries.history },
    },
  },
}));

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

import { YouCard } from "./you-card";

function loaded(data: unknown): Query {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

const PROFILE = {
  profile: { displayName: "Ada", xp: 450, level: 3 },
  badges: [
    { slug: "regular", description: "Attended 3 events", earnedAt: "x" },
  ],
  names: null,
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <YouCard fallbackName="ada@example.com" avatarUrl={null} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  queries.profile = loaded(PROFILE);
  queries.streak = loaded({
    currentStreak: 4,
    longestStreak: 9,
    total: 30,
    streak: [],
  });
  queries.boost = loaded(null);
  queries.chart = loaded([]);
  queries.history = loaded([]);
});

describe("YouCard", () => {
  it("shows name, level and an accessible, neutral XP bar", () => {
    renderCard();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Level 3")).toBeInTheDocument();

    // 450 XP at 200 XP per level: 50 of 200 towards level 4.
    const bar = screen.getByRole("progressbar", {
      name: "XP towards level 4",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar).toHaveAttribute("aria-valuetext", "50 of 200 XP");
    const fill = bar.querySelector('[data-slot="progress-indicator"]');
    expect(fill).toHaveClass("bg-foreground");
    expect(fill).not.toHaveClass("bg-primary");
  });

  it("links to the profile form on the Settings tab", () => {
    renderCard();
    expect(
      screen.getByRole("link", { name: en.dashboard.you.editProfile }),
    ).toHaveAttribute("href", "/dashboard/settings#profile");
  });

  it("shows the compact streak with this week's seven days", () => {
    renderCard();
    expect(screen.getByText(/day streak/)).toHaveTextContent("4 day streak");
    const week = screen.getByRole("list", { name: en.dashboard.you.thisWeek });
    expect(week.querySelectorAll("li")).toHaveLength(7);
  });

  it("invites a member without a profile to set one up", () => {
    queries.profile = loaded({ ...PROFILE, profile: null });
    renderCard();
    expect(
      screen.getByText(en.dashboard.you.noProfileTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.dashboard.you.noProfileCta }),
    ).toHaveAttribute("href", "/dashboard/settings#profile");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows an error with retry when the profile fails to load", () => {
    const refetch = vi.fn();
    queries.profile = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    };
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the live boost as one line, the panel's only orange", () => {
    queries.boost = loaded({
      name: "Launch week",
      multiplier: "2",
      description: null,
      ctaText: null,
      ctaLink: "/events",
      endsAt: null,
    });
    const { container } = renderCard();
    expect(
      screen.getByRole("link", { name: /2× XP: Launch week/ }),
    ).toHaveAttribute("href", "/events");
    expect(
      container.querySelectorAll(".text-primary, .bg-primary"),
    ).toHaveLength(1);
  });

  it("expands the full progress in place", () => {
    renderCard();
    const toggle = screen.getByRole("button", {
      name: en.dashboard.you.seeProgress,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: en.dashboard.you.hideProgress }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("grid", {
        name: en.dashboard.progress.calendar.label,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("9 days")).toBeInTheDocument();
    expect(screen.getByText(en.badges.regular)).toBeInTheDocument();
  });
});
