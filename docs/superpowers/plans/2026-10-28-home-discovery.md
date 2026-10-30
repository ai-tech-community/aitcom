# Homepage Discovery Implementation Plan

**Goal:** Make the homepage a practical place to discover communities, events, news and magazines.

**Architecture:** The server page fetches eligible content and hands it to HomeSections. HomeSections owns responsive placement; individual sections own compact content presentation. Existing magazine access rules and event presentation remain authoritative.

**Tech Stack:** Next.js, React, Tailwind, next-intl, Drizzle, Payload, Vitest.

## Tasks

- [x] Extend `src/server/communities/featured.ts` with `pickHomeCommunities`: curated eligible rows first, then explicitly listed rows, excluding known test slugs, capped at six. Update `featured-queries.ts` to fetch listed communities and Hub. Cover visibility, ordering, exclusions and limit in `featured.test.ts`.
- [x] Compact `featured-communities.tsx`: responsive gallery, short ASCII strip, logo/name, clamped description and real members. Remove resting shadows and oversized artwork. Adjust its existing focused tests.
- [x] Add an embedded presentation to `latest-news.tsx`; limit the homepage rail to four items, with dates/sources and direct links. Keep standalone presentation compatible.
- [x] Add `home-magazines.tsx` using `MagazineCard.latest`, `IssueCoverArt` and existing magazine paths. Limit to four magazines and hide empty data. Add focused rendering tests for issue destinations, cap, empty state and Dutch labels.
- [x] Recompose `home-sections.tsx` into a responsive twelve-column grid. Force dynamic page rendering so visibility changes apply on the next request. DOM order is communities/events/news/magazines; desktop placement is communities (8), news (4), then events (12). Expand lone discovery section to full width. Remove repeated marketing sections from this composition and replace the closing block with a compact organizer prompt. Update `home-sections.test.tsx` for visible section sequence and empty states.
- [x] Wire `loadHomepageMagazines` into `src/app/[locale]/page.tsx`, pass its magazines into HomeSections, and reduce hero vertical spacing in `home-hero-plaza.tsx`. Add matching English/Dutch homepage labels.
- [x] Run only touched/new test files with a dummy database URL, `pnpm typecheck`, changed-file formatting and Impeccable detector. Render actual components with synthetic fixture data for desktop/mobile inspection; do not start database-backed application initialization. Review the resulting diff.

- [x] Resolve final code review: use a bounded, card-fields-only magazine shelf loader with logged optional-feed recovery; cover its access rules and failure path in `src/server/magazines/home.test.ts`, and include nonempty magazines in the homepage sequence test.
