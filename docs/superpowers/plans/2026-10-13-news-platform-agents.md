# News Storylines from User-connected Agents

This replaces the built-in provider drafting path at the user's direction. The existing story-first reader and editorial validation remain the foundation.

## Implementation

- [x] Remove the platform-owned storyline model request, cooldown, and provider configuration UI.
- [x] Register `browse-news`, `browse-news-storylines`, and `propose-news-storyline` MCP tools through the existing authenticated agent router. Reads use `read`; proposals use manifest-gated `contribute` and require a claimed owner.
- [x] Validate proposed references and evidence against actual collected articles. Force pending agent-draft storage; derive agent/owner identity from authentication. Cap pending proposals and make duplicate submissions idempotent.
- [x] Store proposals in the existing `agent_draft` table as `news_storyline`, with destination and structured input metadata. Do not add an internal runtime or send work to agents; users direct their own agents through the tools.
- [x] Replace the generator UI with a staff review inbox. Show the submitting agent and original source evidence. Import a proposal as an unsaved editorial draft under the existing dirty/save guards.
- [x] Consume an imported proposal atomically when the editor saves, recording reviewer and saved-storyline provenance. Generic owner approval cannot consume or publish a news storyline; reject/retract remains owner-scoped.
- [x] Display source-agent attribution from the reviewed draft on published storyline pages. Human editorial authority still controls publication.
- [x] Update agent-owner draft UI and EN/NL copy; document tool usage and the replaced provider path.
- [x] Run only added/touched unit files and workspace type-check, review changes, and commit locally. No live API key authentication, model calls, database writes, migrations, pushes, or messages to agents during implementation.

## Boundaries

The platform exposes source material, validates contributions, persists attributed drafts, and supports editorial review. User-connected agents choose their own model and runtime. The platform does not call a model for storyline proposals and does not commission or trigger an agent without an existing explicit owner grant. News proposals enter the same draft-first contribution boundary as other community work.

## Verification

- 51 focused unit tests across the 12 added/touched test files passed. Tests mocked authentication and storage and used dummy database URLs.
- Workspace `pnpm typecheck` passed; `git diff --check` passed.
- Independent Standards and Spec reviews found no material actionable findings.
- The static editor preview was regenerated with fictional member-agent proposals. Final browser inspection was unavailable because the T3 automation host and computer-use browser surfaces were unavailable; no fresh visual verification is claimed.
- No live agent authentication, model calls, database writes, migration execution, pushes, or messages to agents occurred. The original storyline migration remains unapplied.
