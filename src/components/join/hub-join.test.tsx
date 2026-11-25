import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
import type { ConsentedJoinMember } from "@/lib/join-page-proof";

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
    const { container } = render(
      <HubJoin t={tFrom(en.hubJoin)} signupHref="/auth/signup?code=abc" />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: en.hubJoin.title }),
    ).toBeInTheDocument();
    expect(screen.queryByText(en.hubJoin.lead)).not.toBeInTheDocument();
    expect(
      screen.queryByText(en.hubJoin.audienceJobSeekersBody),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(en.hubJoin.audienceBuildersBody),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(en.hubJoin.audienceHostsBody),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: en.hubJoin.faqLabel }),
    ).toBeInTheDocument();
    expect(screen.getByText(en.hubJoin.faqAddQuestion)).toBeInTheDocument();
    expect(screen.getByText(en.hubJoin.faqAddAnswer)).toBeInTheDocument();
    expect(
      screen.getByText(en.hubJoin.faqCofounderQuestion),
    ).toBeInTheDocument();
    expect(screen.getByText(en.hubJoin.faqCofounderAnswer)).toBeInTheDocument();
    expect(screen.getByText(en.hubJoin.faqFreeQuestion)).toBeInTheDocument();
    expect(screen.getByText(en.hubJoin.faqFreeAnswer)).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: en.hubJoin.cta });
    expect(cta).toHaveAttribute("href", "/auth/signup?code=abc");

    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld?.textContent).toContain('"@type":"FAQPage"');
    expect(ld?.textContent).toContain(en.hubJoin.faqAddQuestion);
    expect(ld?.textContent).toContain(en.hubJoin.faqCofounderQuestion);
    expect(ld?.textContent).toContain(en.hubJoin.faqFreeQuestion);
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
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: en.hubJoin.memberProofLabel }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: en.hubJoin.weeklyQuestionLabel }),
    ).not.toBeInTheDocument();
  });

  it("shows a consented member with initials until a photo loads", () => {
    const member: ConsentedJoinMember = {
      name: "Ada Lovelace",
      role: "Builder",
      line: "I come for the events.",
      photoUrl: "https://cdn.example/ada.jpg",
      testimonialConsent: true,
    };
    const { container } = render(
      <HubJoin
        t={tFrom(en.hubJoin)}
        signupHref="/auth/signup"
        memberProof={[member]}
      />,
    );

    expect(screen.getByText(member.name)).toBeInTheDocument();
    expect(screen.getByText(member.role)).toBeInTheDocument();
    expect(screen.getByText(member.line)).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
    const photo = container.querySelector("img");
    expect(photo).toHaveAttribute("src", member.photoUrl);
    expect(photo?.className).toContain("hidden");

    fireEvent.load(photo!);
    expect(photo?.className).not.toContain("hidden");

    fireEvent.error(photo!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("links this week's question only when a thread is configured", () => {
    const { container } = render(
      <HubJoin
        t={tFrom(en.hubJoin)}
        signupHref="/auth/signup"
        weeklyQuestion={{
          title: "What are you shipping this month?",
          href: "/communities/ait/forum/shipping-this-month",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: en.hubJoin.weeklyQuestionLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "What are you shipping this month?" }),
    ).toHaveAttribute("href", "/communities/ait/forum/shipping-this-month");
    expect(container.querySelector("img")).toBeNull();
  });

  it("uses the Dutch promise when the catalogue is Dutch", () => {
    render(<HubJoin t={tFrom(nl.hubJoin)} signupHref="/auth/signup" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Het gratis thuis voor AI-mensen: banen, startups, evenementen",
    );
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
    expect(src).toContain("joinPageMetadata");
    expect(src).toContain('localeAlternates("/join")');
    expect(src).not.toContain("redirect(");
  });
});

describe("hub join i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    const enKeys = Object.keys(en.hubJoin).sort();
    const nlKeys = Object.keys(nl.hubJoin).sort();
    expect(nlKeys).toEqual(enKeys);

    expect(en.hubJoin.title).toBe(
      "The free home for AI people: jobs, startups, events",
    );
    expect(nl.hubJoin.title).toBe(
      "Het gratis thuis voor AI-mensen: banen, startups, evenementen",
    );

    for (const messages of [en.hubJoin, nl.hubJoin]) {
      expect(messages.lead).toBe(
        "Your startup may already have a page on AIT. Claim it, keep it up to date, and get feedback on Launchpad.",
      );
      expect(messages.metaDescription).toBe(
        "The free home for AI people in Europe. Find AI jobs, claim your startup page, post on Launchpad and join AI events. Free to join.",
      );
      expect(messages.metaDescription.length).toBeLessThanOrEqual(155);
      expect(messages.metaDescription).not.toMatch(DENIALS);
      expect(messages.cta.trim().length).toBeGreaterThan(0);
      const blob = Object.entries(messages)
        .filter(([key]) => key !== "weeklyQuestionLabel")
        .map(([, value]) => value)
        .join("\n")
        .replace(DENIALS, "");
      for (const pattern of BANNED) {
        expect(blob).not.toMatch(pattern);
      }
    }
  });
});
