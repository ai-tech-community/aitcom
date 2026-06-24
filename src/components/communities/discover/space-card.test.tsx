import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { openSpace } = vi.hoisted(() => ({ openSpace: vi.fn() }));
vi.mock("@/components/communities/explore/space-window-provider", () => ({
  useSpaceWindows: () => ({ openSpace }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));

import { SpaceCard } from "./space-card";

describe("SpaceCard", () => {
  it("opens the space window on click with the full ref", () => {
    render(
      <SpaceCard spaceName="Design" spaceSlug="design" communityName="ACME" communitySlug="acme" memberCount={4} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(openSpace).toHaveBeenCalledWith({
      communitySlug: "acme",
      spaceSlug: "design",
      spaceName: "Design",
      communityName: "ACME",
    });
  });
});
