# Community Gallery — Slice 1 (Gallery Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can upload batches of photos and short videos to a community gallery, browse them on a filterable wall with a lightbox, and edit or delete their own items — behind `COMMUNITY_GALLERY_ENABLED`.

**Architecture:** Two new Payload collections (`gallery-items`, `gallery-batches`) own every gallery file. Files go browser → S3 through per-file presigned POST grants under gallery-only prefixes (ADR-0049); a service layer in `src/server/gallery/` with injected deps (the `hosted-files.ts` pattern) holds every rule, and a thin `gallery` tRPC router exposes it. The Gallery tab is a new default builtin space surface.

**Tech Stack:** Next.js App Router, Payload CMS 3 (Postgres), tRPC, Drizzle (app schema), S3 via `ObjectStorage`, next-intl (en/nl/fr), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-community-gallery-design.md` (read it first). ADR: `docs/adr/0049-gallery-media-is-stored-privately-under-its-own-prefix.md`. Mockup: `docs/superpowers/specs/2026-11-13-community-gallery-mockup.html`, variant A.

## Global Constraints

- Branch `feat/community-gallery`. **Never** run `git checkout`, `git switch` or `git stash`. Stage files by name; never `git add -A` / `git add .`. Run `git branch --show-current` before every commit and stop if it is not `feat/community-gallery`.
- **Never** run `pnpm dev`, `pnpm build`, `pnpm db:apply`, `payload migrate` or anything reading `.env`: `.env` is the **production** database. DB integration tests run only with `RUN_DB_TESTS=1` against `postgres://postgres:postgres@127.0.0.1:55432/aitcom_test` with `PAYLOAD_PUSH` unset (the controller runs these; implementers write them).
- Migrations are hand-written Payload migrations in `src/migrations/`, registered in `src/migrations/index.ts`. This slice's migration: `20261113a_community_gallery`. Additive only.
- After any collection change run `pnpm payload generate:types` with `SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false` and commit `src/payload-types.ts` in the same commit. (It already has unrelated uncommitted drift from regenerated types; the regenerated file is the truth — commit it.)
- Limits (copy exactly into `src/lib/gallery-rules.ts`): `GALLERY_MAX_FILES_PER_BATCH = 30`, `GALLERY_MAX_VIDEOS_PER_BATCH = 10`, `GALLERY_PHOTOS_PER_DAY = 150`, gallery videos per day = `VIDEO_UPLOADS_PER_DAY` (counted from `gallery-items` only), `GALLERY_PHOTO_MAX_SIDE = 2048`, `GALLERY_THUMB_MAX_SIDE = 480`, `GALLERY_PHOTO_MAX_BYTES = 4 * 1024 * 1024`, `GALLERY_THUMB_MAX_BYTES = 512 * 1024`, `GALLERY_CAPTION_MAX = 280`, `GALLERY_ALT_MAX = 500`, `GALLERY_BATCH_TEXT_MAX = 500`, `GALLERY_PAGE_SIZE = 40`. Video limits come from `src/lib/video-rules.ts` unchanged.
- Prefixes (exact): `media/gallery/public/<communityId>/<uuid>.<ext>` and `private/gallery/<communityId>/<uuid>.<ext>`; thumbnails `<same stem>-thumb.jpg`.
- Visibility values `community` | `public` (reuse `VIDEO_VISIBILITIES` + labels); `storage` derived with `storageClassFor`.
- Error messages are stable codes (`GALLERY_DISABLED`, `NOT_A_MEMBER`, `EVENT_NOT_ALLOWED`, `TOPIC_NOT_FOUND`, `BATCH_TOO_LARGE`, `UPLOAD_LIMIT`, `STORAGE_FULL`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `UPLOAD_EXPIRED`, `UPLOAD_FAILED`, `NOT_ALLOWED`), mapped to translated copy in the UI. Never render `error.message`.
- Design: DESIGN.md community frame; one orange action per screen ("Add photos and videos" on the tab, "Upload N" in the dialog); `SectionLabel` for `/ GALLERY`; `SegmentedControl`, `LoadMore`, `EmptyState`, `ErrorState`, `Skeleton`, `RelativeTime`, `Avatar` primitives; `useRequireAuth` for the guest gate; container queries (not screen width) for the wall's columns.
- Copy in `messages/en.json`, `nl.json`, `fr.json` under a new `gallery` namespace, plus `communities.profile.gallery` ("Gallery" / "Galerij" / "Galerie").
- Flag: `COMMUNITY_GALLERY_ENABLED` (`"true"`/`"false"`, optional) in `src/env.js`; server helper `galleryEnabled()` in `src/server/gallery/flag.ts` reading `process.env.COMMUNITY_GALLERY_ENABLED === "true"` (same shape as `paymentsEnabled()`).
- No AI credit lines in commits.

## Review Focus

1. **A members-only file reaches someone who may not see it** — a non-member (or signed-out viewer) listing or opening a `community` item must get neither the item nor any URL; signed URLs are issued only after the access check. Test in Task 5.
2. **Slow phones and expiring grants** — `startItem` on a batch older than `FINISH_WINDOW_HOURS` is refused `UPLOAD_EXPIRED`; `finishItem` twice returns the same ready item; `finishItem` racing `discardItem` leaves exactly one outcome. Test in Task 4.
3. **Quotas across batches** — a member with 140 photos today starting a batch planning 11 photos is refused `UPLOAD_LIMIT`; 31 files or 11 videos refused `BATCH_TOO_LARGE`; a `startItem` beyond the batch's plan refused. Test in Task 4.
4. **Linking the wrong event** — an event from another community, a Hub event (no `communityId`), a future event, or a draft event is refused `EVENT_NOT_ALLOWED` in both `startBatch` and `updateItem`. Test in Tasks 4 and 5.
5. **The sweep deletes a file that is in use** — an object referenced by an `uploading` or `ready` item, or any object outside the two gallery prefixes, is never removed; the sweep does nothing outside production. Test in Task 7.

---

### Task 1: Gallery rules, collections, migration, flag

**Files:**
- Create: `src/lib/gallery-rules.ts`, `src/lib/gallery-rules.test.ts`
- Create: `src/collections/GalleryItems.ts`, `src/collections/GalleryBatches.ts`, `src/collections/gallery-schema.test.ts`
- Create: `src/server/gallery/flag.ts`
- Create: `src/migrations/20261113a_community_gallery.ts`; Modify: `src/migrations/index.ts`
- Modify: `src/payload.config.ts` (register both collections after `HostedMaterials`), `src/env.js` (flag, both blocks), `src/payload-types.ts` (regenerated)

**Interfaces:**
- Produces (`src/lib/gallery-rules.ts`): the constants in Global Constraints; `type GalleryMediaType = "photo" | "video"`; `GALLERY_PHOTO_CONTENT_TYPES = ["image/jpeg"] as const` (photos are always re-encoded to JPEG by the client); video content type `video/mp4`, thumbnail `image/jpeg`; `galleryObjectKeys({ storage: "public" | "private"; communityId: string; uploadId: string; mediaType: GalleryMediaType }): { fileKey: string; thumbnailKey: string }`; `GALLERY_KEY_PREFIXES = { public: "media/gallery/public/", private: "private/gallery/" } as const`; `isGalleryKey(key: string): boolean`; `galleryItemLabel({ caption, alt, mediaType, eventTitle, uploaderName }): string` (caption → alt → generated "Photo from {event} by {name}" / "Photo by {name}" — returns an i18n key + values, not English, see test).
- Produces (collections): `gallery-items` fields exactly as the spec table (slug `gallery-items`, `event` relationship to `events`, `fileKey` unique, `status` select `uploading|ready|failed`, `failureReason` text, `storage` select, `visibility` select, `batch` relationship to `gallery-batches` indexed, plus `uploadId` unique). `gallery-batches` fields exactly as the spec's Upload flow paragraph. Both: `access` all `adminsOnly` (import the existing helper used by `HostedMaterials`), `timestamps: true`, admin descriptions in plain English.
- Produces: `galleryEnabled(): boolean`.

- [ ] **Step 1: Write failing tests.** `gallery-rules.test.ts`: `galleryObjectKeys` returns `media/gallery/public/c1/u1.jpg` + `media/gallery/public/c1/u1-thumb.jpg` for a public photo and `private/gallery/c1/u1.mp4` + `private/gallery/c1/u1-thumb.jpg` for a private video; `isGalleryKey("private/videos/x.mp4") === false`, `isGalleryKey("private/gallery/c/x.jpg") === true`; `galleryItemLabel` precedence (caption wins, then alt, then `{ key: "gallery.label.photoFromEvent", values: { event, name } }`, then `photoBy`). `gallery-schema.test.ts` (copy the style of `src/collections/community-videos-schema.test.ts`): both collections registered in the Payload config, `fileKey` unique, `status` options exactly `uploading,ready,failed`, `visibility` default `community`, `magazineConsent` default `false`, access functions refuse a non-admin.
- [ ] **Step 2:** `pnpm vitest run src/lib/gallery-rules.test.ts src/collections/gallery-schema.test.ts` → FAIL (modules missing).
- [ ] **Step 3:** Implement the rules module, both collections, the flag helper and `src/env.js` entries.
- [ ] **Step 4: Migration** `20261113a_community_gallery.ts`, following `20260928d_hosted_materials.ts` exactly (enums in `public`, `CREATE TABLE IF NOT EXISTS`, every index the collection declares, `payload_locked_documents_rels` columns + FKs + indexes for **both** collections, `down` reverses). Also in `up`, the Gallery space backfill, appended after each community's current last position:
  ```sql
  INSERT INTO "app"."space" ("id","community_id","kind","builtin_surface","slug","position")
  SELECT gen_random_uuid()::text, c."id", 'builtin', 'gallery', 'gallery',
         COALESCE((SELECT MAX(s."position") + 1 FROM "app"."space" s WHERE s."community_id" = c."id"), 0)
  FROM "app"."community" c
  WHERE NOT EXISTS (SELECT 1 FROM "app"."space" s WHERE s."community_id" = c."id" AND s."slug" = 'gallery');
  ```
  `down` deletes only `kind='builtin' AND builtin_surface='gallery'` rows. Register in `index.ts`.
- [ ] **Step 5:** Regenerate types; `pnpm vitest run src/lib/gallery-rules.test.ts src/collections/gallery-schema.test.ts` → PASS; `pnpm typecheck` → no errors.
- [ ] **Step 6: Commit** `feat(gallery): add gallery items, batches, rules and migration`.

### Task 2: Shared community media allowance

**Files:**
- Move: `src/server/classroom/media-allowance.ts` → `src/server/media/media-allowance.ts` (and its test); update every importer (`grep -rn "classroom/media-allowance" src`).
- Modify: `src/server/media/media-allowance.ts`

**Interfaces:**
- Consumes: `gallery-items` (Task 1).
- Produces: unchanged exports (`allowanceFor`, `usageFor`, `exceedsAllowance`, `mayUploadGrantBeLive`, `STORAGE_COUNTED_STATUSES`, `UPLOAD_GRANT_LIVE_SECONDS`). `usageFor(payload, communityId, now)` now returns the sum of hosted-material bytes **plus** gallery-item `bytes` (file + thumbnail bytes are both stored in `bytes`, see Task 4) under the same status rule.

- [ ] **Step 1: Failing test** in the moved test file: `usageFor sums hosted materials and gallery items` — fake payload returns 1 000 bytes of `ready` materials and 500 of `uploading` gallery items and 300 of `failed` gallery items created 2 h ago → `{ fileBytesStored: 1500 }`; a failed gallery item created 5 min ago is counted (grant may be live).
- [ ] **Step 2:** Run it → FAIL.
- [ ] **Step 3:** Move the module, add a second `payload.find` on `gallery-items` with the same `where`, update importers. Keep the module doc comment, now saying it is shared by classroom files and the gallery.
- [ ] **Step 4:** `pnpm vitest run src/server/media src/server/classroom src/server/api/routers` → PASS.
- [ ] **Step 5: Commit** `refactor(media): share the community media allowance with the gallery`.

### Task 3: Gallery tab surface

**Files:**
- Modify: `src/server/communities/space-defaults.ts` (+ test), `src/server/api/routers/spaces.ts` (+ `spaces.integration.test.ts`), `messages/{en,nl,fr}.json` (`communities.profile.gallery`)
- Modify: any switch/record over `BuiltinSurface` the compiler flags.

**Interfaces:**
- Produces: `BUILTIN_SURFACES = ["forum","events","gallery","classroom","ideas","members"]`; `DEFAULT_BUILTIN_LABELS.gallery = ["Gallery","Galerie","Galerij"]`; `spaces.list` / `listRooms` never return the `gallery` surface while `galleryEnabled()` is false.

- [ ] **Step 1: Failing tests:** `buildDefaultSpaceRows` returns six rows with `gallery` at position 2; `isDefaultBuiltinLabel("gallery","Galerij") === true`; `spaces.list` omits the gallery row when the flag is off and includes it when on (stub `process.env.COMMUNITY_GALLERY_ENABLED`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; fix every compile error from the widened union.
- [ ] **Step 4:** `pnpm vitest run src/server/communities/space-defaults.test.ts src/components/communities/community-nav.test.tsx` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): add the Gallery tab as a default community space`.

### Task 4: Upload lifecycle service

**Files:**
- Create: `src/server/gallery/uploads.ts`, `src/server/gallery/uploads.test.ts`, `src/server/gallery/uploads.integration.test.ts`
- Create: `src/server/gallery/access.ts` (+ test) — membership, event and topic checks shared with Task 5

**Interfaces:**
- Consumes: Task 1 rules and collections; Task 2 allowance; `ObjectStorageSource`; `requireActiveFeedMember`-style membership (reuse `isActiveCommunityMember` + `membershipPaymentAllowed`); `canPostToFeed` is **not** used here (slice 2).
- Produces (`access.ts`):
  - `type GalleryViewer = { userId: string | null; communityId: string; isMember: boolean; isModerator: boolean }`
  - `loadGalleryViewer(deps, { slug, userId }): Promise<GalleryViewer & { community: { id: string; slug: string } }>` (NOT_FOUND for unknown/deleted community)
  - `assertLinkableEvent(payload, communityId, eventId, now): Promise<void>` — event exists, `communityId` equal, `status` in published/completed (check the field names in `Events.ts`), start date ≤ now; else `EVENT_NOT_ALLOWED`
  - `assertCommunityTopic(payload, communityId, topicSlug): Promise<void>` — else `TOPIC_NOT_FOUND`
- Produces (`uploads.ts`), all taking `deps: GalleryDeps = { payload; db; storage: ObjectStorageSource; now?; newUploadId?; log? }`:
  - `startBatch(deps, { userId, slug, eventId?: number; topicSlug?: string; visibility: "community"|"public"; magazineConsent: boolean; caption?: string; plannedFiles: number; plannedVideos: number }): Promise<{ batchId: number }>`
  - `startItem(deps, { userId, batchId, mediaType, contentType, bytes, thumbnailBytes, width, height, durationSeconds? }): Promise<{ itemId: number; file: PresignedUpload; thumbnail: PresignedUpload }>`
  - `finishItem(deps, { userId, itemId }): Promise<GalleryItemOwnView>`
  - `discardItem(deps, { userId, itemId }): Promise<void>`
  - `finishBatch(deps, { userId, batchId }, announce?: (batch, readyItems) => Promise<number | null>): Promise<{ readyCount: number; feedPostId: number | null }>` — `announce` is the slice-2 seam; slice 1 passes none.
  - `type GalleryItemOwnView = { id: number; status: "ready"; mediaType; width; height }`

Rules to encode (each gets a unit test with fakes, `hosted-files.test.ts` style):
- `startBatch`: refuses non-members `NOT_A_MEMBER`, flag off `GALLERY_DISABLED`; validates event (Task `assertLinkableEvent`) and topic; `plannedFiles` 1..30, `plannedVideos` 0..min(10, plannedFiles) else `BATCH_TOO_LARGE`; today's ready+uploading+failed gallery photos + planned photos ≤ 150 and videos likewise ≤ `VIDEO_UPLOADS_PER_DAY`, else `UPLOAD_LIMIT`; caption trimmed, ≤ 500; stores `magazineConsentAt` when consent is true.
- `startItem`: the batch is the caller's and `open` and younger than `FINISH_WINDOW_HOURS` else `UPLOAD_EXPIRED`; counts of the batch's items stay within its plan else `BATCH_TOO_LARGE`; photo: `contentType` `image/jpeg`, `bytes` ≤ 4 MB; video: `video/mp4`, ≤ `MAX_VIDEO_BYTES`, `durationSeconds` ≤ `MAX_VIDEO_SECONDS`; thumbnail ≤ 512 KB; else `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE`; allowance check with `bytes + thumbnailBytes` else `STORAGE_FULL`; presign both **before** creating the row (as `startFileUpload` does); the row stores `bytes = bytes + thumbnailBytes`.
- `finishItem`: own item only else `UPLOAD_EXPIRED`; `inspect` both keys; valid when both exist, types match and sizes are 1..declared; ready via conditional update on `status=uploading`; bad → failed (`UPLOAD_MISMATCH`), remove both keys best effort, throw `UPLOAD_FAILED`; second call on a ready item returns it.
- `discardItem`: conditional update to failed (`cancelled`), remove keys best effort; no-op on settled items.
- `finishBatch`: own batch; sets `finished` with a conditional update on `status=open`; calls `announce` only when it moves the batch and `readyCount > 0`; second call returns the stored result.

- [ ] **Step 1:** Write the unit tests above (one `it` per rule, plus Review Focus 2, 3, 4) with fake payload/storage.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `access.ts` and `uploads.ts`.
- [ ] **Step 4:** Write `uploads.integration.test.ts` (gated with `RUN_DB_TESTS`, style of `feed-post-delete.integration.test.ts`): a member starts a batch, starts and finishes one photo against a fake storage that reports the object, finishes the batch; the item is `ready` and the batch `finished`.
- [ ] **Step 5:** `pnpm vitest run src/server/gallery` → PASS (integration skipped unless gated).
- [ ] **Step 6: Commit** `feat(gallery): upload batches with per-file grants`.

### Task 5: Reading, editing and deleting items

**Files:**
- Create: `src/server/gallery/items.ts`, `src/server/gallery/items.test.ts`

**Interfaces:**
- Consumes: Task 4 `access.ts`.
- Produces:
  - `type GalleryItemView = { id: number; mediaType; url: string; thumbnailUrl: string; width: number; height: number; durationSeconds: number | null; caption: string | null; alt: string | null; event: { id: number; title: string; slug: string } | null; topicSlug: string | null; visibility: "community"|"public"; magazineConsent: boolean; uploader: { id: string; name: string; image: string | null }; createdAt: string; isOwn: boolean; batchId: number }`
  - `galleryReadableWhere(viewer: GalleryViewer): Where` — `status=ready` and `communityId` equal; non-members: `visibility=public` and not hidden; members: not hidden, or own, or viewer is moderator.
  - `listItems(deps, { viewer, eventId?: number | "none"; topicSlug?: string; mediaType?: GalleryMediaType; cursor?: number; limit?: number }): Promise<{ items: GalleryItemView[]; nextCursor: number | null }>` — newest first by `id` desc, `limit` default `GALLERY_PAGE_SIZE`.
  - `listFacets(deps, { viewer }): Promise<{ events: { id; title; label: string }[]; topics: string[]; hasUnlinked: boolean }>` — only facets that have readable items.
  - `getItem(deps, { viewer, itemId }): Promise<GalleryItemView>` (NOT_FOUND when unreadable)
  - `linkableEvents(deps, { viewer }): Promise<{ id; title; startsAt }[]>` — the community's started published/completed events, newest first (for the upload dialog).
  - `updateItem(deps, { viewer, itemId, caption?, alt?, topicSlug?: string | null, eventId?: number | null, magazineConsent? }): Promise<GalleryItemView>` — owner only (`NOT_ALLOWED`); same event/topic checks; setting consent true stamps `magazineConsentAt`, false clears it.
  - `deleteItem(deps, { viewer, itemId }): Promise<void>` — owner or moderator; delete the row, then remove both keys best effort (log failures; the sweep is the safety net).
  - URLs: `public` storage → `ObjectStorage.publicUrl(key)`; `private` → `signedGetUrl(key)`. Uploader names are loaded in one batched query (no per-item lookup).

- [ ] **Step 1: Failing tests:** Review Focus 1 (a non-member and a signed-out viewer get no `community` item from `listItems`, `getItem` throws NOT_FOUND, and `signedGetUrl` is never called for them — assert on the fake storage's calls); members see community items with signed URLs; hidden items visible only to moderators and the owner; filters (event, `"none"`, topic, type); cursor paging returns 40 then the rest; `updateItem` by a non-owner refused; `updateItem` with a foreign event refused (Review Focus 4); `deleteItem` by a moderator removes both keys; uploader names fetched with one query for 40 items.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm vitest run src/server/gallery` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): read, edit and delete gallery items`.

### Task 6: `gallery` tRPC router

**Files:**
- Create: `src/server/api/routers/gallery.ts`, `src/server/api/routers/gallery.test.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: Tasks 4–5.
- Produces procedures (inputs are zod-validated with the limits above; every one refuses `NOT_FOUND` / `GALLERY_DISABLED` when `galleryEnabled()` is false): `list` (public: signed-out viewers get public items), `facets` (public), `item` (public), `linkableEvents` (protected), `startBatch`, `startItem`, `finishItem`, `discardItem`, `finishBatch`, `updateItem`, `deleteItem` (protected). The router is a thin shell, like `classroom-materials.ts`.

- [ ] **Step 1: Failing tests:** flag off → every procedure throws; zod rejects `plannedFiles: 31` before the service runs; a signed-out `list` call works and passes `userId: null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement and register as `gallery`. **Step 4:** `pnpm vitest run src/server/api/routers/gallery.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): expose the gallery over tRPC`.

### Task 7: Cleanup and unused-files sweep

**Files:**
- Create: `src/server/gallery/cleanup.ts`, `src/server/gallery/cleanup.test.ts`, `src/server/gallery/unused-files-sweep.ts`, `src/server/gallery/unused-files-sweep.test.ts`
- Modify: `src/app/api/cron/video-uploads-cleanup/route.ts` (+ its test if present)

**Interfaces:**
- Produces: `cleanupAbandonedGalleryUploads({ payload, storage, now?, warn? }): Promise<{ removed: number; failed: number; batchesClosed: number }>` and `sweepUnusedGalleryFiles({ payload, storage, now? }): Promise<{ scanned: number; removed: number; failed: number }>`.

Rules:
- Cleanup (style of `material-uploads-cleanup.ts`, page size 200, oldest first): items `uploading` or `failed` older than `ABANDONED_UPLOAD_HOURS` → remove both keys, then the row. Then `open` batches older than `ABANDONED_UPLOAD_HOURS` → `finished`; delete the batch if it has no items left. (Slice 2 makes this path announce batches with ready items, through the same seam as `finishBatch`.)
- Sweep (style of `unused-video-files-sweep.ts`): list both `GALLERY_KEY_PREFIXES`; candidates older than 7 days; in-use set = `fileKey` and `thumbnailKey` of every `gallery-items` row in any status; remove the rest in chunks; only keys passing `isGalleryKey`.
- Cron: run cleanup with the other abandoned sweeps; run the sweep only when `ownsStorageContents()`; report under `gallery` and `unusedGalleryFiles`; a throwing sweep reports null and fails the run (existing pattern).

- [ ] **Step 1: Failing tests:** Review Focus 5 (a key of an `uploading` item and of a `ready` item survive; `private/videos/x.mp4` returned by a misbehaving fake `list` is never removed; nothing younger than 7 days removed); abandoned items removed with their keys; a storage failure on one item doesn't stop the others; open batch closed; cron reports `{ skipped: "not production" }` for the sweep outside production.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement and wire. **Step 4:** `pnpm vitest run src/server/gallery src/app/api/cron` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): clean up abandoned uploads and unused gallery files`.

### Task 8: Client upload pipeline

**Files:**
- Modify: `src/lib/shrink-image.ts` (+ new test) — extract the canvas core
- Create: `src/lib/gallery-photo.ts` (+ test), `src/components/communities/gallery/use-gallery-upload.ts` (+ test)

**Interfaces:**
- Consumes: `api.gallery.*` (Task 6), `uploadToGrant` (`src/lib/upload-to-grant.ts`), `transcodeForUpload` / `canTranscode` / `VideoTooLongError` / `UnsupportedVideoError` (`src/lib/video-transcode.ts`).
- Produces:
  - `src/lib/shrink-image.ts`: keep `shrinkImage` unchanged in behaviour; add `drawScaled(bitmap, maxSide): HTMLCanvasElement` and `canvasToJpeg(canvas, maxBytes, qualities?): Promise<Blob | null>` used by both.
  - `prepareGalleryPhoto(file: File): Promise<{ file: File; thumbnail: Blob; width: number; height: number }>` — always re-encodes to JPEG at ≤ 2048 px long side and ≤ 4 MB; thumbnail ≤ 480 px, ≤ 512 KB; throws `UndecodablePhotoError` when `createImageBitmap` fails (e.g. HEIC in Chrome).
  - `useGalleryUpload(slug)` → `{ state, start(files: File[], settings: GalleryBatchSettings), cancel(), retryFailed(), dropFailed() }` where `state.files: { id; name; mediaType; phase: "waiting"|"preparing"|"uploading"|"done"|"failed"; progress: number; error?: GalleryUploadErrorCode }[]` and `state.phase: "idle"|"running"|"finished"`. It calls `startBatch` once, then for each file **in order, one at a time**: prepare → `startItem` → `uploadToGrant` file and thumbnail → `finishItem`; on any failure `discardItem` and mark the file failed; finally `finishBatch`. Cancel aborts the current transfer, discards it, and finishes the batch with whatever is ready.

- [ ] **Step 1: Failing tests:** `prepareGalleryPhoto` output sizes (mock `createImageBitmap` and canvas as `upload-feed-image.test.ts` does); HEIC failure maps to `UndecodablePhotoError`; the hook with fake `api` and `FakeXHR` (`src/test/fake-xhr.ts`): uploads three files sequentially (assert call order), a failing second file is discarded and the third still uploads, `finishBatch` called once at the end, cancel discards the current item.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm vitest run src/lib src/components/communities/gallery src/components/communities/feed` → PASS (feed image tests still pass after the shrink refactor).
- [ ] **Step 5: Commit** `feat(gallery): prepare and upload gallery files from the browser`.

### Task 9: Gallery tab — wall, filters, lightbox

**Files:**
- Create: `src/app/[locale]/communities/[slug]/gallery/page.tsx` (server: `notFound()` when `galleryEnabled()` is false; renders the client component)
- Create in `src/components/communities/gallery/`: `gallery-page.tsx`, `gallery-toolbar.tsx`, `gallery-wall.tsx`, `gallery-tile.tsx`, `gallery-lightbox.tsx`, each with a `.test.tsx`
- Modify: `messages/{en,nl,fr}.json` (`gallery.*`)

**Interfaces:**
- Consumes: `api.gallery.list|facets|item`, `galleryItemLabel`.
- Produces: `GalleryPage({ slug })`; `GalleryLightbox({ items, openId, onClose, onNavigate, onEdit?, onDeleted? })` (reused by slices 2–3); `GalleryTile({ item, showEvent })`.

Behaviour (mockup variant A is the visual reference; DESIGN.md wins on any conflict):
- Header: `SectionLabel` "Gallery", h2 "Photos and videos", one muted line; **Add photos and videos** primary button (members; guests → `useRequireAuth`; non-member members-to-be → join prompt via existing `JoinButton`).
- Toolbar: event `Select` (All events, facet events, "Not from an event" when `hasUnlinked`), topic chips (`role="radiogroup"`), `SegmentedControl` All/Photos/Videos. State lives in the URL search params `event`, `topic`, `type` (replace, not push).
- Wall: container-query masonry (2 → 3 at `@xl` → 4 at `@4xl`), tiles are `<button>` with the accessible name from `galleryItemLabel`, video badge with `Play` icon + mono duration, event short name chip; caption overlay on hover/focus with `motion-safe:` transitions. `LoadMore` for `nextCursor`. Loading → `Skeleton` tiles; error → `ErrorState` with retry; empty → `EmptyState` with the upload action.
- Lightbox: `Dialog`-based modal, full-bleed stage with `next/image` `unoptimized` for signed URLs (they must not be cached by the image optimizer) and `<video controls playsInline poster>` for video; prev/next buttons and ←/→; Esc closes; focus returns to the opening tile. Side panel: `Avatar` + name, `RelativeTime`, caption, facts list (event link, category badge, who can see, magazine permission with a check icon + text), alt text. Owner actions: Edit details (Task 10 dialog), Delete (`AlertDialog` confirm). Moderator: Delete.

- [ ] **Step 1: Failing tests:** filters write to the URL and refetch with those inputs; tile accessible names; lightbox keyboard navigation and focus return; guest clicking Add triggers the auth gate (assert `requireAuth` called, not the mutation); loading/error/empty states; owner sees Edit/Delete, others don't.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm vitest run src/components/communities/gallery` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): add the gallery wall and lightbox`.

### Task 10: Upload dialog and Edit details

**Files:**
- Create in `src/components/communities/gallery/`: `gallery-upload-dialog.tsx`, `gallery-edit-dialog.tsx` (+ tests)
- Modify: `gallery-page.tsx` (open the dialog; `?upload=1&event=<id>` opens it with the event chosen — slice 2's "Add yours" links here), `messages/*.json`

**Interfaces:**
- Consumes: `useGalleryUpload` (Task 8), `api.gallery.linkableEvents|updateItem`, `api.topics.list`.
- Produces: `GalleryUploadDialog({ slug, open, onOpenChange, initialEventId? })`, `GalleryEditDialog({ item, open, onOpenChange })`.

Behaviour (variant A): drop zone + "Choose files" (`accept="image/*,video/*"`, multiple), thumbnails with remove, Event select ("Not from an event" default unless `initialEventId`), topic chips (single, clearable), Who can see `SegmentedControl` (Members default / Everyone), "Say something about these" `Textarea` (≤ 500, counter), magazine `Checkbox` unticked with the spec's exact hint copy, Cancel + **Upload N** primary. While running: per-file progress rows (`Progress`), conversion progress for video, Cancel stops. Finished: success line `role="status"` ("12 photos added to …"), failed files listed with Retry / Drop. Files above 30 or videos above 10 are refused at selection with a clear line. Browsers without `canTranscode()` get the existing video-unsupported message for videos only. Edit details: caption, alt, topic, event, magazine permission; visibility shown read-only with a short "can't be changed after upload" line.

- [ ] **Step 1: Failing tests:** selecting 31 files shows the limit line and keeps 30; magazine checkbox is unticked by default and its value reaches `start`; `initialEventId` preselects the event; Upload is disabled with no files; progress and failure states render from a fake hook; edit dialog sends only changed fields and shows the visibility as read-only.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `pnpm vitest run src/components/communities/gallery` → PASS.
- [ ] **Step 5: Commit** `feat(gallery): add the upload dialog and item editing`.

### Task 11: Whole-slice verification (controller)

- [ ] `pnpm test` (full suite) → all pass; `pnpm typecheck` → clean; `pnpm lint` → clean.
- [ ] DB tests: `RUN_DB_TESTS=1` against `aitcom_test` (see Global Constraints) for `src/server/gallery` and `src/server/api/routers/spaces.integration.test.ts`.
- [ ] Migration dry run on the Neon branch: confirm `.env.dev` host contains the branch name, then `pnpm db:apply:dev:dry`, then `pnpm db:apply:dev`.
- [ ] Production build check with the test DB: `NODE_ENV=production PAYLOAD_PUSH=false SKIP_ENV_VALIDATION=1 DATABASE_URL=<aitcom_test> pnpm exec next build`.
- [ ] Visual check of `/communities/<slug>/gallery` with the flag on against the test DB, light and dark, 400 px and 1440 px.
- [ ] `git status --short` clean except the pre-existing `src/payload-types.ts` drift if it was not part of a regenerate commit.
