---
status: accepted
---

# The redesign uses three UI shells over existing routes

The redesign gives communities a consistent place to navigate spaces, keeps Hub-wide destinations accessible under the same account, and preserves the publication reading experience. Members and organizers keep their existing links and actions. [Redesign spec](../superpowers/specs/2026-11-28-open-community-platform-redesign-design.md)

## Decision

Use one deployment-wide flag, `NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES`, to select the legacy or redesigned UI. Both variants use the same URLs, providers, data paths, permissions and side effects.

- **Community shell.** Add the spaces sidebar, community switcher, header, mobile bottom bar and spaces drawer under the community theme. Reuse the existing community layout and show the existing forum in its sidebar when visible.
- **Hub shell.** Add a frame for discovery, other Hub-wide pages, account and inbox. Reuse the locale layout's site navigation and share header primitives with the Community shell. Keep the same account, locale and return paths when switching between the two.
- **Magazine shell.** Keep the existing `src/components/magazines/reading/magazine-shell.tsx` for issue and article reading. The directory and publication shelves use the Hub shell.

Extend the path-based chrome policy in `src/components/site-chrome-gate.tsx` as the single route-to-shell resolver. The locale layout provides its result to the site chrome and community layout. The resolver checks `isWorkspacePath` from `src/lib/communities/layout-variant.ts` first, then the existing magazine reading matcher and the matched community route family. Other localized pages, including the catch-all 404, use Hub. Child pages receive their shell through the layout.

Focus is a no-shell mode of the owning shell. The existing full-screen event editor, course builder and issue builder use the `workspace` layout variant and keep their page controls, access checks and shared document providers.

## Consequences

Each slice must preserve the route inventory and workflow parity. Rollback selects the existing UI on the same routes and records. Capabilities that require behavior or data changes belong in separate work.
