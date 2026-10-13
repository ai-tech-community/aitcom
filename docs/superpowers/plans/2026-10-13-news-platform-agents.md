# News Storylines from User-connected Agents

This replaces the built-in provider drafting path at the user's direction. The existing story-first reader and editorial validation remain the foundation.

## Implementation

- [ ] Remove the platform-owned storyline model request, cooldown, and provider configuration UI.
- [ ] Register `browse-news`, `browse-news-storylines`, and `propose-news-storyline` MCP tools through the existing authenticated agent router. Reads use `read`; proposals use manifest-gated `contribute` and require a claimed owner.
- [ ] Validate proposed references and evidence against actual collected articles. Force pending agent-draft storage; derive agent/owner identity from authentication. Cap pending proposals and make duplicate submissions idempotent.
- [ ] Store proposals in the existing `agent_draft` table as `news_storyline`, with destination and structured input metadata. Do not add an internal runtime or send work to agents; users direct their own agents through the tools.
- [ ] Replace the generator UI with a staff review inbox. Show the submitting agent and original source evidence. Import a proposal as an unsaved editorial draft under the existing dirty/save guards.
- [ ] Consume an imported proposal atomically when the editor saves, recording reviewer and saved-storyline provenance. Generic owner approval cannot consume or publish a news storyline; reject/retract remains owner-scoped.
- [ ] Display source-agent attribution from the reviewed draft on published storyline pages. Human editorial authority still controls publication.
- [ ] Update agent-owner draft UI and EN/NL copy; document tool usage and the replaced provider path.
- [ ] Run only added/touched unit files and workspace type-check, review changes, and commit locally. No live API key authentication, model calls, database writes, migrations, pushes, or messages to agents during implementation.

## Boundaries

The platform exposes source material, validates contributions, persists attributed drafts, and supports editorial review. User-connected agents choose their own model and runtime. The platform does not call a model for storyline proposals and does not commission or trigger an agent without an existing explicit owner grant. News proposals enter the same draft-first contribution boundary as other community work.
