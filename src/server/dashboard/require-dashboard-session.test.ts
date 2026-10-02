import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: mocks.getSession,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireDashboardSession } from "./require-dashboard-session";

describe("requireDashboardSession", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.redirect.mockClear();
  });

  it("returns the signed-in member's session", async () => {
    const session = { user: { id: "u1" } };
    mocks.getSession.mockResolvedValue(session);

    await expect(requireDashboardSession()).resolves.toBe(session);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends a missing or expired session to sign-in instead of throwing on null", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(requireDashboardSession()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/signin",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/signin");
  });
});
