# French interface

Date: 2026-10-28

## Agreed outcome

Add French (`fr`) alongside English (`en`) and Dutch (`nl`). The user selected
French and approved translating the interface and navigation while keeping
existing published content in its original language.

Visitors can open `/fr` routes, choose Français from the language selector,
and use the site with French interface copy. Existing English and Dutch
behavior stays available. English remains the default locale.

## Approaches considered

1. **French interface with existing content fallback (selected).** Translate
   application-owned labels, instructions, validation messages, and relevant
   transactional copy. Keep articles, event descriptions, magazines, posts,
   profiles, and externally sourced material in their available language.
2. **Translate the interface and published content.** This adds editorial work,
   content translation storage, and ongoing maintenance. It is outside the
   approved scope.

## Locale configuration and navigation

Use the existing next-intl routing configuration as the source of supported
application locales. Add `fr`, retaining `en` as the default. Replace the
two-language toggle with an accessible selector showing English, Nederlands,
and Français in their native names. Switching language preserves the current
page and, where supported by the current navigation API, its query parameters.

Update locale parsing and route-prefix handling used by middleware, auth
aliases, join redirects, and retired section redirects. French routes must
receive the same protection as English and Dutch routes. Unknown locale input
continues to use the existing fallback or rejection behavior of its boundary.

## Translations and formatting

Create `messages/fr.json` with the English catalogue's complete key structure
(currently 4,929 string entries). Translate interface text into consistent
French, using “vous” for direct address. Preserve brand names, URLs, ICU
argument names, rich-text tags, and explicit plural branches. Use appropriate
French date, number, and plural formatting.

Audit application-owned interface copy outside the JSON catalogues. Extend
existing copy helpers or move affected text into the established translation
system as appropriate. Do not treat a French URL displaying English navigation
or controls as complete support. Source content, proper names, code examples,
and third-party material are exempt from interface translation.

Keep the site's visual design. Account for longer translated labels in the
selector and other affected controls. Use the existing Latin font setup.
Serve French emoji labels and search data through the existing local
emojibase route where the editor uses localized emoji data.

## Content and SEO

Allow French locale requests through content readers without forcing their
page links back to English. Use the existing CMS fallback for untranslated
content; do not create or translate published content. Any CMS locale
configuration change must have corresponding migration artifacts where its
database schema requires them.

Generate canonical URLs, language alternates, and sitemap alternates for all
supported locales. French pages retain `/fr` URLs even when their editorial
content falls back to an existing language. Do not advertise routes that the
application does not support.

## Emails and persisted locale boundaries

Support French in locale-aware transactional interface copy and preserve the
French locale in action links. Do not send emails during implementation or
verification. Existing content embedded in a notification retains its source
language.

The magazine subscription locale constraint currently permits only `en` and
`nl`. Prepare the schema change and a registered migration to allow `fr`.
Audit other persisted locale validation relevant to the French interface.
Never apply migrations, start schema-pushing processes, seed data, or otherwise
write to a database. Required database changes are delivered as files for the
normal deployment process.

## Verification

Add or update focused unit tests for French catalogue structure and ICU
formatting, locale selection, redirects and auth paths, SEO alternates, local
emoji data, and affected locale-specific helpers. Check that locale switching
preserves page context and remains keyboard accessible. Generalize the
catalogue parity script to validate every configured catalogue against English.

Run only test files added or touched by this change and the root workspace's
`pnpm typecheck`. Do not run the full suite, integration tests, Chromium tiers,
or a build that applies migrations. Test fixtures and mocks must prevent real
database writes and email sends.

## Completion criteria

- French is selectable and supported under `/fr` across the approved interface.
- French messages match the English key structure and format without missing
  arguments or malformed ICU messages.
- Locale-aware links, redirects, and metadata preserve French correctly.
- Existing published content remains untouched and falls back as described.
- Required schema migration files are present but unapplied.
- Focused changed-file tests and the workspace type-check pass, or any
  pre-existing blockers are reported with evidence.
- No push, database write, or outbound email occurs.
