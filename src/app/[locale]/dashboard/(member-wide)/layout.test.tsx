import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: async () => ({
    user: { name: "", email: "ada@example.test" },
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

import MemberWideDashboardLayout from "./layout";

describe("member dashboard, full width", () => {
  it("uses the dashboard frame with no side panel", async () => {
    render(await MemberWideDashboardLayout({ children: <p>Workspace</p> }));
    expect(screen.getByTestId("frame")).toHaveAttribute(
      "data-name",
      "ada@example.test",
    );
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
