# Community Gallery — Slice 2 (Feed post and event page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each finished upload batch is announced by one feed post rendered as a collage, event pages show a "Photos and videos" section, and the old admin-only `Events.gallery` field is removed.

**Architecture:** A unique `galleryBatch` relationship on `feed-posts` makes the gallery a feed media kind. The post is created by an announcement function plugged into slice 1's single `closeBatch` seam (used by `finishBatch` and the daily cleanup). Reading reuses the gallery's own read rule per community viewer, so a collage never shows an item the viewer may not see. The event page loads a small server-side model and renders a client section that reuses the gallery tile and lightbox.

**Tech Stack:** Next.js App Router, Payload CMS 3, tRPC, Drizzle, next-intl (en/nl/fr), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-community-gallery-design.md` — sections "Feed post (collage)" and "Events" (both updated 13 Nov for this slice). Slice 1 plan: `docs/superpowers/plans/2026-11-13-community-gallery-core.md`.

## Global Constraints

- Branch `feat/community-gallery-feed-and-events` (stacked on `feat/community-gallery`, PR #569). Never `git checkout`/`switch`/`stash`/`add -A`/`add .`. Check `git branch --show-current` before every commit.
- Never run `pnpm dev`, `pnpm build`, `db:apply*`, `payload migrate`, or anything reading `.env` (production). DB tests are gated on `RUN_DB_TESTS=1`; the controller runs them against the local `aitcom_test`.
- One migration for this slice: `20261113b_gallery_feed_posts`, registered in `src/migrations/index.ts`. Regenerate `src/payload-types.ts` (and `src/payload-generated-schema.ts` if the repo regenerates it — check how it was updated before) with `SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false`.
- Gallery feed posts are always `visibility: "community"`. Their media is fixed; their text may be empty.
- `galleryBatch` is unique. A feed post never carries `galleryBatch` together with images, `image`, `imageUrl`, a GIF, a video or a poll.
- Every new surface is behind `galleryEnabled()` (`src/server/gallery/flag.ts`); feed posts with a `galleryBatch` can only exist once uploads happen, which already needs the flag.
- All copy in en/nl/fr. DESIGN.md binds the UI (One Voice Rule, House Kicker, WCAG 2.2 AA). Never render raw error messages.
- No AI credit lines in commits.

## Review Focus

1. **A collage leaks an item** — an outsider, a non-member, or a member viewing someone else's hidden item sees it in a feed card or on an event page. Tests in Tasks 4 and 6.
2. **A caption-less gallery post breaks other feed writes** — pin, report-hide, restore, topic release and edit on a post whose only content is its gallery batch must all still save. Tests in Tasks 1 and 3.
3. **Two posts for one batch** — `finishBatch` from the browser and the cron closing the same batch, or a retried announcement, yield exactly one post. Tests in Task 2 (DB).
4. **Announcing for someone who may no longer post** — uploader left, was demoted under `admins_only`, or lost paid access between upload and close: no post, batch still finished. Test in Task 2.
5. **Removing the event field on a database where it is not empty** — the migration refuses with a clear error instead of dropping rows. Test in Task 1 (DB).

---

### Task 1: Schema — feed post gallery reference, drop `Events.gallery`

**Files:**
- Modify: `src/collections/FeedPosts.ts` (add `galleryBatch`), `src/lib/feed-post-rules.ts` (+ test), `src/collections/Events.ts` (remove `gallery`)
- Modify: `src/app/[locale]/events/[slug]/page.tsx` (remove the two old gallery render blocks and their data at ~L260-264, ~L557-580, ~L907-930) and `messages/{en,nl,fr}.json` (remove `events.sectionGallery` if unused afterwards)
- Create: `src/migrations/20261113b_gallery_feed_posts.ts`; Modify: `src/migrations/index.ts`
- Regenerate: `src/payload-types.ts` (+ generated schema file if applicable)
- Test: `src/collections/feed-posts-gallery-schema.test.ts`, `src/migrations/20261113b_gallery_feed_posts.integration.test.ts` (gated)

**Interfaces:**
- Produces: `FeedPosts.galleryBatch` — `{ name: "galleryBatch", type: "relationship", relationTo: "gallery-batches", unique: true, index: true, admin: { readOnly: true, description: "The upload batch this post announces. Its pictures and videos live in the community gallery." } }`.
- Produces: `PostMediaShape.galleryBatch?: number | { id: number } | null`; `carriesMedia` returns true when it is set.

Migration `up`:
- Add `feed_posts.gallery_batch_id integer` with FK `→ gallery_batches(id) ON DELETE SET NULL`, a unique index, following Payload's naming (copy from a relationship column in `20261113a_community_gallery.ts`).
- Guard, then drop the event field: raise an exception (`RAISE EXCEPTION 'events gallery not empty: …'` via a `DO $$` block) if `events_rels` has any row with `path = 'gallery'` or non-null `media_id`, or `_events_v_rels` has any row with `path = 'version.gallery'` or non-null `media_id`. Then drop FK, index and `media_id` on both rels tables (exact names from `src/payload-generated-schema.ts`: `events_rels_media_fk`, `events_rels_media_id_idx`, and the `_events_v_rels` equivalents). Use `IF EXISTS`.
- `down` re-adds the two `media_id` columns + index + FK and drops `feed_posts.gallery_batch_id`.

- [ ] **Step 1: Failing tests:** `carriesMedia({ galleryBatch: 7 }) === true`, `carriesMedia({ galleryBatch: null }) === false`; schema test: `galleryBatch` is a unique relationship to `gallery-batches`; Events no longer has a `gallery` field; FeedPosts `validateContent` accepts empty content when `galleryBatch` is set (call the field's `validate` with sibling data).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement the collection/rule changes, migration, page clean-up; regenerate types.
- [ ] **Step 4:** Gated integration test for the migration guard: insert an `events_rels` row with `path='gallery'` in a transaction, run `up` → it throws with the message; roll back. (Write it; the controller runs it.)
- [ ] **Step 5:** `pnpm vitest run src/lib/feed-post-rules.test.ts src/collections src/app/[locale]/events` + `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** `feat(gallery): let feed posts reference a gallery batch and drop the old event gallery`.

### Task 2: Announce a finished batch in the feed

**Files:**
- Create: `src/server/gallery/announce.ts` (+ `announce.test.ts`, `announce.integration.test.ts`)
- Modify: `src/server/api/routers/gallery.ts` (`finishBatch` passes the announcer), `src/server/gallery/cleanup.ts` (+ test) and `src/app/api/cron/video-uploads-cleanup/route.ts` (+ test) so the cleanup passes it too (cleanup deps gain `db`)

**Interfaces:**
- Consumes: `closeBatch`/`finishBatch` + `AnnounceBatch = (batch: GalleryBatch, readyItems: GalleryItem[]) => Promise<number | null>` (`src/server/gallery/uploads.ts`); `activeCommunityRole` (`src/server/communities/content-visibility-queries.ts`); `canPostToFeed` (`src/server/communities/feed-posts.ts`); `resolvePostTopic` (`post-topics.ts`); the mention resolver `createPost` uses (find it in `src/server/api/routers/feed.ts`); `awardXp(... FEED_POST_CREATE)` and `logActivity("feed.post_created", …)` as `createPost` calls them.
- Produces: `galleryAnnouncer(deps: { payload; db; log? }): AnnounceBatch` — a factory, so the router and the cleanup build the same announcer.

Rules (unit tests with fakes for each):
- Returns `null` and creates nothing when the uploader has no active role in the community (left, banned, unpaid) or `canPostToFeed(community.feedPostPolicy, role)` is false.
- Otherwise creates one feed post: `communityId`, `authorId = batch.uploaderId`, `authorName` from the user row (same source `createPost` uses), `content = batch.caption ?? ""`, `topicSlug` = the batch's topic if it still exists (`resolvePostTopic`), else `general`; `visibility: "community"`; `galleryBatch: batch.id`; `mentions` resolved from the caption the same way `createPost` does.
- Awards `FEED_POST_CREATE` XP and logs `feed.post_created` with `{ postId, kind: "gallery" }`, like `createPost`. Failures of XP/log are logged and don't fail the announcement (match `createPost`'s behaviour exactly).
- Returns the post id.
- A unique-violation on `gallery_batch_id` (another call already announced) returns the existing post's id instead of throwing.

- [ ] **Step 1:** Failing unit tests for the rules above (incl. Review Focus 4 cases).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `announce.ts`; wire the router and the cleanup (cron passes `db`).
- [ ] **Step 4:** Gated integration test: a member's batch with one ready item, `finishBatch` and `cleanupAbandonedGalleryUploads`-path close racing (`Promise.all`) → exactly one feed post with `gallery_batch_id` = batch id; the batch's `feedPostId` equals it (Review Focus 3).
- [ ] **Step 5:** `pnpm vitest run src/server/gallery src/server/api/routers/gallery.test.ts src/app/api/cron` → PASS.
- [ ] **Step 6: Commit** `feat(gallery): announce finished batches in the community feed`.

### Task 3: Gallery posts in the existing feed write paths

**Files:**
- Modify: `src/server/communities/post-media.ts`, `src/server/api/routers/feed.ts` (`editPost`, `replacePostVideo`, `deletePost`), `src/server/communities/post-reports.ts` (`reviewReport` remove), `src/server/gallery/items.ts` (`deleteItem`)
- Create: `src/server/gallery/feed-post-link.ts` (+ test) — the gallery ↔ feed-post lifecycle helpers
- Modify: `src/components/communities/feed/post-edit-form.tsx` (+ test)
- Tests: extend the existing tests of each modified server file

**Interfaces:**
- Produces (`feed-post-link.ts`):
  - `removeBatchItems(deps: { payload; storage: ObjectStorageSource; log? }, batchId: number): Promise<void>` — deletes every item of the batch and its files (through `removeItemFiles`), used by report removal.
  - `releaseEmptyGalleryPost(deps: { payload; log? }, batchId: number): Promise<void>` — if the batch has no ready items left and its post has no text, soft-delete the post (same soft-delete shape as `deletePost`).

Rules:
- `editPost`: a post with `galleryBatch` refuses any media change (`BAD_REQUEST`, existing error style) and accepts empty content (`requireWordsUnless` must treat the gallery as words-optional). `replacePostVideo` refuses gallery posts.
- `setPostMedia`'s cleared shape never carries `galleryBatch` into a non-gallery post (assert it can't be set through it).
- `deletePost` on a gallery post soft-deletes as today and clears `galleryBatch`; items stay.
- `reviewReport` `remove` on a gallery post soft-deletes the post, clears `galleryBatch`, and calls `removeBatchItems` with the object storage (the router passes `getObjectStorage` alongside `getVideoStorage`). `restore` leaves items alone.
- `deleteItem` calls `releaseEmptyGalleryPost` after a successful delete.
- Review Focus 2: pin, report-hide, restore and `releaseDeletedTopic` on a caption-less gallery post all succeed (tests on each path with a gallery post fixture).
- `PostEditForm` hides the media picker for a gallery post and lets the text be emptied.

- [ ] **Step 1:** Failing tests for every rule above. **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm vitest run src/server/communities src/server/api/routers src/server/gallery src/components/communities/feed` → PASS (plus gated DB tests written for report removal and `deleteItem` → post release).
- [ ] **Step 5: Commit** `feat(gallery): keep gallery posts consistent through edits, deletes and reports`.

### Task 4: Read model — gallery items on feed posts

**Files:**
- Modify: `src/server/gallery/items.ts` (+ tests): `listItems` gains `batchId?: number`; add `countItems`
- Create: `src/server/gallery/feed-view.ts` (+ test, + gated integration test)
- Modify: `src/server/communities/feed-posts.ts` (`decorateFeedPosts` + `FeedPostView`), its callers if their signature must change, `src/server/api/routers/gallery.ts` (`list` accepts `batchId`)

**Interfaces:**
- Produces: `countItems(deps, { viewer, eventId?, batchId? }): Promise<number>` (same read rule as `listItems`).
- Produces: `type FeedGalleryView = { batchId: number; items: GalleryItemView[] /* first 3 readable, newest-first order of the batch */; total: number /* readable count */; event: { id; title; slug } | null; topicSlug: string | null }`.
- Produces: `galleryViewsForPosts(deps: GalleryDeps, posts: { id; communityId; galleryBatch }[], userId: string | null): Promise<Map<number /* postId */, FeedGalleryView | null>>` — builds one `GalleryViewer` per distinct community (`loadGalleryViewerById`), at most one items query and one count query per community (no per-post queries). `null` when the viewer may read none of the batch.
- `FeedPostView` gains `gallery: FeedGalleryView | null` (always present; `null` for non-gallery posts); `galleryBatch` itself is not sent to the client.

- [ ] **Step 1: Failing tests:** Review Focus 1 (outsider / non-member / hidden item cases get only readable items; total counts only readable); query count stays constant for 20 posts across 2 communities; non-gallery posts get `gallery: null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement and wire into `decorateFeedPosts` (pass what it needs; keep its other callers working).
- [ ] **Step 4:** `pnpm vitest run src/server/gallery src/server/communities src/server/api/routers` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): show readable gallery items on feed posts`.

### Task 5: Feed card collage

**Files:**
- Create: `src/components/communities/gallery/gallery-collage.tsx` (+ test)
- Modify: `src/components/communities/feed/feed-post-card.tsx` (+ test), `src/components/communities/gallery/gallery-lightbox.tsx` (+ test) for scoped focus return, `messages/*.json`

**Interfaces:**
- Consumes: `FeedPostView.gallery`, `GalleryTile`, `GalleryLightbox`, `api.gallery.list({ slug, batchId })` for paging past the first three.
- Produces: `GalleryCollage({ slug, gallery: FeedGalleryView })`.

Behaviour (spec + mockup variant A): first item large, two small in a column, "+N" overlay on the third when `total > 3`; event link chip (→ `/events/{slug}`) and category badge above; tiles open `GalleryLightbox` over the batch (first page = the collage items, `more` = `gallery.list` with `batchId`). In the card's if-chain the collage comes **before** the link preview. A gallery post's card has no "Public" badge. Focus return: the lightbox returns focus to the opening tile **within the collage's own container** (add a `focusScope` ref prop to the lightbox; document-wide lookup stays as the fallback) so a post rendered twice on a page returns focus to the right copy.

- [ ] **Step 1:** Failing tests: 1/2/3/5-item layouts, "+2" overlay, video badge, event chip link, opening and focus return within scope, card if-chain order, empty `gallery` (null) renders text only.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm vitest run src/components/communities` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): show gallery batches as a collage in the feed`.

### Task 6: Event page section

**Files:**
- Create: `src/server/gallery/event-section.ts` (+ test) — the server model
- Create: `src/components/events/event-gallery-section.tsx` (+ test)
- Modify: `src/app/[locale]/events/[slug]/page.tsx` (+ `page.test.tsx`) — render in both layouts where the old gallery was
- Modify: `messages/*.json`

**Interfaces:**
- Produces: `loadEventGallerySection(deps: GalleryDeps, { event: { id; communityId?: string | null; status; date; startTime?; timezone? }, userId: string | null }): Promise<EventGallerySection | null>` where `EventGallerySection = { communitySlug: string; items: GalleryItemView[] /* ≤ 6 */; total: number; viewer: "member" | "outsider" | "guest"; joinPolicy?: … }`. Returns `null` (no section) when the flag is off, the event has no community, it is not linkable by `isLinkableEvent` (reuse it — one rule), or there is nothing to show **and** the viewer can't add (outsider/guest with 0 readable items).
- Produces: `EventGallerySection` client component.

Behaviour: `/ PHOTOS AND VIDEOS` house kicker, mono count ("14 ITEMS"), grid of up to six square tiles opening the lightbox, "See all N in the gallery" link (`/communities/{slug}/gallery?event={id}`) when `total > 6`, and **Add yours**: members → `/communities/{slug}/gallery?upload=1&event={id}` (primary/orange — it is the page's one primary only if the event page has no other primary at that point; check the page and use `ink` otherwise, per DESIGN.md One Voice Rule); guests → the sign-in gate with that path as `returnTo`; outsiders → link to the community page (join lives there). Empty state for members: "Be the first to add photos from this event." Section absent otherwise per the rule above.

- [ ] **Step 1:** Failing tests: Review Focus 1 for the event (outsider sees only readable items; hidden excluded); `null` for Hub event, cancelled, not started, flag off; Add-yours targets per viewer; both layouts render the section (page test with mocked loader).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm vitest run src/server/gallery src/components/events src/app/[locale]/events` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): show an event's photos and videos on its page`.

### Task 7: Whole-slice verification (controller)

- [ ] Full `pnpm test` vs the known baseline; `pnpm check`; DB tests on `aitcom_test` (apply `20261113b` via rendered SQL; guard test); migration on a fresh `dev-verify` reset; production `next build` on the test DB; visual check of a feed with a gallery post and an event page section (light, dark class, 400/1440).
