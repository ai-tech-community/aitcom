# Story-first News Implementation Plan

> Execute inline, task by task, with focused validation and a final standards/spec review.

**Goal:** Extend the existing news archive with evidence-backed editorial storylines.

**Architecture:** Shared validation governs staff writes and public eligibility. Drizzle stores storylines, article memberships, and directed connections atomically. Server pages read bounded results; a staff tRPC editor searches the existing archive.

**Tech Stack:** Next.js, React, next-intl, tRPC, Zod, Drizzle/Postgres, Vitest.

## 1. Domain and storage

- [ ] Add `src/lib/news/storylines.ts` and `storylines.test.ts`: input schemas, source evidence matching, publication validation, locale fallback, chronology.
- [ ] Add schema tables and register `20261013f_news_storylines` migration. Composite connection references enforce membership evidence; cascades remove stale connections.
- [ ] Run `pnpm exec vitest run src/lib/news/storylines.test.ts` with an unreachable database URL.

Domain checks use `storylineInputSchema.safeParse(input)` and `publicationIssues(input, articles)`. Evidence normalizes whitespace and matches `article.title` or `article.summary`, never `aiSummary`.

## 2. Server reads and editing

- [ ] Add `src/server/news/storylines.ts` for paginated indexes, details, batch memberships and atomic aggregate saves.
- [ ] Add staff procedures in `src/server/api/routers/news.ts`: list drafts, read draft, search collected articles, and save storyline.
- [ ] Add focused service and router tests with mocked storage. Every editorial procedure calls staff authorization before database access.

Writes run in `db.transaction(async tx => { ... })`, lock existing aggregates, reject slug changes and invalid article references, preserve memberships with upserts, remove obsolete memberships, and replace outgoing connections. Revalidate the shared news cache after commit.

## 3. Reader surfaces

- [ ] Add reusable storyline list/timeline components, a paginated `/news/stories` index, and `/news/stories/[slug]`.
- [ ] Extend `/news` with six recent storylines and batch membership links at article rows. Preserve `?story=<article-id>`.
- [ ] Add EN/NL interface strings, visible English editorial fallback, evidence disclosures, dated/undated groups, related-story direction, empty and unavailable states.
- [ ] Add fixture-based component/page tests for reader navigation and fallback.

Readers navigate `/news/stories/${slug}#article-${articleId}`. Only published eligible storylines and connections between eligible endpoints appear publicly.

## 4. Staff workflow

- [ ] Add `/news/stories/manage` and editor component with native labeled fields, draft selector, paginated article search, contribution/evidence fields, questions, and connections with target evidence selection.
- [ ] Save drafts or publish using the same aggregate mutation. Show publication blockers, pending/error/success states and refresh saved draft state.
- [ ] Add component tests for editing and failed publication.

The editor owns an aggregate matching `StorylineInput`, calls `api.news.saveStoryline.useMutation()`, and uses `api.news.searchStorylineArticles.useQuery({ q, page })` for bounded selection.

## 5. Verify and finish

- [ ] Format only changed code files; run added/touched unit files and `pnpm typecheck`.
- [ ] Use the T3 preview if a database-free fixture preview is feasible; do not start ingestion or apply migrations.
- [ ] Review standards and approved spec, resolve material findings, document deployment steps in `docs/news-feeds.md`, and commit locally.

No database writes, pushes, full test suites, integration tiers, or Chromium tests. Real-data deployment validation requires the migration to be applied later by its owner.
