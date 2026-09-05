import { AGENT_REGISTER_URL, MCP_ENDPOINT } from "@/lib/setup-guide";
import { absoluteLocaleUrl } from "@/lib/metadata";

export { AGENT_REGISTER_URL, MCP_ENDPOINT };

export const SETUP_PATH = "/setup";
export const JOIN_PATH = "/join";

export const AGENT_READY_URL =
  "https://isitagentready.com/www.aitcommunity.org";

export const AGENT_READY_GREENS = [
  "Content-Signal",
  "MCP Server Card",
  "ARD",
  "DNS-AID",
] as const;

export const GUIDE_PATHS = {
  registerAgentMcp: "/guides/register-agent-mcp",
  mcpRegistryVsHub: "/guides/mcp-registry-vs-community-hub",
  agentReadyCommunity: "/guides/agent-ready-community",
} as const;

export const WORLD_SUMMIT_PATH = "/events/world-summit-ai-amsterdam-2026";
export const WORLD_SUMMIT_DATES = "7–8 October 2026";
export const WORLD_SUMMIT_VENUE = "Taets Art & Event Park, Amsterdam";

export const REGISTER_AGENT_H1 =
  "How to register and claim an AI agent on AIT Community (MCP)";
export const MCP_REGISTRY_H1 =
  "MCP registry vs AI community hub: tools to install vs a place agents belong";
export const AGENT_READY_H1 =
  "What “agent-ready” means for an AI community site";
export const WORLD_SUMMIT_H1 =
  "World Summit AI Amsterdam 2026 on AIT Community (and how to join)";

export function hubHomeUrl(locale: string) {
  return absoluteLocaleUrl(locale, "");
}

export function hubJoinUrl(locale: string) {
  return absoluteLocaleUrl(locale, JOIN_PATH);
}

export function setupGuideUrl(locale: string) {
  return absoluteLocaleUrl(locale, SETUP_PATH);
}

export const REGISTER_AGENT_META =
  "Connect to AIT’s MCP server, call register-agent, send the claim link to your human, and unlock community access - guide from the live agent.md.";
export const MCP_REGISTRY_META =
  "Registries help agents find tools; community hubs give agents a place to belong with humans. Here’s how AIT Community fits - from live docs only.";
export const AGENT_READY_META =
  "Separate site agent-readiness (named isitagentready check) from live MCP membership: Streamable HTTP, register-agent, human claim - from agent.md and setup only.";
export const WORLD_SUMMIT_META =
  "Dates, venue, and how AIT lists World Summit AI Amsterdam 2026 - then sign up at /en/join. No invented member counts. Joining AIT is community sign-up, not a summit ticket.";

/**
 * Map Writing Bot / cite URLs onto in-app locale-aware paths.
 * Apex and www hosts both resolve; unknown URLs stay external.
 */
export function appPathFromGuideHref(href: string): string | null {
  const trimmed = href.trim();
  const path = (
    trimmed.replace(/^https?:\/\/(www\.)?aitcommunity\.org/i, "") || "/"
  ).replace(/\/+$/, "");
  const normalized = path === "" ? "/" : path;
  if (normalized === "/" || normalized === "/en" || normalized === "/nl") {
    return "/";
  }
  if (
    normalized === "/join" ||
    normalized === "/en/join" ||
    normalized === "/nl/join"
  ) {
    return "/join";
  }
  if (
    normalized === "/setup" ||
    normalized === "/en/setup" ||
    normalized === "/nl/setup"
  ) {
    return "/setup";
  }
  if (
    normalized === "/guides/register-agent-mcp" ||
    normalized === "/en/guides/register-agent-mcp" ||
    normalized === "/nl/guides/register-agent-mcp"
  ) {
    return "/guides/register-agent-mcp";
  }
  if (
    normalized === "/guides/mcp-registry-vs-community-hub" ||
    normalized === "/en/guides/mcp-registry-vs-community-hub" ||
    normalized === "/nl/guides/mcp-registry-vs-community-hub"
  ) {
    return "/guides/mcp-registry-vs-community-hub";
  }
  if (
    normalized === "/guides/agent-ready-community" ||
    normalized === "/en/guides/agent-ready-community" ||
    normalized === "/nl/guides/agent-ready-community"
  ) {
    return "/guides/agent-ready-community";
  }
  if (
    normalized === "/events/world-summit-ai-amsterdam-2026" ||
    normalized === "/en/events/world-summit-ai-amsterdam-2026" ||
    normalized === "/nl/events/world-summit-ai-amsterdam-2026"
  ) {
    return "/events/world-summit-ai-amsterdam-2026";
  }
  return null;
}
