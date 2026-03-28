# Lexical Editor Notion UX Design

**Date:** 2026-02-25  
**Status:** Approved  
**Owner:** Product + Engineering

---

## Goal

Upgrade the member article editor to a Notion-style writing experience that improves:

- Writing speed
- Content quality
- Submission confidence

while preserving the existing create/update/submit pipeline and Payload Lexical compatibility.

## Scope

### In scope (v1)

- Notion-like slash command menu (`/`) with keyboard-first interaction
- Improved block insertion and paragraph-to-block transforms
- Balanced technical block pack:
  - Interactive: Tabs/Snippets, Code Block
  - Styled static blocks: Admonition, Mermaid source block
- Sticky status strip (save state, word count, reading time)
- Collapsible right utility panel (outline + quality checks + publish checklist)
- Autosave + clear save/submit states
- Validation and checklist-driven submit gating

### Out of scope (v1)

- Full Notion drag handles and deep block rearrangement UX parity
- In-editor live Mermaid rendering
- Full interactive custom block renderer for every advanced block type

## User Experience Direction

### Information architecture

1. Sticky top strip
- Draft status (`Unsaved`, `Saving...`, `Saved at HH:mm`)
- Word count and reading time
- Primary actions visible

2. Main writing canvas
- Distraction-free editor area
- Slash-first authoring
- Compact fallback toolbar retained

3. Right utility panel (collapsible)
- Document outline from H2/H3
- Quality checks with jump-to-issue links
- Publish checklist summary

4. Bottom actions
- `Save Draft` as explicit fallback
- `Submit for Review` or `Publish` based on author trust level

### Interaction model

- Slash command menu opens on `/`:
  - grouped categories: `Basic`, `Technical`, `Media`, `Structure`
  - fuzzy search support (`/warn`, `/tab`, `/mermaid`)
  - keyboard navigation: arrows, enter, escape
- Inserting blocks creates sensible editable scaffolds
- Paragraph-to-block quick transforms via slash commands
- Text selection shows inline mini-toolbar (bold/italic/code/link)
- Keyboard shortcuts retained and surfaced via help hint

## Block Model (Balanced Technical Pack)

### Interactive blocks

1. Tabs/Snippets
- Repeating tab entries (title + language + code body)
- Copy affordance in rendered output

2. Code Block
- Language selector
- Optional filename field
- Optional line number toggle

### Styled static blocks (editable content, static editor rendering)

1. Admonition
- Variant: `info | warning | success | note`
- Title + body

2. Mermaid
- Source text block only in editor
- Styled placeholder indicating render-on-article-page

### Core supporting blocks

- Paragraph
- H2/H3
- Bullet list / numbered list
- Quote
- Divider
- Checklist
- Image + caption
- Simple table
- Bookmark/link card

## Quality Guardrails

### Blocking rules (must pass)

- Title must be non-empty
- Body must be non-empty
- At least one H2 heading required
- Intro paragraph required before first heading

### Warning rules (can continue with explicit confirmation)

- `tutorial` type without any code block
- Mermaid block present but likely invalid/empty source
- Overly short article body (threshold configurable)

## Reliability and Submission Confidence

### Autosave strategy

- Debounced autosave (~1200ms) for content + metadata
- Save state shown in sticky top strip
- Explicit `Save Draft` remains available

### Recovery

- Local snapshot persistence for crash/network interruption scenarios
- Restore prompt on reopen if unsynced local draft exists

### Submission flow

- Pre-submit checklist runs before mutation
- Blocking errors prevent submit
- Warning-only issues require confirmation
- Existing trusted-author publish behavior remains unchanged

## Technical Approach

### Preferred approach

Use incremental Lexical extension over current `ArticleEditor` implementation:

- Add slash command and block insert plugins
- Add stateful save-status and autosave orchestration
- Add validation/checklist model and right-panel presentation
- Keep existing tRPC mutations (`create`, `update`, `submit`) and trusted-author flow

### Why this approach

- Lowest delivery risk
- Fastest path to clear UX gains
- Preserves current architecture and backend contracts
- Leaves room for later phase toward deeper Notion parity

## Data Flow

1. User edits title/metadata/content
2. Local editor state updates
3. Debounced autosave persists draft to backend
4. Status UI updates (`Unsaved` -> `Saving...` -> `Saved`)
5. On submit/publish:
- run checklist and validation
- block or warn as configured
- call existing submit endpoint
- route user to my-articles after success

## Testing Strategy

### Unit tests

- Slash parser/filter behavior
- Block insertion transforms
- Validation rule engine
- Reading-time and word-count helpers

### Component tests

- Autosave state transitions
- Right panel quality check rendering
- Submit gating and confirmation flows

### End-to-end tests

- Create article with slash blocks
- Autosave and recovery behavior
- Submit for review path (non-trusted)
- Publish path (trusted author)

## Rollout Plan

### Phase 1 (v1)

- Slash menu + balanced technical block pack
- Autosave and status strip
- Quality checks + submit gating

### Phase 2 (post-feedback)

- Deeper block controls and transforms
- Improved table/bookmark authoring UX
- Potential live Mermaid preview if proven valuable

## Success Metrics

- Reduced time-to-first-draft save
- Higher article completion rate
- Lower submission errors due to missing structure
- Increased usage of technical blocks in tutorials

## Risks and Mitigations

1. Lexical plugin complexity
- Mitigation: incremental plugins, isolated tests, feature flags if needed

2. Validation friction
- Mitigation: separate blocking errors from warnings and allow override for warnings

3. Autosave race conditions
- Mitigation: single-flight saves, clear optimistic status model, latest-write wins
