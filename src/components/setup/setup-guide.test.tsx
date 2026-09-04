import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  AGENT_REGISTER_URL,
  HUB_CLONE_URL,
  MCP_ENDPOINT,
} from "@/lib/setup-guide";
import { SetupGuide } from "./setup-guide";

const BANNED = [
  /product hunt/i,
  /this week/i,
  /week-activity/i,
  /member count/i,
  /meetup calendar/i,
  /tu delft/i,
];

function tFrom(messages: typeof en.setup) {
  return (key: string) => messages[key as keyof typeof messages];
}

describe("setup guide citation contract", () => {
  it("uses the same max-w-6xl page shell as Events / Discover", () => {
    const { container } = render(<SetupGuide t={tFrom(en.setup)} />);
    const shell = container.firstElementChild;
    expect(shell?.className.split(/\s+/)).toContain("max-w-6xl");
    expect(shell?.className.split(/\s+/)).not.toContain("max-w-5xl");
    expect(shell?.className.split(/\s+/)).not.toContain("max-w-4xl");
  });

  it("ends on the two real links only — clone repo and agent.md", () => {
    render(<SetupGuide t={tFrom(en.setup)} />);

    const clone = screen.getByRole("link", { name: en.setup.cloneLinkLabel });
    expect(clone).toHaveAttribute("href", HUB_CLONE_URL);
    expect(HUB_CLONE_URL).toBe("https://github.com/ai-tech-community/aitcom");

    const agent = screen.getByRole("link", { name: en.setup.agentLinkLabel });
    expect(agent).toHaveAttribute("href", AGENT_REGISTER_URL);
    expect(AGENT_REGISTER_URL).toBe("https://www.aitcommunity.org/agent.md");

    const hrefs = screen
      .getAllByRole("link")
      .map((node) => node.getAttribute("href"));
    expect(hrefs).toEqual([HUB_CLONE_URL, AGENT_REGISTER_URL]);
  });

  it("points agents at the live MCP endpoint from agent.md", () => {
    render(<SetupGuide t={tFrom(en.setup)} />);
    expect(screen.getByText(MCP_ENDPOINT)).toBeInTheDocument();
    expect(MCP_ENDPOINT).toBe("https://www.aitcommunity.org/api/mcp");
  });

  it("does not invent week activity, member counts, PH, Meetup, or TU Delft", () => {
    const { container } = render(<SetupGuide t={tFrom(en.setup)} />);
    const text = container.textContent ?? "";
    for (const pattern of BANNED) {
      expect(text).not.toMatch(pattern);
    }
  });
});

describe("setup i18n", () => {
  it("has matching EN and NL keys with real copy and no banned claims", () => {
    const enKeys = Object.keys(en.setup).sort();
    const nlKeys = Object.keys(nl.setup).sort();
    expect(nlKeys).toEqual(enKeys);

    for (const messages of [en.setup, nl.setup]) {
      expect(messages.title.trim().length).toBeGreaterThan(0);
      expect(messages.lead.trim().length).toBeGreaterThan(0);
      expect(messages.cloneLinkLabel.trim().length).toBeGreaterThan(0);
      expect(messages.agentLinkLabel.trim().length).toBeGreaterThan(0);
      const blob = Object.values(messages).join("\n");
      for (const pattern of BANNED) {
        expect(blob).not.toMatch(pattern);
      }
    }
  });
});
