import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { openSpace, requireAuth } = vi.hoisted(() => ({
  openSpace: vi.fn(),
  // Default: signed-in — run the gated action immediately.
  requireAuth: vi.fn((action: () => void) => action()),
}));
vi.mock("@/components/communities/explore/space-window-provider", () => ({
  useSpaceWindows: () => ({ openSpace }),
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ requireAuth }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));

import { SpaceCard } from "./space-card";

beforeEach(() => {
  openSpace.mockReset();
  requireAuth.mockReset();
  requireAuth.mockImplementation((action: () => void) => action());
});

describe("SpaceCard", () => {
  it("opens the space window on click with the full ref (signed in)", () => {
    render(
      <SpaceCard
        spaceName="Design"
        spaceSlug="design"
        communityName="ACME"
        communitySlug="acme"
        memberCount={4}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(openSpace).toHaveBeenCalledWith({
      communitySlug: "acme",
      spaceSlug: "design",
      spaceName: "Design",
      communityName: "ACME",
    });
  });

  it("does not open a window when auth is required (signed out)", () => {
    // Simulate signed-out: requireAuth prompts instead of running the action.
    requireAuth.mockImplementation(() => undefined);
    render(
      <SpaceCard
        spaceName="Design"
        spaceSlug="design"
        communityName="ACME"
        communitySlug="acme"
        memberCount={4}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(openSpace).not.toHaveBeenCalled();
  });
});
