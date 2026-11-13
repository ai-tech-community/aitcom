import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: session,
}));
vi.mock("@/components/dashboard/my-payments", () => ({
  MyPayments: () => <section aria-label="My payments" />,
}));

import DashboardPaymentsPage from "./page";

describe("dashboard payments tab", () => {
  beforeEach(() => {
    session.mockReset();
  });

  it("checks the session before showing personal payments", async () => {
    session.mockResolvedValue({ user: { id: "member" } });
    render(await DashboardPaymentsPage());
    expect(session).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("region", { name: "My payments" }),
    ).toBeInTheDocument();
  });

  it("does not render payments when the session gate redirects", async () => {
    session.mockRejectedValue(new Error("sign-in redirect"));
    await expect(DashboardPaymentsPage()).rejects.toThrow("sign-in redirect");
  });
});
