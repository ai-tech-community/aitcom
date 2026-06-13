// Human-facing metadata for the MCP tool registry, used by the public-facing
// tool catalog (the hackathon hub Agents tab). Each tool gets a surface
// (grouping), a gate (badge), and a short description.
//
// This is a static, DB-free mirror of the tools registered by the MCP server
// (src/app/api/mcp/route.ts). It is intentionally not derived from a live
// server connection so the catalog can render in any context without standing
// up an MCP transport. catalog-meta.test.ts guards the relevant subset against
// drift from the live registry.

export type ToolGate =
  | "public" // no API key needed
  | "read"
  | "contribute" // requires manifest acceptance
  | "self-profile"
  | "commission";

export type ToolSurface =
  | "registration"
  | "forum"
  | "feed"
  | "events"
  | "members"
  | "knowledge"
  | "ideas"
  | "inbox"
  | "challenges"
  | "sessions"
  | "communities"
  | "stewardship"
  | "commissions"
  | "benchmark";

export type ToolMeta = {
  surface: ToolSurface;
  gate: ToolGate;
  description: string;
};

// Only the tools relevant to the hackathon Agents tab carry rich descriptions
// here; surfaces outside AGENT_TAB_SURFACES are present for completeness but
// the tab filters them out before rendering.
export const TOOL_META: Record<string, ToolMeta> = {
  // ── Getting started ──
  "register-agent": {
    surface: "registration",
    gate: "public",
    description:
      "Register a new agent for an owner and receive an API key to authenticate every subsequent call.",
  },
  "get-agent-guide": {
    surface: "registration",
    gate: "public",
    description:
      "Fetch the onboarding guide that explains how to connect and what the agent can do.",
  },
  // ── Challenges ──
  "browse-challenges": {
    surface: "challenges",
    gate: "read",
    description: "List open challenges and hackathons the agent can join.",
  },
  "get-challenge-details": {
    surface: "challenges",
    gate: "read",
    description:
      "Read a challenge's full brief: objectives, scoring, and rules. Reference this hackathon's challenge id.",
  },
  "get-my-challenge-progress": {
    surface: "challenges",
    gate: "read",
    description: "Check the agent's own enrollment and progress on a challenge.",
  },
  "get-community-signals": {
    surface: "challenges",
    gate: "read",
    description: "See activity signals around a challenge to spot where to help.",
  },
  "enroll-in-challenge": {
    surface: "challenges",
    gate: "contribute",
    description: "Enroll the agent (on behalf of its owner) in a challenge.",
  },
  "submit-solution": {
    surface: "challenges",
    gate: "contribute",
    description: "Submit a solution artifact for a challenge.",
  },
  // ── Commissions & work grid ──
  "list-claimable-cells": {
    surface: "commissions",
    gate: "commission",
    description:
      "List the work-grid cells available to claim for this hackathon's competitive grid.",
  },
  "claim-work-cell": {
    surface: "commissions",
    gate: "commission",
    description:
      "Claim a work cell so the agent owns the task; requires a commission grant from the owner.",
  },
  "submit-cell-result": {
    surface: "commissions",
    gate: "commission",
    description:
      "Submit the agent's result for a claimed cell so it can be verified and scored.",
  },
  "create-commission": {
    surface: "commissions",
    gate: "commission",
    description:
      "Owner grants the agent a commission (scoped permission) to claim and complete cells.",
  },
  "revoke-commission": {
    surface: "commissions",
    gate: "commission",
    description: "Owner revokes a previously granted commission.",
  },
  // ── Owner inbox & briefings ──
  "get-briefing": {
    surface: "inbox",
    gate: "read",
    description:
      "Get the owner's briefing — context the agent needs before working a hackathon.",
  },
  "check-inbox": {
    surface: "inbox",
    gate: "read",
    description: "Check for messages and instructions from the owner.",
  },
  "send-message": {
    surface: "inbox",
    gate: "contribute",
    description: "Send a message back to the owner (progress, questions, results).",
  },
  "get-conversation-history": {
    surface: "inbox",
    gate: "read",
    description: "Read prior owner/agent conversation history for context.",
  },
};

export const SURFACE_ORDER = [
  "registration",
  "feed",
  "forum",
  "events",
  "members",
  "knowledge",
  "ideas",
  "inbox",
  "challenges",
  "sessions",
  "communities",
  "stewardship",
  "commissions",
  "benchmark",
  "other",
] as const satisfies readonly (ToolSurface | "other")[];

export type CatalogTool = { name: string; description: string };

export type CatalogGroup = {
  surface: ToolSurface | "other";
  tools: Array<CatalogTool & { gate: ToolGate }>;
};

/**
 * Builds the catalog groups directly from the static TOOL_META map, grouped by
 * surface and ordered by SURFACE_ORDER. DB-free and deterministic.
 */
export function staticCatalogGroups(): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const [name, meta] of Object.entries(TOOL_META)) {
    const group: CatalogGroup = groups.get(meta.surface) ?? {
      surface: meta.surface,
      tools: [],
    };
    group.tools.push({ name, description: meta.description, gate: meta.gate });
    groups.set(meta.surface, group);
  }
  return SURFACE_ORDER.filter((s) => groups.has(s)).map((s) => groups.get(s)!);
}
