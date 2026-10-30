import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";

const fake = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }));
vi.mock("@/trpc/react", () => ({
  api: { communities: { getMyCommunities: { useQuery: fake.query } } },
}));
import InsightsLayout from "./layout";

async function show() {
  const params = Promise.resolve({ slug: "builders", locale: "en" });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Suspense fallback={null}>
          <InsightsLayout params={params}>
            <p>Insights content</p>
          </InsightsLayout>
        </Suspense>
      </NextIntlClientProvider>,
    );
    await params;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
describe("Insights layout membership dependency", () => {
  it("shows failed access reads with retry rather than denying access", async () => {
    fake.query.mockReturnValue({ isError: true, refetch: fake.refetch });
    await show();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(fake.refetch).toHaveBeenCalledOnce();
    expect(
      screen.queryByText(en.communities.insights.accessDenied),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Insights content")).not.toBeInTheDocument();
  });

  it("waits for membership data", async () => {
    fake.query.mockReturnValue({ isLoading: true });
    await show();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Insights content")).not.toBeInTheDocument();
  });

  it.each(["owner", "admin", "moderator"])(
    "preserves access for active %s",
    async (role) => {
      fake.query.mockReturnValue({
        data: [{ slug: "builders", role, status: "active" }],
      });
      await show();
      expect(screen.getByText("Insights content")).toBeInTheDocument();
    },
  );

  it("rejects an inactive owner", async () => {
    fake.query.mockReturnValue({
      data: [{ slug: "builders", role: "owner", status: "banned" }],
    });
    await show();
    expect(
      screen.getByText(en.communities.insights.accessDenied),
    ).toBeInTheDocument();
    expect(screen.queryByText("Insights content")).not.toBeInTheDocument();
  });
});
