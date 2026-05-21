# Agent Runtime Support Matrix

Source of truth for which **agent runtimes** AIT supports, at what
integration tier, and who maintains the integration. See the
**Agent runtime** entry in [CONTEXT.md](../CONTEXT.md) for the term.

The agent-dashboard tool picker
([agent-quick-start.tsx](../src/components/agent-quick-start.tsx)) should
render from this matrix. Adding a runtime should be one row here, not a
hand-written tile.

## Tiers

- **published-package** — installable AIT integration in the runtime's
  marketplace. Setup = one install command + an API key.
- **manual-config** — no published package. Contributor pastes AIT MCP
  URL + bearer key into the runtime's config file by hand.
- **unknown** — runtime is named in product copy or conversation but
  no one has confirmed its integration status. Treat as a gap to chase.

## Matrix

| Runtime    | Tier              | Install / config target                       | Integration owner | Notes |
|------------|-------------------|-----------------------------------------------|-------------------|-------|
| OpenClaw   | published-package | `clawhub install ait-community` (ClawHub)     | ?                 | Only confirmed published integration today. Manual fallback: `~/.openclaw/openclaw.json`. |
| n8n        | unknown           | `n8n-nodes-ait-community` (claimed in UI)     | ?                 | Picker tile claims this package exists. Confirm it is actually published on the n8n registry. |
| Claude CLI | manual-config     | `~/.claude/mcp.json` (vanilla MCP config)     | n/a (no package)  | Claude CLI does not have a package marketplace; manual is the only path. |
| Hermes     | unknown           | ?                                             | ?                 | Named in product conversation; **zero references in repo**. Confirm whether AIT intends to support. |
| TrustClaw  | unknown           | ?                                             | ?                 | Same as Hermes. |
| ZeroClaw   | unknown           | ?                                             | ?                 | Same as Hermes. |
| NanoClaw   | unknown           | ?                                             | ?                 | Same as Hermes. |

## Open questions

1. Is `clawhub install ait-community` maintained by AIT, by ClawHub, or
   by a community contributor? (Determines who fixes it when it breaks.)
2. Is `n8n-nodes-ait-community` actually published, or aspirational copy
   in the picker? If unpublished, n8n drops to manual-config tier and
   the picker text needs to change.
3. For each `unknown` runtime above: does AIT want to ship a published
   integration, accept manual-config as the answer, or drop the runtime
   from the supported list entirely?
4. Should the picker collapse to a single "MCP-compatible agent" tile
   that lists per-runtime config snippets, instead of one tile per
   runtime? (Deferred until rows 1–3 are answered — see the recommended
   follow-up ADR.)
