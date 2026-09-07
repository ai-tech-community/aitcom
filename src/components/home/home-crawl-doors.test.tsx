import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { GUIDE_PATHS, JOIN_PATH } from "@/lib/seo-guides";
import { HOME_CRAWL_DOORS, HomeCrawlDoors } from "./home-crawl-doors";

const BANNED = [
  /product hunt/i,
  /member count/i,
  /register for the summit/i,
  /register for (?:the )?world summit/i,
];

const DENIALS =
  /does not register you for World Summit|registreert je niet voor World Summit/gi;

function tFrom(messages: typeof en.hubDoors) {
  return (key: string) => messages[key as keyof typeof messages];
}

const dir = dirname(fileURLToPath(import.meta.url));

describe("homepage crawl doors", () => {
  it("hard-links join and the three live guides", () => {
    render(<HomeCrawlDoors t={tFrom(en.hubDoors)} />);

    expect(HOME_CRAWL_DOORS.map((door) => door.href)).toEqual([
      JOIN_PATH,
      GUIDE_PATHS.registerAgentMcp,
      GUIDE_PATHS.mcpRegistryVsHub,
      GUIDE_PATHS.agentReadyCommunity,
    ]);

    const hrefs = screen
      .getAllByRole("link")
      .map((node) => node.getAttribute("href"));
    expect(hrefs).toEqual([
      "/join",
      "/guides/register-agent-mcp",
      "/guides/mcp-registry-vs-community-hub",
      "/guides/agent-ready-community",
    ]);
    expect(screen.getByText(en.hubDoors.joinLabel)).toBeInTheDocument();
    expect(screen.getByText(en.hubDoors.registerLabel)).toBeInTheDocument();
    expect(screen.getByText(en.hubDoors.registryLabel)).toBeInTheDocument();
    expect(screen.getByText(en.hubDoors.agentReadyLabel)).toBeInTheDocument();
  });

  it("is mounted on the locale homepage so /en can crawl the doors", () => {
    const homepage = readFileSync(
      join(dir, "../../app/[locale]/page.tsx"),
      "utf8",
    );
    expect(homepage).toContain("HomeCrawlDoors");
    expect(homepage).toContain("hubDoors");
  });

  it("does not invent member counts or summit registration", () => {
    const { container } = render(<HomeCrawlDoors t={tFrom(en.hubDoors)} />);
    const text = (container.textContent ?? "").replace(DENIALS, "");
    for (const pattern of BANNED) {
      expect(text).not.toMatch(pattern);
    }
  });
});

describe("homepage crawl door i18n", () => {
  it("has matching EN and NL keys with real short copy", () => {
    const enKeys = Object.keys(en.hubDoors).sort();
    const nlKeys = Object.keys(nl.hubDoors).sort();
    expect(nlKeys).toEqual(enKeys);

    for (const messages of [en.hubDoors, nl.hubDoors]) {
      expect(messages.kicker.trim().length).toBeGreaterThan(0);
      expect(messages.joinLabel.trim().length).toBeGreaterThan(0);
      expect(messages.registerLabel.trim().length).toBeGreaterThan(0);
      expect(messages.registryLabel.trim().length).toBeGreaterThan(0);
      expect(messages.agentReadyLabel.trim().length).toBeGreaterThan(0);
      const blob = Object.values(messages).join("\n").replace(DENIALS, "");
      for (const pattern of BANNED) {
        expect(blob).not.toMatch(pattern);
      }
    }
  });
});
