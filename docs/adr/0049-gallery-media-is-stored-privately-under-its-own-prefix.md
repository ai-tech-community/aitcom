---
status: accepted
---

# Gallery media is stored in our S3 under its own prefixes, with its own records and cleanup

Community gallery photos and short videos (spec
`docs/superpowers/specs/2026-11-13-community-gallery-design.md`) are uploaded
**directly from the browser to our existing S3 bucket** through
`ObjectStorage`, under two gallery-only prefixes:
`media/gallery/public/<communityId>/` and `private/gallery/<communityId>/`.
Each file is owned by one `gallery-items` row that also tracks its upload
status. Members-only items are read through presigned GET links issued only to
viewers who may see them. Gallery cleanup (abandoned uploads, failed items, an
unused-files sweep) lives in `src/server/gallery/` and only ever looks at the
gallery prefixes.

## Context

- **Feed images are public by URL.** They go through Payload `Media`
  (`/api/upload`), which stores at the bucket root with
  `disablePayloadAccessControl` and `read: () => true`. A "members-only" gallery
  photo stored that way could be opened by anyone with the link.
- **Feed cleanup only knows feed posts.** The unused-image sweep is SQL over
  `feed_posts` with `purpose = 'feed-post'`; the #388 video sweep builds its
  "in use" set from feed posts and deletes everything else under the feed video
  prefixes after 7 days. Gallery files placed in either would be deleted.
- **Precedents.** ADR-0036 (feed short video in our S3, converted on the device,
  private prefix with presigned reads) and classroom materials (own prefix, own
  records with an upload status, own cleanup, a per-community allowance).

## Decision

1. Gallery files never go through Payload `Media`. Photos are shrunk in the
   browser (2048 px long side + 480 px thumbnail); videos use the ADR-0036
   on-device conversion. Both upload with presigned POST grants.
2. The item row is the record: it is created `uploading` with its keys before
   the grant is issued, becomes `ready` only after the server verifies the
   object, and is `failed` otherwise. There is no separate grants table.
3. `storage` (`public`/`private`) is fixed at creation from the item's
   visibility; moving files between prefixes is not supported.
4. Gallery cleanup and the production-only unused-files sweep cover the
   gallery prefixes only and build their "in use" set from `gallery-items`.
5. Gallery bytes count toward the community's media allowance, which moves from
   `src/server/classroom/` to `src/server/media/` as a shared module.

## Rejected alternatives

- **Payload `Media` with a new `purpose`.** Gets resized copies for free, but
  files would be public by URL, and `Media` is the public asset store for
  covers and logos.
- **Reuse the feed video grant flow (`video-uploads`).** Its finish step writes
  feed posts, its abandoned-upload cleanup and the #388 sweep check only feed
  posts, and the grant has no field for what it is for. Generalising it is a
  feed refactor of its own.
- **Server-side resizing.** Needs a worker and a processing state; the browser
  already does this for feed images and video.

## Consequences

- Members-only privacy depends on `private/` staying non-public in the bucket,
  the same operational prerequisite as ADR-0036.
- The unused-files sweep runs in production only (`ownsStorageContents`), as
  every environment shares the bucket.
- If gallery and feed ever share one media module, this ADR and ADR-0036 are
  the two inputs to merge.
