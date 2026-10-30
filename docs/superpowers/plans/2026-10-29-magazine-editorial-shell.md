# Magazine Editorial Shell Implementation Plan

**Goal:** Build the approved magazine reading shell and persist an editor-selected display font.

**Architecture:** Keep the existing reading/access models and item registry. A shared magazine shell supplies publication navigation and scoped editorial styling. A bounded font catalog connects collection, API, settings preview and public read model.

**Tech Stack:** Next.js, React, next-intl, Payload, PostgreSQL migration definitions, Vitest.

Execution stays in this session. User authorization covers implementation. Run only focused unit files and the workspace type-check; do not execute migrations or push.

## 1. Display typography

- [x] Create `src/lib/magazines/typography.ts` with four stable font IDs and safe font stacks: `italiana`, `bodoni`, `cormorant`, `geist`. Resolve missing/unknown values to `italiana`.
- [x] Load the font variables in a server-only `MagazineFonts` wrapper, used by the issue route layout and magazine settings page.
- [x] Add the Payload `font` select, matching enum/column migration, migration registry entry and regenerate Payload types using generation-only commands with push disabled and an unreachable database URL.
- [x] Pass the optional validated font through `saveSettings`, `saveMagazineSettings` and `toMagazineSummary`.
- [x] Add the labeled selector and live preview to magazine settings, sending the selected ID on save. Translate in `messages/en.json`, `messages/nl.json`, `messages/fr.json`.

## 2. Publication shell

- [x] Add `isMagazineReadingPath` to recognize only issue/article routes; add a site chrome gate around the global navbar, footer and session overlays.
- [x] Add `MagazineShell` with community return link, magazine shelf link and issue contents link. Apply the resolved display font through a scoped CSS custom property.
- [x] Replace the issue's three columns with masthead, cover, existing item layout and publication footer. Keep join prompts, notes, contents anchors and editor actions.
- [x] Recompose article pages with a centered display headline, wide media and narrow reading body, retaining tracking, comments, sharing and access behavior.
- [x] Keep shared item renderers and editor previews compatible; scope the new editorial styles to the publication shell.

## 3. Verification and documentation

- [x] Add route/font resolution tests, font persistence tests without a real database, and settings preview/save tests.
- [x] Update touched issue/article tests for the approved layout while retaining access, focus, tracking and sharing assertions.
- [x] Run only the added/touched Vitest files and `pnpm typecheck`.
- [x] Record the approved typography exception and shell in `DESIGN.md`. Desktop/mobile browser inspection was unavailable because the browser host could not be reached.
- [x] Review the final diff, commit the implementation with no AI credit, and never push.

The unused `src/payload-generated-schema.ts` predates magazine support. Leave it unchanged, following the existing hosted-materials plan, to avoid unrelated schema churn. Payload derives its runtime schema from collection config.

## Completed verification

- 95 focused unit tests passed across the nine added or touched test files. The reader-model unit test now mocks the global database module, keeping every test on in-memory fixtures.
- `pnpm typecheck` passed.
- Standards review found no violations; spec review caught the builder-preview mismatch, which was fixed and re-reviewed without remaining material findings.
- The design detector reported eight distinct type-size/scrim values outside the global app tokens. These are documented, value-specific exceptions restricted to the publication CSS. No rule-wide or file-wide suppression was added.
- Browser visual verification could not run because the browser access host was unavailable. No visual pass is claimed.
- Migration `20261029a_magazine_font` is prepared and registered, but was not applied. No database writes, integration tiers, full test lanes or pushes were performed.

## PR validation follow-up

CI's full suite exposed two route test imports that lacked mocks for Next's compile-time font loaders. The settings page test now checks that the generated font classes wrap the form; the builder page test renders its tree rather than assuming the builder is a direct child of the hydration provider. Both route files now mock only the font loader boundary. Their 12 focused tests pass, in addition to the 95 component/service tests above. The initial CI build, lint/type-check, formatting and Vercel preview all passed; the two route test imports were the only failing suites.
