# French Interface Implementation Plan

> **For agentic workers:** Use subagent-driven execution for the independent
> translation catalogue tasks, then review and integrate them in this session.
> Follow the user's focused-test and no-database-write rules throughout.

**Goal:** Add French using the current catalogue structure and make `/fr`
navigation work alongside English and Dutch.

**Architecture:** Keep next-intl and the existing JSON message catalogues.
Register French, replace the binary language toggle with a native selector,
and repair locale boundaries that would reject French or drop its prefix.
Published material continues to use existing content fallback.

**Tech Stack:** Next.js 15, next-intl 4, React 19, Payload, Vitest, TypeScript.

### Task 1: Translate the catalogue

- [x] Translate the three independent catalogue partitions at
      `/tmp/aitcom-fr-source-{1,2,3}.json` into
      `/tmp/aitcom-fr-translated-{1,2,3}.json`, assigning one worker per partition.
- [x] Preserve every key, ICU variable, plural/select option, rich-text tag,
      URL, brand name, and code identifier. Use consistent French with “vous”.
- [x] Merge in the English catalogue's original key order into `messages/fr.json`.
- [x] Add `language.fr = "Français"` and a translated `language.label` to all
      three catalogues for the accessible language selector.
- [x] Extend `src/i18n/messages-parity.test.ts` to compare complete catalogue
      key sets, parse every French ICU message, and compare arguments and tags.
- [x] Generalize `scripts/check-i18n-parity.mjs` to check configured locales.

### Task 2: Locale routing and selector

- [x] Set `locales: ["en", "nl", "fr"]` in `src/i18n/routing.ts`.
- [x] Replace `src/components/language-switcher.tsx` with a labelled native
      select using `routing.locales` and native language names; preserve pathname,
      query parameters and fragment when replacing the route.
- [x] Add focused selector coverage in
      `src/components/language-switcher.test.tsx` for all options and preserving
      page context when selecting French.
- [x] Generalize locale prefix handling in `src/lib/join-path.ts` and
      `src/middleware.ts`, enforcing a complete prefix segment match.
- [x] Include French in `src/lib/site-redirects.js` retired-section patterns.
- [x] Extend `src/lib/join-path.test.ts` for French auth/join redirects and
      unrelated paths beginning with locale-like letters.

### Task 3: Metadata, content and API boundaries

- [x] Build alternate language links from `routing.locales` in
      `src/lib/metadata.ts` and `src/app/sitemap.ts`; update their unit tests.
- [x] Add French to Payload localization and its generated types/schema.
      Prepare a registered migration adding the CMS locale enum values and
      extending the magazine subscription locale check. Never apply it.
- [x] Extend route/API locale types and validation that serve the French
      interface to use `AppLocale` or `routing.locales`.
- [x] Preserve French navigation and links when editorial readers fall back
      to English content. Preserve the original content's language attribution.
- [x] Serve French emojibase assets via the existing route and update the
      picker locale and its route test.
- [x] Translate small locale-specific UI helpers and transactional interface
      copy reached by French pages, preserving the current module boundaries.

### Task 4: Verification and review

- [x] Run `node scripts/check-i18n-parity.mjs`; expect all locales to have
      identical message key structure.
- [x] Run `pnpm exec vitest run` with only explicitly named test files added
      or modified by this work. Do not execute integration or Chromium tests.
- [x] Run `pnpm typecheck`; inspect any failures and fix those caused by this
      work without expanding to unrelated refactors.
- [x] Run `git diff --check` and review the final changes for malformed
      translations, broken locale links, and accidental database operations.
- [x] Request a fresh code review with the scope, changed files, checks, and
      repository rules. Resolve material findings.
- [x] Commit the implementation locally. Never push or write to a database.

## Validation result

- All 65 tests in the 11 added/changed test files pass.
- `pnpm typecheck` and `git diff --check` pass.
- Catalogue parity: 4,932 keys per catalogue; all French ICU messages parse and retain their argument/tag/option structure.
- Fresh code review found a production locale enum naming difference; the migration now handles both existing names. No outstanding material findings.
- Migration files prepared only; no database writes, outbound emails, or push.

### PR validation follow-up

CI identified strict lint violations introduced by widened locale types and catalogue test typing. Removed redundant assertions, preserved empty-string editorial fallback explicitly, and made parser/async contracts explicit. Focused ESLint and the catalogue tests pass. Updated existing redirect and attendee CSV tests to recognize French; the CSV now has explicit French coverage and still verifies unsupported-locale fallback. Workspace type-check passes.
