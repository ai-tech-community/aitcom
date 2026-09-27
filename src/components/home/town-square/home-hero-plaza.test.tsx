import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HomeHeroPlaza } from "./home-hero-plaza";

describe("HomeHeroPlaza", () => {
  it("keeps the art hidden and exposes the next event as a real link", () => {
    render(
      <HomeHeroPlaza
        board={{
          kind: "event",
          label: "Next up",
          title: "TEDAI Vienna",
          when: "Sat 10 Oct · 19:00",
        }}
        boardLink={{
          href: "/events/tedai-vienna",
          label: "Next up: TEDAI Vienna, Sat 10 Oct · 19:00",
        }}
      >
        <h1>AI Tech Community</h1>
      </HomeHeroPlaza>,
    );
    expect(screen.getByTestId("town-square-scene")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const link = screen.getByRole("link", {
      name: "Next up: TEDAI Vienna, Sat 10 Oct · 19:00",
    });
    expect(link).toHaveAttribute("href", "/events/tedai-vienna");
    // Not placed over the board yet (jsdom has no layout): screen-reader
    // text that turns into a visible chip on keyboard focus.
    expect(link.className).toContain("sr-only");
    expect(link.className).toContain("focus-visible:not-sr-only");
  });
});
