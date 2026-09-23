import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { HUB_OPEN_HREF } from "@/lib/join-path";
import { PromoteJoinCta } from "./promote-join-cta";

const GUEST_HREF =
  "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=events&utm_campaign=ai-events";

describe("PromoteJoinCta", () => {
  it("keeps the hard Join door and UTMs for guests", () => {
    render(
      <PromoteJoinCta
        promoteJoin
        guestHref={GUEST_HREF}
        guestLabel="Join the Hub"
        hubLabel="Open Hub"
      />,
    );
    const join = screen.getByRole("link", { name: "Join the Hub" });
    expect(join).toHaveAttribute("href", GUEST_HREF);
    expect(screen.queryByRole("link", { name: "Open Hub" })).toBeNull();
  });

  it("swaps signed-in Hub members to Open Hub forum and never Join", () => {
    const { container } = render(
      <PromoteJoinCta
        promoteJoin={false}
        guestHref={GUEST_HREF}
        guestLabel="Join the Hub"
        hubLabel="Open Hub"
      />,
    );
    expect(screen.queryByRole("link", { name: "Join the Hub" })).toBeNull();
    expect(container.textContent).not.toMatch(/Join the Hub/i);
    expect(hrefsOf(container)).not.toContain(GUEST_HREF);
    expect(hrefsOf(container).some((href) => href?.includes("/join"))).toBe(
      false,
    );
    expect(screen.getByRole("link", { name: "Open Hub" })).toHaveAttribute(
      "href",
      HUB_OPEN_HREF,
    );
  });
});

function hrefsOf(container: HTMLElement) {
  return [...container.querySelectorAll("a")].map((node) =>
    node.getAttribute("href"),
  );
}
