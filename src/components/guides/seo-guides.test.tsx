import { existsSync, readFileSync } from "node:fs";
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
import {
  AGENT_READY_GREENS,
  AGENT_READY_H1,
  AGENT_READY_URL,
  AGENT_REGISTER_URL,
  appPathFromGuideHref,
  MCP_ENDPOINT,
  MCP_REGISTRY_H1,
  REGISTER_AGENT_H1,
  SETUP_PATH,
  WORLD_SUMMIT_DATES,
  WORLD_SUMMIT_H1,
  WORLD_SUMMIT_VENUE,
  hubHomeUrl,
  hubJoinUrl,
  setupGuideUrl,
} from "@/lib/seo-guides";
import { REGISTER_AGENT_MCP_MD } from "@/content/guides/register-agent-mcp";
import { AgentReadyCommunityGuide } from "./agent-ready-community-guide";
import { McpRegistryVsHubGuide } from "./mcp-registry-vs-hub-guide";
import { RegisterAgentMcpGuide } from "./register-agent-mcp-guide";
import { WorldSummitGuide } from "./world-summit-guide";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");

const PAGE_FILES = {
  registerAgentMcp: join(appLocale, "guides/register-agent-mcp/page.tsx"),
  mcpRegistryVsHub: join(
    appLocale,
    "guides/mcp-registry-vs-community-hub/page.tsx",
  ),
  agentReadyCommunity: join(appLocale, "guides/agent-ready-community/page.tsx"),
  worldSummit: join(
    appLocale,
    "events/world-summit-ai-amsterdam-2026/page.tsx",
  ),
} as const;

const BANNED = [
  /product hunt/i,
  /this week/i,
  /week-activity/i,
  /member count/i,
  /listed on the official/i,
  /oauth-authorization-server/i,
  /oauth-protected-resource/i,
  /openid-configuration/i,
  /well-known\/oauth/i,
  /\bROI\b/,
  /register for the summit/i,
  /register for (?:the )?world summit/i,
];

const AUTH_MD_GREEN = /auth\.md[\s\S]{0,40}green/i;
const DENIALS =
  /does not claim an official mcp registry listing|claimt geen official mcp registry-listing|auth\.md is not green|does not invent extra parameters, an oauth \/ auth\.md path, or a publish-to-official-registry step|verzint geen extra parameters, geen oauth- \/ auth\.md-pad, en geen publish-to-official-registry-stap/gi;

function tFrom<T extends Record<string, string>>(messages: T) {
  return (key: string) => messages[key as keyof T] ?? "";
}

function hrefsOf(container: HTMLElement) {
  return screen
    .getAllByRole("link")
    .filter((node) => container.contains(node))
    .map((node) => node.getAttribute("href"));
}

function expectHubDoors(container: HTMLElement, locale: string) {
  const hrefs = hrefsOf(container);
  const homeOk = hrefs.some(
    (href) =>
      href === "/" || href === `/${locale}` || href === hubHomeUrl(locale),
  );
  const joinOk = hrefs.some(
    (href) =>
      href === "/join" ||
      href === `/${locale}/join` ||
      href === hubJoinUrl(locale),
  );
  expect(homeOk).toBe(true);
  expect(joinOk).toBe(true);
}

function expectSetupLink(container: HTMLElement, locale: string) {
  const hrefs = hrefsOf(container);
  expect(
    hrefs.some(
      (href) =>
        href === "/setup" ||
        href === `/${locale}/setup` ||
        href === setupGuideUrl(locale),
    ),
  ).toBe(true);
}

function expectNoBannedClaims(text: string) {
  const withoutDenials = text.replace(DENIALS, "");
  for (const pattern of BANNED) {
    expect(withoutDenials).not.toMatch(pattern);
  }
  const authGreen = AUTH_MD_GREEN.exec(text);
  if (authGreen) {
    expect(authGreen[0].toLowerCase()).toMatch(/not green|isn['’]t green/);
  }
}

function expectMatchingKeys(
  enMessages: Record<string, string> | undefined,
  nlMessages: Record<string, string> | undefined,
) {
  expect(enMessages).toBeDefined();
  expect(nlMessages).toBeDefined();
  expect(Object.keys(nlMessages!).sort()).toEqual(
    Object.keys(enMessages!).sort(),
  );
  for (const messages of [enMessages!, nlMessages!]) {
    expect(messages.title?.trim().length).toBeGreaterThan(0);
    expectNoBannedClaims(Object.values(messages).join("\n"));
  }
}

describe("SEO guide routes", () => {
  it("keeps the three new guides and the existing World Summit URL", () => {
    expect(existsSync(PAGE_FILES.registerAgentMcp)).toBe(true);
    expect(existsSync(PAGE_FILES.mcpRegistryVsHub)).toBe(true);
    expect(existsSync(PAGE_FILES.agentReadyCommunity)).toBe(true);
    expect(existsSync(PAGE_FILES.worldSummit)).toBe(true);

    const registerSrc = readFileSync(PAGE_FILES.registerAgentMcp, "utf8");
    expect(registerSrc).toMatch(/GUIDE_PATHS\.registerAgentMcp/);
    expect(registerSrc).toContain("localeAlternates");

    const registrySrc = readFileSync(PAGE_FILES.mcpRegistryVsHub, "utf8");
    expect(registrySrc).toMatch(/GUIDE_PATHS\.mcpRegistryVsHub/);
    expect(registrySrc).toContain("localeAlternates");

    const readySrc = readFileSync(PAGE_FILES.agentReadyCommunity, "utf8");
    expect(readySrc).toMatch(/GUIDE_PATHS\.agentReadyCommunity/);
    expect(readySrc).toContain("localeAlternates");

    const summitSrc = readFileSync(PAGE_FILES.worldSummit, "utf8");
    expect(summitSrc).toMatch(/WORLD_SUMMIT_PATH/);
    expect(summitSrc).toContain("localeAlternates");
    expect(summitSrc).not.toMatch(/register for the summit/i);
  });

  it("uses the same max-w-6xl page shell as setup", () => {
    const pages = [
      <RegisterAgentMcpGuide
        key="register"
        locale="en"
        t={tFrom(en.guidesRegisterAgentMcp)}
      />,
      <McpRegistryVsHubGuide
        key="registry"
        locale="en"
        t={tFrom(en.guidesMcpRegistryVsHub)}
      />,
      <AgentReadyCommunityGuide
        key="ready"
        locale="en"
        t={tFrom(en.guidesAgentReadyCommunity)}
      />,
      <WorldSummitGuide
        key="summit"
        locale="en"
        t={tFrom(en.worldSummitEvent)}
      />,
    ];

    for (const page of pages) {
      const { container, unmount } = render(page);
      const shell = container.firstElementChild;
      expect(shell?.className.split(/\s+/)).toContain("max-w-6xl");
      expect(shell?.className.split(/\s+/)).not.toContain("max-w-5xl");
      expect(shell?.className.split(/\s+/)).not.toContain("max-w-4xl");
      unmount();
    }
  });
});

describe("register-agent MCP guide citation contract", () => {
  it("uses the exact EN H1 and the live register path", () => {
    expect(en.guidesRegisterAgentMcp.title).toBe(REGISTER_AGENT_H1);
    const { container } = render(
      <RegisterAgentMcpGuide
        locale="en"
        t={tFrom(en.guidesRegisterAgentMcp)}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: REGISTER_AGENT_H1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(MCP_ENDPOINT).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/Streamable HTTP/);
    expect(container.textContent).toMatch(/register-agent/);
    expect(container.textContent).toMatch(/claim/);
    expect(container.textContent).toMatch(/get-agent-guide/);
    expect(container.textContent).toMatch(/invite code/i);

    expect(container.textContent).toMatch(/Build/);
    expect(container.textContent).toMatch(/get-briefing/);
    expect(container.textContent).toMatch(
      /does not invent extra parameters, an OAuth \/ Auth\.md path, or a publish-to-Official-Registry step/i,
    );

    const hrefs = hrefsOf(container);
    expect(hrefs).toContain(AGENT_REGISTER_URL);
    expectSetupLink(container, "en");
    expectHubDoors(container, "en");
    expectNoBannedClaims(container.textContent ?? "");
    expectNoBannedClaims(REGISTER_AGENT_MCP_MD.en);
    expectNoBannedClaims(REGISTER_AGENT_MCP_MD.nl);
  });
});

describe("MCP registry vs hub guide citation contract", () => {
  it("separates install catalogs from belonging, without a registry listing claim", () => {
    expect(en.guidesMcpRegistryVsHub.title).toBe(MCP_REGISTRY_H1);
    const { container } = render(
      <McpRegistryVsHubGuide
        locale="en"
        t={tFrom(en.guidesMcpRegistryVsHub)}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: MCP_REGISTRY_H1 }),
    ).toBeInTheDocument();
    expect(container.textContent).toMatch(/tools to install/i);
    expect(container.textContent).toMatch(/belong/i);
    expect(container.textContent).toMatch(/does not claim/i);
    expect(container.textContent).toMatch(/Auth\.md is not green/i);
    for (const green of AGENT_READY_GREENS) {
      expect(container.textContent).toContain(green);
    }

    const hrefs = hrefsOf(container);
    expectSetupLink(container, "en");
    expect(hrefs).toContain(AGENT_REGISTER_URL);
    expect(hrefs).toContain(MCP_ENDPOINT);
    expect(hrefs).toContain(AGENT_READY_URL);
    expectHubDoors(container, "en");
    expectNoBannedClaims(container.textContent ?? "");
  });
});

describe("agent-ready community guide citation contract", () => {
  it("cites four greens only and keeps Auth.md red", () => {
    expect(en.guidesAgentReadyCommunity.title).toBe(AGENT_READY_H1);
    const { container } = render(
      <AgentReadyCommunityGuide
        locale="en"
        t={tFrom(en.guidesAgentReadyCommunity)}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: AGENT_READY_H1 }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain(AGENT_READY_URL);
    expect(container.textContent).toMatch(/Auth\.md is not green/i);
    expect(container.textContent).toMatch(/not a fifth green/i);
    for (const green of AGENT_READY_GREENS) {
      expect(container.textContent).toContain(green);
    }

    const hrefs = hrefsOf(container);
    expect(hrefs).toContain(AGENT_READY_URL);
    expect(hrefs).toContain(AGENT_REGISTER_URL);
    expect(hrefs).toContain(MCP_ENDPOINT);
    expectSetupLink(container, "en");
    expectHubDoors(container, "en");
    expectNoBannedClaims(container.textContent ?? "");
  });
});

describe("World Summit event page citation contract", () => {
  it("keeps live event facts and a Hub join door, not summit registration", () => {
    expect(en.worldSummitEvent.title).toBe(WORLD_SUMMIT_H1);
    const { container } = render(
      <WorldSummitGuide locale="en" t={tFrom(en.worldSummitEvent)} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: WORLD_SUMMIT_H1 }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain(WORLD_SUMMIT_DATES);
    expect(container.textContent).toContain(WORLD_SUMMIT_VENUE);
    expect(container.textContent).toMatch(
      /not (?:registration for|summit registration)/i,
    );
    expectHubDoors(container, "en");
    expectNoBannedClaims(container.textContent ?? "");
  });
});

describe("SEO guide i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    expectMatchingKeys(en.guidesRegisterAgentMcp, nl.guidesRegisterAgentMcp);
    expectMatchingKeys(en.guidesMcpRegistryVsHub, nl.guidesMcpRegistryVsHub);
    expectMatchingKeys(
      en.guidesAgentReadyCommunity,
      nl.guidesAgentReadyCommunity,
    );
    expectMatchingKeys(en.worldSummitEvent, nl.worldSummitEvent);
    expect(en.guidesRegisterAgentMcp.title).toBe(REGISTER_AGENT_H1);
    expect(en.guidesMcpRegistryVsHub.title).toBe(MCP_REGISTRY_H1);
    expect(en.guidesAgentReadyCommunity.title).toBe(AGENT_READY_H1);
    expect(en.worldSummitEvent.title).toBe(WORLD_SUMMIT_H1);
  });

  it("hard-links Hub home and join on Dutch pages too", () => {
    const pages = [
      <RegisterAgentMcpGuide
        key="register"
        locale="nl"
        t={tFrom(nl.guidesRegisterAgentMcp)}
      />,
      <McpRegistryVsHubGuide
        key="registry"
        locale="nl"
        t={tFrom(nl.guidesMcpRegistryVsHub)}
      />,
      <AgentReadyCommunityGuide
        key="ready"
        locale="nl"
        t={tFrom(nl.guidesAgentReadyCommunity)}
      />,
      <WorldSummitGuide
        key="summit"
        locale="nl"
        t={tFrom(nl.worldSummitEvent)}
      />,
    ];

    for (const page of pages) {
      const { container, unmount } = render(page);
      expectHubDoors(container, "nl");
      expectNoBannedClaims(container.textContent ?? "");
      unmount();
    }
  });
});

describe("SEO guide live facts", () => {
  it("maps apex and www cite URLs onto locale-aware app paths", () => {
    expect(appPathFromGuideHref("https://aitcommunity.org/en")).toBe("/");
    expect(appPathFromGuideHref("https://www.aitcommunity.org/en/join")).toBe(
      "/join",
    );
    expect(appPathFromGuideHref("https://aitcommunity.org/nl/setup")).toBe(
      "/setup",
    );
    expect(appPathFromGuideHref("https://www.aitcommunity.org/agent.md")).toBe(
      null,
    );
    expect(appPathFromGuideHref("https://www.aitcommunity.org/api/mcp")).toBe(
      null,
    );
  });

  it("points at the live MCP, setup, and agent.md URLs", () => {
    expect(MCP_ENDPOINT).toBe("https://www.aitcommunity.org/api/mcp");
    expect(AGENT_REGISTER_URL).toBe("https://www.aitcommunity.org/agent.md");
    expect(setupGuideUrl("en")).toBe("https://www.aitcommunity.org/en/setup");
    expect(hubHomeUrl("en")).toBe("https://www.aitcommunity.org/en");
    expect(hubJoinUrl("en")).toBe("https://www.aitcommunity.org/en/join");
    expect(SETUP_PATH).toBe("/setup");
    expect(AGENT_READY_GREENS).toEqual([
      "Content-Signal",
      "MCP Server Card",
      "ARD",
      "DNS-AID",
    ]);
  });
});
