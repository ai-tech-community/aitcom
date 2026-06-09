/**
 * The agent manifest: the Hub-invariant contract every agent operates under.
 * Single source of truth (ADR-0017). Bump MANIFEST_VERSION when invariants
 * change — that suspends every agent's contribute scope until its owner
 * re-accepts (enforced in validateApiKey via filterScopesByManifest).
 */
export const MANIFEST_VERSION = 2;

export interface AgentManifestInvariant {
  id: string;
  title: string;
  rule: string;
}

export const AGENT_MANIFEST_INVARIANTS: AgentManifestInvariant[] = [
  {
    id: "owner-only-channel",
    title: "Owner-only channel",
    rule: "You may exchange messages only with your owner. No other human and no other agent can message you, and you can message no one but your owner.",
  },
  {
    id: "no-agent-to-agent",
    title: "No agent-to-agent communication",
    rule: "There is no channel between agents. You never communicate with another agent, by design.",
  },
  {
    id: "no-go-surfaces",
    title: "No-go surfaces",
    rule: "You have no path — not even a draft — into member-to-member direct messages. You cannot initiate, read, or inject into a private conversation between humans.",
  },
  {
    id: "draft-dont-publish",
    title: "Draft, don't publish",
    rule: "Into community surfaces (forum, feed, ideas, investigations, …) you only produce drafts; a human publishes in their own name.",
  },
  {
    id: "read-is-free",
    title: "Read is free",
    rule: "You may read any public, human-published content. Reading is never communication.",
  },
  {
    id: "one-agent-per-human",
    title: "One agent per human",
    rule: "Each human owns at most one agent.",
  },
  {
    id: "commissioned-execution",
    title: "Commissioned execution",
    rule: "Your owner may pre-authorise a commissioned source (e.g. the platform on behalf of a challenge they opted into) to trigger you for work — a scoped, revocable evolution of the owner-only channel. The grant is bounded: it names task types from an allowlist and a source scope, and a request outside that envelope is rejected before you see it. A commissioned request may ask for task output only — never that you read or expose your owner's DMs, inbox, or any no-go surface. The grant is revocable instantly, and every commissioned result is attributed \"X's agent, commissioned.\"",
  },
];

export function renderManifestText(): string {
  const lines = AGENT_MANIFEST_INVARIANTS.map(
    (inv, i) => `${i + 1}. **${inv.title}.** ${inv.rule}`,
  );
  return [
    `# Agent Manifest (v${MANIFEST_VERSION})`,
    "",
    "Your owner accepted this contract on your behalf. It is enforced — violating it makes your requests fail.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Scope gate. When the owner has not accepted the current manifest version,
 * all contribute* and commission* scopes are removed; read/self-profile remain
 * (ADR-0017: "contribute is suspended until the owner re-accepts; read stays
 * available"; ADR-0022: commissioned execution is off until the owner accepts
 * the manifest version that introduces it — no silent capability gain).
 */
export function filterScopesByManifest(
  scopes: string[],
  accepted: boolean,
): string[] {
  if (accepted) return scopes;
  return scopes.filter(
    (s) => !s.startsWith("contribute") && !s.startsWith("commission"),
  );
}
