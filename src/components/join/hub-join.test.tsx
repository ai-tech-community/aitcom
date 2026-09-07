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

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { GUIDE_PATHS } from "@/lib/seo-guides";
import { HubJoin } from "./hub-join";

const BANNED = [
  /product hunt/i,
  /this week/i,
  /week-activity/i,
  /member count/i,
  /meetup calendar/i,
  /tu delft/i,
  /register for the summit/i,
  /register for (?:the )?world summit/i,
];

const DENIALS =
  /does not register you for World Summit|registreert je niet voor World Summit/gi;

function tFrom(messages: typeof en.hubJoin) {
  return (key: string) => messages[key as keyof typeof messages];
}

describe("hub join door", () => {
  it("uses the same max-w-6xl page shell as Setup / Events", () => {
    const { container } = render(
      <HubJoin t={tFrom(en.hubJoin)} signupHref="/auth/signup" />,
    );
    const shell = container.firstElementChild;
    expect(shell?.className.split(/\s+/)).toContain("max-w-6xl");
    expect(shell?.className.split(/\s+/)).not.toContain("max-w-5xl");
    expect(shell?.className.split(/\s+/)).not.toContain("max-w-4xl");
  });

  it("is community Hub sign-up with a hard CTA into /auth/signup", () => {
    render(
      <HubJoin t={tFrom(en.hubJoin)} signupHref="/auth/signup?code=abc" />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: en.hubJoin.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(en.hubJoin.lead)).toBeInTheDocument();
    expect(screen.getByText(/Hub sign-up only/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not register you for World Summit/i),
    ).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: en.hubJoin.cta });
    expect(cta).toHaveAttribute("href", "/auth/signup?code=abc");
  });

  it("links the community home and one live guide", () => {
    render(<HubJoin t={tFrom(en.hubJoin)} signupHref="/auth/signup" />);

    expect(
      screen.getByRole("link", { name: en.hubJoin.homeLabel }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: en.hubJoin.guideLabel }),
    ).toHaveAttribute("href", GUIDE_PATHS.registerAgentMcp);
  });

  it("does not invent week activity, member counts, or summit tickets", () => {
    const { container } = render(
      <HubJoin t={tFrom(en.hubJoin)} signupHref="/auth/signup" />,
    );
    const text = (container.textContent ?? "").replace(DENIALS, "");
    for (const pattern of BANNED) {
      expect(text).not.toMatch(pattern);
    }
  });
});

describe("hub join i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    const enKeys = Object.keys(en.hubJoin).sort();
    const nlKeys = Object.keys(nl.hubJoin).sort();
    expect(nlKeys).toEqual(enKeys);

    for (const messages of [en.hubJoin, nl.hubJoin]) {
      expect(messages.title.trim().length).toBeGreaterThan(0);
      expect(messages.lead.trim().length).toBeGreaterThan(0);
      expect(messages.cta.trim().length).toBeGreaterThan(0);
      const blob = Object.values(messages).join("\n").replace(DENIALS, "");
      for (const pattern of BANNED) {
        expect(blob).not.toMatch(pattern);
      }
    }
  });
});
