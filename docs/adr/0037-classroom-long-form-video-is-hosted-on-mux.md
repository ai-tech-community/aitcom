---
status: proposed
---

# Classroom long-form video is hosted on Mux; embeds stay the default

Classroom lessons can now carry **hosted material**: video on **Mux** and
files in our own S3 bucket. This amends
[[adr-0027-classroom-is-member-authored-ordered-curriculum]], which said
"no native video hosting". It also narrows
[[adr-0036-short-video-is-transcoded-on-device-and-stored-in-our-s3]] to
short video (feed posts, Reels). ADR-0036 still governs short video.

**Embeds come first.** A trainer who already has the video on YouTube, Loom
or Vimeo, or the slides in Google Slides, pastes a link. Hosting is a
deliberate fallback. It is metered by a per-community allowance and is the
natural thing to charge for later.

Design: `docs/superpowers/specs/2026-09-27-classroom-lesson-materials-design.md`.

## Why Mux for classroom video

ADR-0036 named the trigger for moving to Mux: "if adaptive streaming or
analytics become necessary". Training video meets that trigger:

- **Length.** A 45-minute 1080p recording is too big to transcode in the
  browser. The tab would have to stay open for many minutes, and weaker
  laptops fail.
- **Adaptive streaming.** A single-rendition MP4 stalls on slow
  connections. Mux serves adaptive HLS up to 1080p, and "basic" quality
  encoding is free.
- **Protected playback.** Assets use the signed playback policy only.
  Tokens are minted per viewer after a course access check.
- **Cost.** At list price, 1 hour stored costs ≈ $0.18/month. The first
  100,000 minutes delivered per month are free account-wide; after that,
  1 hour viewed costs ≈ $0.06.

Only `src/server/classroom/mux-video-host.ts` imports Mux. It sits behind
a `VideoHost` port, so changing provider changes one file.

## Why our S3 for files

Files need no transcoding. The bucket, the presigned-POST upload and the
private-prefix pattern already exist for Reels. The video-only storage
module becomes a general object-storage module that both use.

## Decisions

- Hosted material is a first-class record owned by a course. Lesson bodies
  reference it by id; embeds are plain blocks with no record.
- Who may upload: the community's `classroomUploadPolicy`, default
  `admins_only`.
- Visibility for each item: `members` (default) or `preview` (watchable by
  visitors of a public course).
- Watch tracking uses 5-second slices with a server-side plausibility
  clamp. A lesson's optional `requiredWatchPercent` gates completion. It
  never grants XP, consistent with
  [[adr-0028-lesson-exam-gates-completion-not-reputation]].
- Allowance per community (5 h video, 5 GB files, 20,000 viewing
  min/month). Storage is a hard limit; viewing is soft (notify, never
  block). `allowanceFor()` is the single seam for paid plans.

## Rejected

- **Extending ADR-0036 to long video:** in-browser transcoding of long
  recordings is fragile, and a single rendition stalls on slow
  connections.
- **Server-side ffmpeg + our own HLS:** we would be building and running a
  video platform.
- **Vercel Blob for files:** it adds a second storage location and gains
  nothing over the bucket we already run.
- **Hosting as the default path:** it costs money for no benefit when the
  material already lives elsewhere.
