# Story page polish implementation plan

**Goal:** Preserve the editorial style while grouping story credits and making voting a compact part of the story metadata.

**Approved design:** Use the screenshot's branch as the base. Add a horizontal, bordered vote layout for the reader; retain vertical voting in story cards. Group the contributor and research attribution, retain editorial context, and reduce the gap before the timeline. Metadata must wrap naturally on mobile and in Dutch.

**Files:** `src/components/news/storyline-reader.tsx`, `src/components/news/storyline-vote.tsx`, and their existing unit tests.

- [x] Add an optional horizontal layout to voting, preserving authentication, optimistic updates, error rollback, and selected states.
- [x] Group credits and put horizontal voting, article count, reporting date, and latest-development link in one wrapping metadata row.
- [x] Verify the touched unit tests, workspace typecheck, focused lint, and the mechanical UI detector.
- [x] Inspect desktop and mobile renders using synthetic reporting without database access.

**Validation:** Eight focused unit tests pass. Workspace `pnpm typecheck`, focused ESLint, and the UI detector pass. Inspected the real reader and voting markup with synthetic reporting at desktop and 390px Dutch mobile widths; no horizontal overflow. The visual preview stubs authentication and mutations; real vote behavior is covered by the unit tests. No database access was needed.
