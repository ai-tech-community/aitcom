import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";

const fake = vi.hoisted(() => ({
  memberships: [] as { slug: string; role: string; status: string }[],
  isError: false,
  isLoading: false,
  refetch: vi.fn(),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getMyCommunities: {
        useQuery: () => ({
          data: fake.memberships,
          isError: fake.isError,
          isLoading: fake.isLoading,
          refetch: fake.refetch,
        }),
      },
    },
  },
}));
vi.mock("./statistics-dashboard", () => ({
  StatisticsDashboard: ({ slug }: { slug: string }) => (
    <div>Statistics for {slug}</div>
  ),
}));
vi.mock("./magazine-performance", () => ({
  MagazinePerformance: ({ slug }: { slug: string }) => (
    <div>Magazine statistics for {slug}</div>
  ),
}));
vi.mock("./health-pulse", () => ({
  HealthPulse: () => <div>Existing health pulse</div>,
}));
vi.mock("./at-risk-list", () => ({
  AtRiskList: () => <div>At-risk list</div>,
}));
vi.mock("./unactivated-list", () => ({
  UnactivatedList: () => <div>Newcomer list</div>,
}));
vi.mock("../activation/activation-funnel", () => ({
  ActivationFunnel: () => <div>Activation funnel</div>,
}));
vi.mock("../activation/awaiting-response-list", () => ({
  AwaitingResponseList: () => <div>Awaiting response</div>,
}));
import { InsightsDashboard } from "./insights-dashboard";

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InsightsDashboard slug="builders" />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  fake.memberships = [];
  fake.isError = false;
  fake.isLoading = false;
  vi.clearAllMocks();
});

describe("Insights composition", () => {
  it("retries failed membership reads instead of falling back to moderator tools", () => {
    fake.isError = true;
    show();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fake.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Existing health pulse")).not.toBeInTheDocument();
  });

  it("waits for membership before mounting data panels", () => {
    fake.isLoading = true;
    show();
    expect(
      screen.getByRole("status", { name: "Loading community statistics" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Existing health pulse")).not.toBeInTheDocument();
  });
  it.each(["owner", "admin"])(
    "shows statistics and existing follow-up tools for an active %s",
    (role) => {
      fake.memberships = [{ slug: "builders", role, status: "active" }];
      show();
      expect(screen.getByText("Statistics for builders")).toBeInTheDocument();
      expect(
        screen.getByText("Magazine statistics for builders"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Existing health pulse"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Activation funnel")).toBeInTheDocument();
      expect(screen.getByText("At-risk list")).toBeInTheDocument();
      expect(screen.getByText("Newcomer list")).toBeInTheDocument();
      expect(screen.getByText("Awaiting response")).toBeInTheDocument();
      expect(
        screen.getByText(/statistics period selector does not change/),
      ).toBeInTheDocument();
    },
  );

  it("preserves moderator operational insights without mounting the statistics query", () => {
    fake.memberships = [
      { slug: "builders", role: "moderator", status: "active" },
    ];
    show();
    expect(
      screen.queryByText("Statistics for builders"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Existing health pulse")).toBeInTheDocument();
    expect(
      screen.queryByText("Magazine statistics for builders"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("At-risk list")).toBeInTheDocument();
  });

  it("does not grant statistics based on another community or an inactive membership", () => {
    fake.memberships = [
      { slug: "other", role: "owner", status: "active" },
      { slug: "builders", role: "admin", status: "banned" },
    ];
    show();
    expect(
      screen.queryByText("Statistics for builders"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Magazine statistics for builders"),
    ).not.toBeInTheDocument();
  });
});
