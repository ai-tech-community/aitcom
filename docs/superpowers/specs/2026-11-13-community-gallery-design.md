# Community gallery — design

**Status:** approved direction (Greg, 13 Nov 2026). Prototype variant **A · Wall** chosen.
**Mockup:** [2026-11-13-community-gallery-mockup.html](2026-11-13-community-gallery-mockup.html) (open in a browser; use the bottom bar, variant A).
**ADR:** [ADR-0049](../../adr/0049-gallery-media-is-stored-privately-under-its-own-prefix.md).

## Intent

Members of a community share photos and short videos from its events and from
everyday community life. Each item may be linked to the event it came from and
given a category. The gallery gives an event a life after it ends, lets members
build it together, and gives magazine editors real photos from real people
instead of stock imagery.

## Goals

- Any active member can upload a batch of photos and short videos to their
  community in one step.
- Each batch can be linked to one of the community's events and one category.
- A **Gallery** tab on the community shows everything as a filterable wall.
- An event page shows the photos and videos linked to it, with "Add yours".
- One feed post announces each batch, so members notice new photos.
- Magazine editors can feature single gallery items in an issue, but only items
  whose uploader allowed it.
- Members-only items are really private: nobody without access can open them,
  even with the link.
- Anyone can report an item, including "This is me, please remove it".

## Non-goals (this initiative)

- Likes and comments on single gallery items. The batch's feed post carries
  them.
- Albums, face tagging, people tagging, EXIF location display.
- Long-form video (that is Mux, ADR-0037). Gallery video follows the short-video
  rules: 90 s, converted on the device (ADR-0036).
- Downloading originals. We store the converted version only.
- Changing an item's visibility after upload (same as feed video today).

## Anti-goals

- A members-only photo that can be opened by anyone who has the URL.
- A photo of a person published more widely than the uploader agreed to.
- Gallery files deleted by a cleanup job that does not know about them.
- A second, parallel upload/storage system per content type when one storage
  module already exists.

## Decided by Greg

1. **One gallery per community**, not one per event. An item *may* link to an
   event; it doesn't have to.
2. **A dedicated gallery item**, one row per photo or video, not feed posts with
   tags. Batches announce themselves with one feed post.
3. **Variant A · Wall:** a filterable wall (event, category, photos/videos),
   upload in a single dialog, a collage in the feed, a six-tile grid on the
   event page.
4. **Magazine consent at upload:** a checkbox "The community may use these in
   its magazine", **unticked by default**. Editors can only pick items that have
   it.
5. The old admin-only `Events.gallery` field is replaced by gallery items.

## Approaches considered

| | Approach | Verdict |
|---|---|---|
| A | Gallery items are feed posts with an event and tags; the gallery is a filtered feed. | Rejected: 4 images per post floods the feed, a single photo can't be removed or reported, the magazine needs single items. |
| **B** | **A new gallery item (one photo or video each), its own storage prefix and cleanup, a feed post that references a batch.** | **Chosen.** Each item stands alone for consent, reports and magazine picks. |
| C | Extend the shared `Media` collection with community, event and visibility. | Rejected: `Media` is the public asset store for covers and logos, has no video, and is publicly readable; mixing member content and moderation into it breaks its one job. |

## How it works

### Data: `gallery-items` (new collection)

One row per photo or video. Fields:

| Field | Notes |
|---|---|
| `communityId` | text, indexed. Owner of the item. |
| `event` | relationship → `events`, optional, indexed. Must be an event of the same community (see Events). |
| `topicSlug` | text, optional. The category; one of the community's topics (see Categories). |
| `mediaType` | `photo` \| `video`. |
| `status` | `uploading` \| `ready` \| `failed`. Only `ready` items are ever listed. |
| `storage` | `public` \| `private`, derived from `visibility` at creation, never changed. |
| `visibility` | `community` \| `public`. Default `community`. Reuses `VIDEO_VISIBILITIES` labels. |
| `fileKey`, `thumbnailKey` | S3 keys under the gallery prefixes (ADR-0049). `fileKey` unique. |
| `width`, `height`, `bytes`, `durationSeconds` | Verified on finish where possible; duration from the client for video. |
| `caption` | text, max 280, optional. |
| `alt` | text, max 500, optional. When empty, the reader shows a generated description ("Photo from {event} by {name}"). The lightbox owner action "Edit details" can fill it later. |
| `uploaderId` | Better Auth user id, indexed. |
| `batchId` | text (uuid), indexed. Groups one upload. |
| `magazineConsent` | checkbox, default false; `magazineConsentAt` date. |
| `hiddenAt`, `reportCount` | Moderation, same meaning as on feed posts. |
| timestamps | |

Access: no member-facing Payload access (`read: adminsOnly`), like feed posts.
All reads and writes go through tRPC and the gallery service.

### Storage (ADR-0049)

- Files go **directly from the browser to our S3 bucket** with presigned POST
  grants, through the existing `ObjectStorage` (`src/server/media/object-storage.ts`).
  They do **not** go through Payload `Media` or `/api/upload`.
- Prefixes: `media/gallery/public/<communityId>/<uuid>.<ext>` and
  `private/gallery/<communityId>/<uuid>.<ext>`. These are outside the feed video
  prefixes, so the #388 feed sweep never sees them.
- Public items are read by direct URL. Members-only items are read through
  `signedGetUrl` (stable 30-minute window, ≥1 h validity), issued only to
  viewers who may see the item.
- **Photos** are shrunk in the browser before upload: long side 2048 px, JPEG
  (quality ~0.85), plus a 480 px thumbnail. Max 4 MB per photo after shrinking.
  HEIC that the browser can't decode gets a clear message.
- **Videos** use the existing on-device conversion (Mediabunny, 720p H.264 MP4 +
  JPEG thumbnail) and the limits in `src/lib/video-rules.ts`.
- Limits live in one place, `src/lib/gallery-rules.ts`: max 30 files per batch,
  per-user daily quota of 150 photos and `VIDEO_UPLOADS_PER_DAY` videos
  (counted from the database, not in memory), and the community's media
  allowance.
- **Media allowance:** gallery files count toward the same per-community
  allowance as classroom materials (`src/server/classroom/media-allowance.ts`).
  `usageFor` sums both sources. The allowance module moves out of `classroom/`
  to `src/server/media/` because it is now shared.

### Upload flow

1. `gallery.startBatch({ communitySlug, files: [{ mediaType, contentType, bytes, thumbnailBytes }], eventId?, topicSlug?, visibility, magazineConsent, caption? })`
   checks membership and post policy, the event, the topic, quotas and the
   allowance, creates one `uploading` item per file, and returns a presigned
   grant per file and thumbnail.
2. The browser uploads each file and thumbnail straight to S3, with progress.
3. `gallery.finishBatch({ batchId, done: [itemId], failed: [itemId] })`
   verifies each object (exists, type, size within its grant) with
   `ObjectStorage.inspect`, marks verified items `ready` and the rest `failed`
   (and removes their files), then creates the batch's feed post if at least one
   item is ready. Retrying finish is idempotent.
4. If the browser never calls finish, the cleanup job (below) removes the
   `uploading` rows and files after `ABANDONED_UPLOAD_HOURS`.

The server never trusts client metadata for access decisions. It verifies every
object before an item becomes `ready`.

### Cleanup

New, gallery-owned, in `src/server/gallery/`, run from the existing daily cron
route next to the feed sweeps:

- **Abandoned uploads:** `uploading` items older than `ABANDONED_UPLOAD_HOURS`
  → delete files and rows.
- **Failed items:** delete rows once their grant can't be live any more
  (`mayUploadGrantBeLive`).
- **Unused files sweep (production only, `ownsStorageContents`):** list both
  gallery prefixes; delete objects older than 7 days that no gallery item row
  references. Same safety rules as #388.
- Deleting an item removes its files best effort; the sweep is the safety net.

### Categories

Categories are the community's existing **topics** (`community-topics`, owner/
admin managed, max 10, used as feed chips). One list per community keeps the
labels tidy and gives owners one place to manage them. Stored as `topicSlug`,
the same way feed posts store it. When a topic is deleted, its gallery items lose
their category (set to empty), the same moment feed posts move to `general`.

### Events

- The upload dialog lists the community's own events that are published or
  completed and **have started** (no future events), newest first.
- An item can link only to an event whose `communityId` equals the item's
  community. Hub/platform events (no `communityId`) can't be picked. This stops a
  private community's photos leaking onto a public Hub event page.
- The event page gets a **"Photos and videos"** section (both the standard and
  the hackathon layout), replacing the old `gallery` rendering: up to six tiles,
  "See all N in the gallery" (opens the gallery filtered to that event), and
  **Add yours** (opens the upload dialog with that event chosen). It shows only
  items the viewer may see. Shown for events that have started. For a viewer who
  isn't a member, only public items show, and "Add yours" leads to joining.
- `Events.gallery` is removed. Production has 0 rows using it (checked
  13 Nov 2026). The migration drops it only if it's still empty and fails
  loudly otherwise.

### Gallery tab (variant A · Wall)

- New community tab **Gallery**, after Events, in `CommunityNav`, behind
  `COMMUNITY_GALLERY_ENABLED` until all slices ship.
- Header: `/ GALLERY` kicker, "Photos and videos", one line on who can see
  them, and **Add photos and videos** (the page's one orange action; members
  only, guests get the auth gate).
- Toolbar: event select (all, each event that has items, "Not from an event"),
  category chips (from topics that have items), Photos/Videos segmented
  control. Filters are in the URL (`?event=&topic=&type=`) so the event page
  can link straight to a filtered wall.
- Wall: CSS-columns masonry, 2 columns → 3 → 4 by container width; tiles show
  a video badge with duration and the event's short name; caption on hover and
  focus. Cursor-paginated "Load more" (`LoadMore` primitive), 40 per page.
- Empty state teaches the next action ("Add the first photos from your last
  event").
- **Lightbox:** large view, prev/next by arrow keys and buttons, Esc to close,
  focus returned to the tile. Side panel: uploader, time, caption, event link,
  category, who can see it, magazine permission, description. Actions: owner →
  Edit details (caption, alt, category, event, magazine permission) and Delete;
  others → "This is me, remove it" and Report; moderators → Restore/Remove on
  reported items. Visibility stays fixed.
- Non-members see only public items and the join prompt.

### Upload dialog (variant A)

One dialog: drop zone + "Choose files", thumbnails with remove, **Event**
select (with "Not from an event"), **Category** chips (single choice, can be
cleared), **Who can see these** (Members / Everyone, default Members), the
**magazine checkbox** (unticked) with the hint "Editors can only feature
photos with this ticked. People who can't see a members-only photo won't see it
in the magazine either.", Cancel and **Upload N**. Shows per-file progress;
conversion progress for video. If some files fail, the dialog says which and
lets the member retry or drop them.

### Feed post (collage)

- A new feed post kind, **gallery batch**: `feed-posts` gets a `galleryBatchId`
  text field. The post's `communityId`, `authorId`, `visibility` (`public` only if
  every ready item in the batch is public, otherwise `community`) and an
  optional caption come from the batch. `topicSlug` is the batch's topic or
  `general`.
- The card renders a collage: first item large, two small, "+N" on the third.
  It shows the event as a link chip and the category badge. Clicking a tile
  opens the gallery lightbox for that batch.
- Gallery items are owned by the gallery, not by the post:
  - Deleting the post leaves the items in the gallery.
  - Deleting the last visible item of a batch soft-deletes a post that has no
    text left (mirrors `unlinkFeedPostsBeforeMediaDelete`).
  - A moderator **removing** a reported gallery-batch post removes its items too
    (the report is about that content). **Restoring** the post leaves items as
    they are.
- The feed's "one media type per post" rules (`feed-post-rules.ts`,
  `post-media.ts`, the zod refines) treat `galleryBatchId` as a media kind: a
  gallery post can't also carry images, a GIF, a video or a poll. Gallery posts
  can't be created through `createPost`; only `finishBatch` makes them.
- **Proper design not done here:** feed post media are ad-hoc fields plus an
  if-chain in the card. The right shape is a post-media strategy registry like
  magazine item kinds (ADR-0043). That refactor touches every post type and is
  filed as its own issue; this initiative adds the gallery kind the same way the
  others are added and does not make the debt worse in any new way.

### Reports and moderation

- New collection `gallery-reports` mirroring `post-reports`: `item`
  (relationship → `gallery-items`), `reporterId`, `reason`, `note`,
  `dismissedAt`, unique `(item, reporterId)`.
- Reasons: the feed's list plus **`this_is_me`** ("This is me, please remove
  it").
- Same rules as feed posts: the first report hides the item for everyone except
  moderators and the uploader; `reportCount` is recounted from open reports;
  moderators get one notification (`gallery_item_reported`) linking to the item
  in the gallery. `this_is_me` also notifies the uploader.
- Moderators review in the lightbox: **Restore** (dismiss reports, unhide) or
  **Remove** (delete item and files, delete reports).
- Whether the report mechanics should become one generic, target-agnostic
  module is filed as a follow-up. This initiative keeps the second copy small by
  sharing the reasons list and the hide/recount rules as pure functions.

### Magazine

- New issue item kind **`galleryItem`** (ADR-0043 registry): one folder
  `src/server/magazines/items/galleryItem/` with `block.ts` (`galleryItemId`) and
  `kind.ts`; renderer for all four sizes (`lead`, `card`, `row`, `related`);
  builder entry; picker tab "Gallery".
- `validate`: the item exists, is `ready`, belongs to the magazine's community,
  is not hidden, and has `magazineConsent`.
- `load`: per reader, like every kind (ADR-0044). Members-only items show as
  `no_access` to readers who can't see community content. A public issue never
  widens access to a members-only photo.
- If the uploader later removes magazine permission, deletes the item, or the
  item is hidden, the item renders as unavailable in existing issues (live
  reference, ADR-0044).
- Suggester for auto-drafts: consented, ready, not-hidden items from events in
  the window, best first (most items from the same event first, then newest);
  at most one per event.

## Constraints

- Design system: DESIGN.md (community frame, One Voice Rule — one orange
  action per screen, House Kicker, Mono-is-Machine, Flat-by-Default). The
  gallery tab follows the community frame's container-query rule.
- Accessibility: WCAG 2.2 AA. Tiles are buttons with an accessible name; the
  lightbox is a modal dialog with focus trap and return; video badges carry
  text, not colour; reduced motion respected.
- i18n: all copy in `messages/en.json`, `nl.json`, `fr.json`.
- Migrations: hand-written Payload migrations in `src/migrations/` (next is
  `20261113a_...`). Additive only, except the guarded empty-field drop above.
  Never Payload push against production.
- `src/payload-types.ts` regenerated in the same change as each collection
  edit.
- The flag `COMMUNITY_GALLERY_ENABLED` hides the tab, the event section and the
  feed card until the last slice ships; then the flag is deleted.

## Slices

1. **Gallery core:** collection, migration, `gallery-rules`, storage, start/
   finish batch, quotas and allowance, cleanup, Gallery tab with wall, filters,
   lightbox, upload dialog, owner edit/delete. Behind the flag.
2. **Feed and events:** gallery-batch feed post with collage, event page
   section with "Add yours", removal of `Events.gallery`.
3. **Reports and moderation:** `gallery-reports`, "This is me", hide/restore/
   remove, notifications.
4. **Magazine:** `galleryItem` kind, picker, renderer, suggester. Then delete
   the flag.

## Left to the builder

- Exact component split and file names inside the folders named above.
- The image shrink helper: reuse and generalise the feed's shrink code rather
  than writing a second one.
- How the lightbox loads neighbours (prefetch the next signed URL or not).
- Test layout, following the repo's existing unit/integration split.
