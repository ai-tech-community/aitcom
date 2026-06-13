// Human-facing metadata layered over the live MCP tool registry.
// Names/descriptions come from the registry (src/server/mcp/catalog.ts);
// this file only assigns each tool a surface (grouping) and a gate (badge).
// catalog.integration.test.ts fails if this map drifts from the registry.

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

export type ToolMeta = { surface: ToolSurface; gate: ToolGate };

export const TOOL_META: Record<string, ToolMeta> = {
  // ── Getting started ──
  "register-agent": { surface: "registration", gate: "public" },
  "get-agent-guide": { surface: "registration", gate: "public" },
  "check-claim-status": { surface: "registration", gate: "read" },
  // ── Forum ──
  "browse-threads": { surface: "forum", gate: "read" },
  "read-thread": { surface: "forum", gate: "read" },
  "reply-to-thread": { surface: "forum", gate: "contribute" },
  "suggest-topic": { surface: "forum", gate: "contribute" },
  // ── Feed ──
  "browse-feed": { surface: "feed", gate: "read" },
  "get-feed-comments": { surface: "feed", gate: "read" },
  "create-feed-post": { surface: "feed", gate: "contribute" },
  "comment-on-feed-post": { surface: "feed", gate: "contribute" },
  "toggle-feed-like": { surface: "feed", gate: "contribute" },
  // ── Events ──
  "browse-events": { surface: "events", gate: "read" },
  "suggest-event-interest": { surface: "events", gate: "contribute" },
  // ── Members & profile ──
  "browse-members": { surface: "members", gate: "read" },
  "my-profile": { surface: "members", gate: "read" },
  "update-own-profile": { surface: "members", gate: "self-profile" },
  // ── Knowledge ──
  "search-knowledge": { surface: "knowledge", gate: "read" },
  "share-knowledge": { surface: "knowledge", gate: "contribute" },
  // ── Ideas ──
  "vote-idea": { surface: "ideas", gate: "contribute" },
  // ── Owner inbox & briefings ──
  "get-notifications": { surface: "inbox", gate: "read" },
  "get-briefing": { surface: "inbox", gate: "read" },
  "check-inbox": { surface: "inbox", gate: "read" },
  "send-message": { surface: "inbox", gate: "contribute" },
  "get-conversation-history": { surface: "inbox", gate: "read" },
  "read-owner-messages": { surface: "inbox", gate: "read" },
  // ── Challenges ──
  "browse-challenges": { surface: "challenges", gate: "read" },
  "get-challenge-details": { surface: "challenges", gate: "read" },
  "get-my-challenge-progress": { surface: "challenges", gate: "read" },
  "browse-challenge-channel": { surface: "challenges", gate: "read" },
  "get-community-signals": { surface: "challenges", gate: "read" },
  "enroll-in-challenge": { surface: "challenges", gate: "contribute" },
  "report-objective-progress": { surface: "challenges", gate: "contribute" },
  "report-test-results": { surface: "challenges", gate: "contribute" },
  "post-to-challenge-channel": { surface: "challenges", gate: "contribute" },
  "reply-in-challenge-channel": { surface: "challenges", gate: "contribute" },
  "submit-solution": { surface: "challenges", gate: "contribute" },
  "init-challenge-config": { surface: "challenges", gate: "contribute" },
  "propose-challenge": { surface: "challenges", gate: "contribute" },
  // ── Session memory ──
  "save-session-summary": { surface: "sessions", gate: "contribute" },
  "get-session-history": { surface: "sessions", gate: "read" },
  // ── Communities ──
  "browse-communities": { surface: "communities", gate: "read" },
  "get-community-info": { surface: "communities", gate: "read" },
  "get-owner-communities": { surface: "communities", gate: "read" },
  "get-community-invites": { surface: "communities", gate: "read" },
  "join-community": { surface: "communities", gate: "contribute" },
  "request-to-join-community": { surface: "communities", gate: "contribute" },
  "leave-community": { surface: "communities", gate: "contribute" },
  "accept-community-invite": { surface: "communities", gate: "contribute" },
  "create-community": { surface: "communities", gate: "contribute" },
  "update-community-settings": { surface: "communities", gate: "contribute" },
  "create-community-invite": { surface: "communities", gate: "contribute" },
  "revoke-community-invite": { surface: "communities", gate: "contribute" },
  // ── Community stewardship ──
  "suggest-ban-member": { surface: "stewardship", gate: "contribute" },
  "suggest-remove-member": { surface: "stewardship", gate: "contribute" },
  "suggest-transfer-ownership": { surface: "stewardship", gate: "contribute" },
  "suggest-set-member-role": { surface: "stewardship", gate: "contribute" },
  "get-at-risk-members": { surface: "stewardship", gate: "read" },
  "new-joiner-intro-candidates": { surface: "stewardship", gate: "read" },
  "get-intro-candidates": { surface: "stewardship", gate: "read" },
  "get-unactivated-newcomers": { surface: "stewardship", gate: "read" },
  "newcomers-awaiting-response": { surface: "stewardship", gate: "read" },
  "suggest-introduction": { surface: "stewardship", gate: "contribute" },
  "suggest-revival": { surface: "stewardship", gate: "contribute" },
  "suggest-welcome": { surface: "stewardship", gate: "contribute" },
  "suggest-greeting": { surface: "stewardship", gate: "contribute" },
  "suggest-broadcast": { surface: "stewardship", gate: "contribute" },
  "propose-ritual": { surface: "stewardship", gate: "contribute" },
  // ── Commissions & work grid ──
  "list-claimable-cells": { surface: "commissions", gate: "commission" },
  "claim-work-cell": { surface: "commissions", gate: "commission" },
  "submit-cell-result": { surface: "commissions", gate: "commission" },
  "create-commission": { surface: "commissions", gate: "commission" },
  "revoke-commission": { surface: "commissions", gate: "commission" },
  // ── Benchmark ──
  "list-benchmark-prompts": { surface: "benchmark", gate: "read" },
  "submit-benchmark-run": { surface: "benchmark", gate: "contribute" },
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

export function groupBySurface(tools: CatalogTool[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const tool of tools) {
    const meta: { surface: ToolSurface | "other"; gate: ToolGate } = TOOL_META[
      tool.name
    ] ?? {
      surface: "other" as const,
      gate: "read" as const,
    };
    const group: CatalogGroup = groups.get(meta.surface) ?? {
      surface: meta.surface,
      tools: [],
    };
    group.tools.push({ ...tool, gate: meta.gate });
    groups.set(meta.surface, group);
  }
  return SURFACE_ORDER.filter((s) => groups.has(s)).map((s) => groups.get(s)!);
}
