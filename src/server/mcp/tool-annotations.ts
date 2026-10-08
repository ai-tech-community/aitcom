// MCP tool behaviour hints (spec: tools → ToolAnnotations).
//
// Agent hosts read these to decide when to ask the human before a call —
// OpenAI dots require them on every tool and review them for accuracy;
// Meta Muse's Read / Write / Sensitive-write classes map onto them.
// See docs/research/2026-10-08-always-on-agent-connectors.md.
//
// Every tool picks exactly one profile at its registration site, so the hint
// sits next to the handler it describes. All four hints are always explicit:
// the spec defaults destructiveHint to true and openWorldHint to true when
// unset, which would over-warn on every write. catalog.integration.test.ts
// fails if a live tool has no profile.
//
// openWorldHint is false throughout: every tool acts only inside AIT, a
// bounded workspace, never on the open internet.

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** Reads data and changes nothing. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

/**
 * Saves a draft, suggestion, or proposal that a human must approve before it
 * takes effect (ADR-0015, ADR-0017). Nothing reaches others until then.
 */
export const DRAFT_FOR_REVIEW = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

/** Takes effect at once, but only adds or records — nothing existing is lost. */
export const ADDITIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

/** Removes, revokes, or overwrites existing state, so it is hard to undo. */
export const DESTRUCTIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const satisfies ToolAnnotations;
