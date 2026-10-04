import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: "en",
        messages: en,
        namespace: namespace as never,
      }),
  };
});
vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: async () => ({
    user: { name: "Ada", email: "ada@example.test", image: null },
  }),
}));
vi.mock("@/components/dashboard/member-dashboard-frame", () => ({
  MemberDashboardFrame: ({
    name,
    children,
  }: {
    name: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="frame" data-name={name}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/dashboard/side-panel/dashboard-side-panel", () => ({
  DashboardSidePanel: () => <p>Side panel</p>,
}));

import MemberDashboardLayout from "./layout";

describe("member dashboard", () => {
  it("keeps the side panel beside every other tab", async () => {
    render(await MemberDashboardLayout({ children: <p>Home</p> }));
    expect(screen.getByTestId("frame")).toHaveAttribute("data-name", "Ada");
    expect(
      screen.getByRole("complementary", { name: en.dashboard.sidePanelLabel }),
    ).toHaveTextContent("Side panel");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
