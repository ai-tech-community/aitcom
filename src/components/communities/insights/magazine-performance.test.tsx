import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import fr from "../../../../messages/fr.json";
import type { MagazinePerformance as PerformanceData } from "@/server/magazines/stats/community-stats";

const fake = vi.hoisted(() => ({
  query: vi.fn(),
  retry: vi.fn(),
  intlError: vi.fn(),
}));
vi.mock("@/trpc/react", () => ({
  api: { insights: { magazinePerformance: { useQuery: fake.query } } },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
import { MagazinePerformance } from "./magazine-performance";

function fixture(page = 1): PerformanceData {
  return {
    magazine: { id: 12, name: "Builders Journal" },
    summary: {
      publishedIssues: 15,
      views: 100,
      readers: 7,
      subscribers: 13,
      joins: 6,
      activeSeconds: 900,
      readingSessions: 10,
    },
    issues: [
      {
        id: page === 1 ? 21 : 20,
        number: page === 1 ? 3 : 2,
        title: page === 1 ? "Building together" : "Our first experiments",
        publishedAt: "2026-10-27T12:00:00Z",
        views: 20,
        readers: 5,
        subscribers: 4,
        joins: 2,
        activeSeconds: 60,
        readingSessions: 2,
      },
    ],
    page,
    totalPages: 2,
    pageSize: 10,
  };
}
function content(locale: "en" | "nl" | "fr" = "en", slug = "builders") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ en, nl, fr }[locale]}
      timeZone="Europe/Amsterdam"
      onError={fake.intlError}
    >
      <MagazinePerformance slug={slug} />
    </NextIntlClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.query.mockImplementation(({ page }: { page: number }) => ({
    data: fixture(page),
    isLoading: false,
    isFetching: false,
    refetch: fake.retry,
  }));
});

describe("magazine performance in Insights", () => {
  it("shows all-time openings, global totals, current subscribers and existing issue-statistics links", () => {
    render(content());
    expect(fake.query).toHaveBeenLastCalledWith(
      { slug: "builders", locale: "en", page: 1 },
      expect.anything(),
    );
    expect(
      screen.getByRole("heading", { name: "Magazine performance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("All-time reading · current subscribers"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/community date filter does not apply/),
    ).toBeInTheDocument();
    expect(screen.getByText("15 min 0 sec")).toBeInTheDocument();
    expect(screen.getByText("1 min 30 sec")).toBeInTheDocument();
    expect(screen.getByText("30 sec")).toBeInTheDocument();
    expect(
      screen.getByText("Based on 10 measured page sessions."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Earlier openings have no duration/),
    ).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Building together" }),
    ).toHaveAttribute("href", "/communities/builders/magazine/issues/21/stats");
    expect(
      screen.getByRole("region", {
        name: "Published issues and their recorded performance",
      }),
    ).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByText("How magazine statistics are counted"));
    expect(
      screen.getByText(/not an exact count of people/),
    ).toBeInTheDocument();
    expect(fake.intlError).not.toHaveBeenCalled();
  });

  it("paginates issues without changing summary totals and resets pages when community changes", () => {
    const view = render(content());
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(fake.query).toHaveBeenLastCalledWith(
      { slug: "builders", locale: "en", page: 2 },
      expect.anything(),
    );
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Our first experiments" }),
    ).toBeInTheDocument();
    view.rerender(content("en", "another-community"));
    expect(fake.query).toHaveBeenLastCalledWith(
      { slug: "another-community", locale: "en", page: 1 },
      expect.anything(),
    );
  });

  it("shows progress and disables paging while retaining the previous magazine data", () => {
    fake.query.mockReturnValue({ data: fixture(), isFetching: true });
    render(content());
    expect(screen.getByText("Loading issue page…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders loading without fabricated zero metrics", () => {
    fake.query.mockReturnValue({ isLoading: true });
    render(content());
    expect(
      screen.getByRole("status", { name: "Loading magazine statistics" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Current confirmed subscribers"),
    ).not.toBeInTheDocument();
  });

  it("distinguishes a failed read from empty data and supports retry", () => {
    fake.query.mockReturnValue({
      data: fixture(),
      isError: true,
      refetch: fake.retry,
    });
    render(content());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Magazine statistics could not be loaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fake.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("100")).not.toBeInTheDocument();
  });

  it("links a missing magazine to existing magazine setup", () => {
    fake.query.mockReturnValue({ data: { ...fixture(), magazine: null } });
    render(content());
    expect(
      screen.getByText("This community has no magazine yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create magazine" }),
    ).toHaveAttribute("href", "/communities/builders/magazine/settings");
  });

  it("keeps current subscriber counts when no issue has been published", () => {
    const data = fixture();
    data.summary.publishedIssues = 0;
    data.issues = [];
    fake.query.mockReturnValue({ data });
    render(content());
    expect(screen.getByText("No published issues yet")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Magazine issue pages" }),
    ).not.toBeInTheDocument();
  });

  it.each(["nl", "fr"] as const)(
    "localizes the complete section in %s",
    (locale) => {
      render(content(locale));
      expect(fake.query).toHaveBeenLastCalledWith(
        { slug: "builders", locale, page: 1 },
        expect.anything(),
      );
      expect(fake.intlError).not.toHaveBeenCalled();
      expect(
        within(screen.getByRole("table")).getAllByRole("columnheader"),
      ).toHaveLength(6);
    },
  );

  it("has matching new message keys in every supported locale", () => {
    const keys = (messages: typeof en) =>
      Object.keys(messages.communities.insights.magazine).sort();
    expect(keys(nl)).toEqual(keys(en));
    expect(keys(fr)).toEqual(keys(en));
  });
});

it("shows no historic duration estimate when there are no measured sessions", () => {
  const data = fixture();
  data.summary.activeSeconds = 0;
  data.summary.readingSessions = 0;
  data.issues[0]!.activeSeconds = 0;
  data.issues[0]!.readingSessions = 0;
  fake.query.mockReturnValue({ data, isLoading: false, isFetching: false });
  render(content());
  expect(screen.getByText("No reading time measured yet.")).toBeInTheDocument();
  expect(screen.getAllByText("—")).toHaveLength(3);
  expect(screen.getByText("100")).toBeInTheDocument();
});
