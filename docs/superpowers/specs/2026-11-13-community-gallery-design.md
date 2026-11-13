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
- Gallery videos in Reels (Reels keeps reading feed video posts only).
- Gallery photos as magazine issue covers or as another item's image: those
  are copied URLs owned by the issue and could not honour a withdrawn
  permission. Editors feature gallery photos as `galleryItem` items only.
- MCP/agent tools for the gallery.

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

## Calls made by Claude (Greg asked to proceed without more questions)

Grants per file; members may upload where the feed is admins-only (no feed
post then); Gallery is a default tab appended to existing orders; no Reels;
optional batch text goes on the feed post only; galleryItem is the only
magazine use; categories are community topics; only started events of the same
community can be linked; a moderator removing a gallery post removes its
items; gallery bytes share the community media allowance.

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
| `batch` | relationship → `gallery-batches`, required, indexed. Groups one upload. |
| `uploadId` | text (server-generated UUID), unique. Names the files. |
| `failureReason` | text, set when `status = failed`. |
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
- Limits live in one place, `src/lib/gallery-rules.ts`: max 30 files and 10
  videos per batch, per-user daily quota of 150 gallery photos and
  `VIDEO_UPLOADS_PER_DAY` gallery videos (counted from `gallery-items`, separate
  from the feed's video count, never in memory), and the community's media
  allowance.
- **Operational prerequisite (Greg):** the app's AWS credentials must be allowed
  `s3:PutObject`, `GetObject`, `DeleteObject` and `ListBucket` on
  `media/gallery/*` and `private/gallery/*`, and `media/gallery/public/*` must be
  publicly readable like `media/videos/public/*`. `COMMUNITY_GALLERY_ENABLED`
  stays off until this is done.
- **Media allowance:** gallery files count toward the same per-community
  allowance as classroom materials (`src/server/classroom/media-allowance.ts`).
  `usageFor` sums both sources in one SQL `SUM`. The allowance module moves out of `classroom/`
  to `src/server/media/` because it is now shared.

### Upload flow

Grants are issued **one file at a time**, as each file is ready, because a
grant lives only `UPLOAD_GRANT_SECONDS` (10 min) and a phone converting several
videos would outlive grants issued up front (builder check, settled 13 Nov).

A batch is a record, `gallery-batches` (new collection): `communityId`,
`uploaderId`, `event`, `topicSlug`, `visibility`, `magazineConsent`,
`caption` (max 500, optional; goes on the feed post only), `plannedFiles`,
`plannedVideos`, `status` (`open` | `finished`), `feedPostId`, timestamps.

1. `gallery.startBatch({ slug, eventId?, topicSlug?, visibility, magazineConsent, caption?, plannedFiles, plannedVideos })`
   checks: active member (paid where required); event and topic valid for the
   community; `plannedFiles` ≤ 30 and `plannedVideos` ≤ 10; `public` only
   where it reaches outsiders (otherwise refused `PUBLIC_NOT_AVAILABLE`, never
   quietly kept to members); fewer than `GALLERY_MAX_OPEN_BATCHES` (3) of the
   member's batches still open in their finish window, in any community, and
   the daily quotas leave room for the whole batch (both `UPLOAD_LIMIT`).
   Creates the batch (`open`).
2. For each file, once the browser has shrunk or converted it:
   `gallery.startItem({ batchId, mediaType, contentType, bytes, thumbnailBytes, width, height, durationSeconds? })`
   checks the batch is the caller's, `open`, not past `FINISH_WINDOW_HOURS`,
   and the item fits the batch's plan, the per-file limits and the community
   allowance. Creates an `uploading` item and returns presigned grants for the
   file and its thumbnail.
3. The browser uploads both straight to S3, with progress, then calls
   `gallery.finishItem({ itemId })`: the server verifies both objects (exist,
   type, size within the grant) with `ObjectStorage.inspect` → `ready`, else
   `failed` and the files removed. `gallery.discardItem({ itemId })` covers a
   cancelled or failed transfer. Both are idempotent and race-safe (conditional
   update on `status = uploading`, as in `hosted-files.ts`).
4. `gallery.finishBatch({ batchId })` marks the batch `finished` and, if at
   least one item is `ready` **and the uploader may post to the feed**
   (`canPostToFeed`; communities with `feedPostPolicy = admins_only` still let
   members add to the gallery, just without a feed post), creates the batch's
   feed post (slice 2). Idempotent.
5. Abandoned work is cleaned up by the daily job (below): `uploading` items
   after `ABANDONED_UPLOAD_HOURS`, and `open` batches after the same time are
   finished as in step 4 (or deleted when they hold no ready item).

The client uploads files one after another (one video conversion at a time) so
memory stays bounded on phones.

The server never trusts client metadata for access decisions. It verifies every
object before an item becomes `ready`.

### Cleanup

New, gallery-owned, in `src/server/gallery/`, run from the existing daily cron
route next to the feed sweeps:

- **Abandoned uploads:** `uploading` items older than `ABANDONED_UPLOAD_HOURS`
  → delete files and rows.
- **Failed items:** delete files and rows after `ABANDONED_UPLOAD_HOURS` (by
  then every grant has long expired; same rule as classroom uploads).
- **Batches:** `open` batches older than `ABANDONED_UPLOAD_HOURS` are finished
  through the same function as `finishBatch` (one place to announce); finished
  batches older than that with no items and no feed post are deleted.
- **Unused files sweep (production only, `ownsStorageContents`):** list both
  gallery prefixes; delete objects older than 7 days that no gallery item row
  references. Same safety rules as #388.
- Both gallery passes run only while `COMMUNITY_GALLERY_ENABLED` is on (the S3
  permissions for the gallery prefixes arrive with the flag) and report
  themselves skipped otherwise.
- Deleting an item removes its files best effort; the sweep is the safety net.
- When a member deletes their account (#568), their items and batches stay:
  `uploaderId` becomes the deleted-author marker, and the gallery shows the
  uploader as "Deleted member" with no photo.

### Categories

Categories are the community's existing **topics** (`community-topics`, owner/
admin managed, max 10, used as feed chips). One list per community keeps the
labels tidy and gives owners one place to manage them. Stored as `topicSlug`,
the same way feed posts store it. When a topic is deleted, its gallery items lose
their category (set to empty), the same moment feed posts move to `general`.

### Events

- The upload dialog lists the community's own events that are published or
  completed and **have started** (no future events), newest first.
- An item's accessible name (tiles, lightbox) is its caption, else its alt,
  else the generated "Photo from {event} by {name}" / "Video from …".
- An item can link only to an event whose `communityId` equals the item's
  community. Hub/platform events (no `communityId`) can't be picked. This stops a
  private community's photos leaking onto a public Hub event page.
- The event page gets a **"Photos and videos"** section (both the standard and
  the hackathon layout), replacing the old `gallery` rendering: up to six tiles,
  "See all N in the gallery" (opens the gallery filtered to that event), and
  **Add yours** (opens the upload dialog with that event chosen). It shows only
  items the viewer may see. Shown for events that have started. For a viewer who
  isn't a member, only public items show, and "Add yours" leads to joining
  (signing in first for a signed-out visitor), shown only when the community
  lets someone new in — never for an invite-only one.
- `Events.gallery` is removed. Production has 0 rows using it (checked
  13 Nov 2026). The migration first checks it is still empty — in both
  `events_rels` (path `gallery`) and the versions table `_events_v_rels` (path
  `version.gallery`; any non-null `media_id`) — and fails loudly otherwise.
  `gallery` is Events' only hasMany media relation, so `media_id` on both
  rels tables is no longer used. It is **not** dropped in this deploy:
  production applies migrations during the build while the old deployment
  still serves, and the old code reads `media_id`. The new code ignores the
  leftover nullable column. A follow-up migration drops the column, index and
  foreign key once this deploy is live.
- The section is not shown for Hub events (no community), for events that
  can't be linked (draft, cancelled, rejected) or haven't started, or while
  the flag is off.

### Gallery tab (variant A · Wall)

- New community tab **Gallery**: a new default builtin surface `gallery`
  (`BUILTIN_SURFACES` in `space-defaults.ts`, after `events`), so every
  community has it and owners can rename, hide and reorder it like the other
  tabs. New communities get it in canonical order; a backfill migration adds it
  to existing communities **at the end of their current order** so custom
  orders are kept (production: 19 communities, no room owns the slug
  `gallery`, checked 13 Nov). While `COMMUNITY_GALLERY_ENABLED` is off, the
  spaces list omits it and the route 404s.
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
  others → one **Report** action, whose dialog lists "This is me, please
  remove it" first; moderators → Restore/Remove on reported items.
  Visibility stays fixed.
- Non-members see only public items and the join prompt.

### Upload dialog (variant A)

One dialog: drop zone + "Choose files", thumbnails with remove, **Event**
select (with "Not from an event"), **Category** chips (single choice, can be
cleared), **Who can see these** (Members / Everyone, default Members), the
an optional **"Say something about these"** text (max 500; it becomes the
feed post's text, not the items' captions — per-item captions are added with
Edit details), the **magazine checkbox** (unticked) with the hint "Editors can only feature
photos with this ticked. People who can't see a members-only photo won't see it
in the magazine either.", Cancel and **Upload N**. Shows per-file progress;
conversion progress for video. If some files fail, the dialog says which and
lets the member retry or drop them.

### Feed post (collage)

- A new feed post kind, **gallery batch**: `feed-posts` gets a `galleryBatch`
  relationship → `gallery-batches`, unique (one post per batch, so a retried
  announcement can never make two). The post's `communityId`, `authorId` and
  optional caption come from the batch; `topicSlug` is the batch's topic or
  `general`.
- **Gallery feed posts are always `community` visibility** (settled 13 Nov,
  slice 2). A feed post's `public` lets outsiders read it without the
  community's own read rule, which the gallery's "Everyone" never bypasses. The
  collage's items still follow the gallery's read rule per viewer.
- The post is made by `closeBatch`'s announcement (`src/server/gallery/
  announce.ts`) — from `finishBatch` and from the daily cleanup alike — only if
  at least one item is ready and the uploader is still an active member who
  may post to the feed. It awards the same XP and logs the same activity as a
  normal post. It carries no @mentions (the upload dialog has no mention
  picker, and guessing members from typed names could notify the wrong
  person), and an "@everyone" in its caption is plain text: a gallery post
  never broadcasts to the community, even an owner's. If the announcement
  fails, the batch stays finished without a post (the items are in the
  gallery; nothing retries).
- The card renders a collage: first item large, two small, "+N" on the third.
  It shows the event as a link chip and the category badge. Clicking a tile
  opens the gallery lightbox for that batch. Each viewer sees only the batch's
  items they may read; with none left, the card shows its text only.
- Editing a gallery post can change its text (which may be empty) but never
  its media.
- Gallery items are owned by the gallery, not by the post:
  - Deleting the post leaves the items in the gallery.
  - Deleting the last visible item of a batch soft-deletes a post that has no
    text left (mirrors `unlinkFeedPostsBeforeMediaDelete`).
  - A moderator **removing** a reported gallery-batch post removes its items too
    (the report is about that content). **Restoring** the post leaves items as
    they are.
- The feed's "one media type per post" rules (`feed-post-rules.ts`,
  `post-media.ts`, the zod refines) treat `galleryBatch` as a media kind: a
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
- Settled 13 Nov (slice 3):
  - The shared rules live in one server module used by **both** feed post
    reports and gallery reports (feed behaviour unchanged); the moderator
    recipient query is shared too.
  - `GALLERY_REPORT_REASONS` = the feed's reasons + `this_is_me`; the feed's
    list and its database enum stay unchanged.
  - Anyone signed in who may read the item can report it, members or not —
    `this_is_me` matters most for people pictured who aren't members. The
    uploader can't report their own item (they delete it).
  - The first report hides the item through one guarded write (`hidden_at IS
    NULL`), so moderators are notified exactly once per hide; a restore and a
    new report notify again. `this_is_me` notifies the uploader on every such
    report (skipped for deleted accounts).
  - Notifications carry `metadata.reviewPath` (the gallery `?item=` link) and a
    link label, so the bell panel's button works.
  - A moderator's **Remove** goes through the same item-removal path as Delete
    (row, files, then releasing an emptied feed post); reports go with the item
    (`ON DELETE CASCADE`).
  - Items expose `hidden` to the viewers who can see a hidden item (moderators
    and the uploader); reporter identities never reach the client.

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
