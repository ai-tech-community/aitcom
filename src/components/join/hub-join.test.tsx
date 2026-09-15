import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { HUB_OPEN_HREF } from "@/lib/join-path";
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

function hrefsOf(container: HTMLElement) {
  return [...container.querySelectorAll("a")].map((node) =>
    node.getAttribute("href"),
  );
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

  it("swaps the signup CTA to Open Hub for signed-in members", () => {
    const { container } = render(
      <HubJoin
        t={tFrom(en.hubJoin)}
        signupHref="/auth/signup"
        promoteJoin={false}
      />,
    );

    expect(
      screen.queryByRole("link", { name: en.hubJoin.cta }),
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(en.hubJoin.title);
    expect(container.textContent).not.toMatch(/Join the Hub/i);
    expect(hrefsOf(container).some((href) => href?.includes("/join"))).toBe(
      false,
    );
    expect(
      screen.getByRole("link", { name: en.hubJoin.hubCta }),
    ).toHaveAttribute("href", HUB_OPEN_HREF);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      en.hubJoin.memberTitle,
    );
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

describe("hub join route", () => {
  it("wires /join to the shared promote-Join helper and Hub session seed", () => {
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../app/[locale]/join/page.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("loadHubAuthSeed");
    expect(src).toContain("shouldPromoteJoin");
    expect(src).toContain("promoteJoin");
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
