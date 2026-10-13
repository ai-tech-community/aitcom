# AI-assisted Storyline Drafts Implementation Plan

**Goal:** Implement the next approved follow-on from the story-first design: evidence-backed AI draft grouping, with editorial review before persistence or publication.

**Architecture:** A staff-only mutation reads a bounded set of collected articles and existing storylines, asks the existing Anthropic provider for structured proposals, and validates every reference and evidence excerpt. It returns unsaved drafts for the existing editor. Saving and publishing continue through the reviewed storyline service. Generation itself performs no database writes.

## Scope

- [x] Add a pure proposal parser/validator in `src/lib/news/storyline-suggestions.ts` and focused tests. Validate article IDs, distinct membership, source evidence, copy limits, and duplicate/existing article sets. Force draft status, revision zero, and no supplied ID. Never accept model-provided publication state.
- [x] Add `src/server/news/storyline-suggestions.ts`: load at most 40 recent articles from the past 90 days, excluding articles already in storylines; preserve actual dates and source excerpts. Request at most three storylines with at least two articles each. Avoid speculative causal or contradictory relationships. No automatic connection edges in this grouping slice.
- [x] Use bounded request/output sizes, an explicit timeout, staff authorization, and a process-local per-editor cooldown. Do not retry model calls automatically. Keep model calls off public readers and feed ingestion.
- [x] Add an editorial suggestion procedure to the existing news router. Report missing model configuration, no suitable articles, provider failures, invalid proposals, and throttling clearly.
- [x] Add a suggestion panel in the existing editor. Show proposed title/overview/article count; “Review draft” loads a proposal into the editable form with source excerpts. Existing dirty/pending guards apply. Saving remains explicit; suggestions are labeled AI drafts.
- [x] Add EN/NL interface copy and tests covering staff access, validation, provider failure/timeout, forced draft status, and suggestion-to-editor behavior.
- [x] Run only added/touched unit files and workspace type-check. Review standards/spec and commit locally. No live model requests, database writes, migration application, or push.

## Data and editorial behavior

Send only public collected headlines, URLs, dates, and bounded source excerpts to the existing configured provider. Do not include rumors, member profiles, or unpublished editorial copy. The model must return exact copied excerpts of 12–240 characters for evidence. A model response is untrusted input: schema validation and reference/evidence checks precede display. Sparse feeds may yield no useful proposal, which is an honest empty state.

Draft proposals are not persisted until an editor chooses to save. Existing drafts and published stories are not overwritten by generation. Duplicate prevention uses existing membership exclusion plus distinct article-set checks within the response; editors still control final meaning and publication. English editorial text is generated first; optional Dutch fields remain editable and use the established visible fallback.


## Verification

25 focused unit tests passed across the five added/touched test files, and `pnpm typecheck` passed. Standards and spec reviews reported no material findings. The actual editor component was inspected with a clearly labeled static fixture preview at desktop and 390px mobile widths; the mobile page had no horizontal overflow. No live provider request, database write, migration application, or push was performed.
