# Community news sources implementation plan

**Goal** — Let community admins choose publishers in Settings and contribute new feeds to a shared database catalog.

**Architecture** — Keep one feed per feed URL and one article per canonical article URL. Store community subscriptions and feed-to-article associations separately. Use those associations to read community news while the existing sector query serves communities with no subscriptions.

**Stack** — Next.js App Router, tRPC, next-intl, Drizzle, PostgreSQL, Payload migrations and Vitest.

## 1. Store source selections and article origins

- [ ] Extend `src/server/db/schema.ts` and register a new migration `src/migrations/20261127a_community_news_sources.ts` in `src/migrations/index.ts`. Add `community_news_feed(community_id, feed_id)` and `news_feed_item(feed_id, item_id)` under the app schema. Use the referenced tables’ ID types, cascading foreign keys and a composite primary key on each pair. Index item_id for article deletion. The down migration drops the two association tables.
- [ ] Update `src/server/news/catalog.ts`. Seed missing built-in URLs idempotently and select enabled rows from the database. Propagate database read failures so a failed cron reports an error. Preserve staff-disabled feeds and existing feed IDs.
- [ ] Extend `src/server/news/catalog.test.ts` with an enabled custom feed, a disabled built-in, a seed conflict and a failed catalog read. Use mocked storage.

## 2. Preserve every feed that published an article

- [ ] In `src/server/news/ingest-feeds.ts`, collect each feed’s canonical article URLs before the cross-feed deduplication step. Use the same URL normalization as `src/server/news/draft.ts`. Continue sending one article per URL to the existing recorder.
- [ ] In `src/server/news/record.ts`, insert all encountered associations by joining the supplied feed and article URLs to stored rows. Include previously ingested articles. Use conflict-ignore on the pair so retries preserve a single association. Execute the association write even when the article insert count is zero.
- [ ] Extend `src/server/news/ingest-feeds.test.ts` with two feeds returning the same story and a second run returning zero new articles. Expect one article record per batch, both associations on both passes, and one fetch per enabled feed.

## 3. Discover and select publishers

- [ ] Create `src/server/news/discover-feed.ts`. For a public HTTPS URL, use the existing safe-fetch transport with bounded reads, including every redirect and discovered feed request. Try the existing RSS/Atom parser. For HTML, resolve advertised RSS/Atom alternate links against the final page URL and return candidate choices. Validate a chosen feed and return its canonical URL, display name and first usable headline.
- [ ] Add fixture tests in `src/server/news/discover-feed.test.ts` covering direct Atom, relative RSS links, multiple choices, unreadable or empty feeds, and rejected destinations. Stub HTTP.
- [ ] Add a community-admin procedure to `src/server/api/routers/news.ts` using the community settings authorization pattern. Resolve the community slug and authorize the active owner/admin before listing sources, previewing a URL or changing a selection. Test access across two communities and rejected member requests.
- [ ] Create `src/server/news/community-sources.ts` to list selected sources and search enabled sources by name or URL. Selecting by ID checks that the feed is enabled. Confirming a new URL revalidates it server-side, inserts the feed on URL conflict-do-nothing, reads the resulting enabled feed ID, and inserts the community subscription in the same transaction. Reusing an existing feed preserves its metadata. Removing deletes only the requesting community’s subscription.
- [ ] Exercise duplicate selection, two communities sharing one feed, disabled feed rejection, failed discovery and rollback in focused mocked tests.

## 4. Expose the approved settings flow

- [ ] Add `src/app/[locale]/communities/[slug]/settings/news/page.tsx` and `src/components/communities/settings/news-sources-settings.tsx`. Show selected sources with individual removal controls, search the shared catalog, and offer a website/feed URL field. Render multiple discovery choices when present, then preview the publisher and headline before confirmation.
- [ ] Handle pending, success, and failure states. If discovery yields no feed, prompt for a direct feed URL. Invalidate the settings query and the community stories query after a successful change.
- [ ] Add the News sources entry to desktop and mobile navigation in `src/components/communities/settings/settings-sidebar.tsx`. Supply English and Dutch strings in `messages/en.json` and `messages/nl.json`.
- [ ] Add a settings component test exercising existing-source selection, website preview and confirmation, discovery failure and removal. Confirm each mutation carries the current community slug.

## 5. Read the correct community feed

- [ ] Update `src/server/news/sectors.ts` so an empty selection delegates to the existing sector query. For configured communities return the five newest distinct articles whose feed memberships intersect enabled selected feeds. Use an EXISTS predicate to avoid duplicates. Preserve publication-date ordering and indicate selected-source mode even when the first collection is pending.
- [ ] Apply the existing community content visibility resolver to the slug-based public procedure in `src/server/api/routers/news.ts` before exposing source-filtered results. Use the same response for unknown and unreadable communities.
- [ ] Update `src/components/communities/feed/community-sector-news.tsx` to render the pending-collection message for a configured community. Show the existing sector archive link only in sector mode.
- [ ] Extend `src/server/news/sectors.test.ts` for selected sources across sectors, distinct results, configured-but-empty reads and fallback after the last removal. Update `docs/news-feeds.md` with the settings path, catalog behavior and daily collection schedule.

## Verification

Run each added or edited unit test file by exact path with `pnpm exec vitest run <path>`, then run `pnpm run typecheck` at the repository root. Use fixtures and mocks for storage and network. Review the migration source without applying it. Deployment must apply the migration before the new reader, settings mutations and ingestion job go live.
