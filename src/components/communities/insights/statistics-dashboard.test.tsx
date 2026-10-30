import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import fr from "../../../../messages/fr.json";
import type * as Recharts from "recharts";
import {
  buildCommunityStatistics,
  type StatisticsDays,
} from "@/server/communities/statistics";

const fake = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }));
vi.mock("@/trpc/react", () => ({
  api: { insights: { statistics: { useQuery: fake.query } } },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// Chart geometry is inspected in the browser. Keep its actual accessible tables.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof Recharts>()),
  ResponsiveContainer: () => null,
}));

import { StatisticsDashboard } from "./statistics-dashboard";

function fixture(days: StatisticsDays = 30, active = 120, activity = true) {
  return buildCommunityStatistics({
    now: new Date("2026-10-30T12:00:00Z"),
    days,
    memberships: [
      { status: "active", count: active },
      { status: "pending_approval", count: 3 },
      { status: "invited", count: 2 },
    ],
    activity: activity
      ? [
          {
            date: "2026-10-29",
            action: "thread.reply",
            actorType: "member",
            count: 5,
          },
          {
            date: "2026-10-29",
            action: "thread.reply",
            actorType: "agent",
            count: 2,
          },
          {
            date: "2026-10-29",
            action: "community.joined",
            actorType: "agent",
            count: 4,
          },
        ]
      : [],
    contributors: { current: activity ? 2 : 0, previous: 0, returning: 0 },
  });
}
const intlError = vi.fn();
function show(locale: "en" | "nl" | "fr" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ en, nl, fr }[locale]}
      timeZone="Europe/Amsterdam"
      onError={intlError}
    >
      <StatisticsDashboard slug="builders" />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.query.mockImplementation(({ days }: { days: StatisticsDays }) => ({
    data: fixture(days),
    isLoading: false,
    isError: false,
    refetch: fake.refetch,
  }));
});

describe("statistical dashboard", () => {
  it("defaults to 30 days and changes the query and dates for each preset", () => {
    show();
    expect(fake.query).toHaveBeenLastCalledWith({ slug: "builders", days: 30 });
    expect(screen.getByText("Sep 30, 2026 – Oct 29, 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "7 days" }));
    expect(fake.query).toHaveBeenLastCalledWith({ slug: "builders", days: 7 });
    expect(screen.getByText("Oct 23, 2026 – Oct 29, 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
    expect(fake.query).toHaveBeenLastCalledWith({ slug: "builders", days: 90 });
    expect(screen.getByRole("radio", { name: "90 days" })).toBeChecked();
    expect(intlError).not.toHaveBeenCalled();
  });

  it("shows a loading state without invented totals", () => {
    fake.query.mockReturnValue({ isLoading: true });
    show();
    expect(
      screen.getByRole("status", { name: "Loading community statistics" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Current members")).not.toBeInTheDocument();
  });

  it("shows read failures with retry even if stale data exists", () => {
    fake.query.mockReturnValue({
      isError: true,
      data: fixture(),
      refetch: fake.refetch,
    });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Statistics could not be loaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fake.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Current members")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No recorded activity in this period"),
    ).not.toBeInTheDocument();
  });

  it("keeps the membership snapshot for an activity-empty period", () => {
    fake.query.mockReturnValue({ data: fixture(30, 120, false) });
    show();
    expect(
      screen.getByText("No recorded activity in this period"),
    ).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getAllByText("0 · No prior activity").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/∞/)).not.toBeInTheDocument();
  });

  it("keeps absolute changes when prior activity was zero", () => {
    show();
    expect(screen.getByText("+5 · No prior activity")).toBeInTheDocument();
    expect(screen.queryByText(/∞/)).not.toBeInTheDocument();
  });

  it("links an empty membership to existing member management", () => {
    fake.query.mockReturnValue({ data: fixture(7, 0, false) });
    show();
    expect(screen.getByText("No active memberships")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Manage members" }))
      expect(link).toHaveAttribute(
        "href",
        "/communities/builders/settings/members",
      );
  });

  it("offers complete zero-filled daily tables with distinct series and numeric area totals", () => {
    fake.query.mockReturnValue({ data: fixture(7) });
    show();
    for (const summary of screen.getAllByText("View daily data"))
      fireEvent.click(summary);
    const participation = screen.getByRole("table", {
      name: "Participation over time · daily data",
    });
    expect(within(participation).getAllByRole("row")).toHaveLength(8);
    expect(
      within(participation).getByRole("row", { name: "Oct 29 5 2" }),
    ).toBeInTheDocument();
    const growth = screen.getByRole("table", {
      name: "Joins and voluntary leaves · daily data",
    });
    expect(
      within(growth).getByRole("row", { name: "Oct 29 4 0" }),
    ).toBeInTheDocument();
    const areas = screen.getByRole("table", {
      name: "Where participation happens",
    });
    expect(
      within(areas).getByRole("row", { name: "Forum 5 2" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("How these statistics are counted"));
    expect(screen.getByText(/scheduled posts by a member/)).toBeInTheDocument();
  });

  it.each(["nl", "fr"] as const)(
    "renders all statistical copy in %s without locale errors",
    (locale) => {
      show(locale);
      expect(intlError).not.toHaveBeenCalled();
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
      expect(screen.queryByText("Current members")).not.toBeInTheDocument();
    },
  );

  it("maintains matching keys in all supported catalogs", () => {
    const keys = (catalog: typeof en) =>
      Object.keys(catalog.communities.insights.statistics).sort();
    expect(keys(nl)).toEqual(keys(en));
    expect(keys(fr)).toEqual(keys(en));
    expect(Object.keys(nl.communities.insights.statistics.areas)).toEqual(
      Object.keys(en.communities.insights.statistics.areas),
    );
    expect(Object.keys(fr.communities.insights.statistics.areas)).toEqual(
      Object.keys(en.communities.insights.statistics.areas),
    );
  });
});
