# Community short videos and Reels mode

**Status:** implemented (branch `feat/community-reels-build`, 2026-09-24; see [Implementation notes](#implementation-notes)) · **Date:** 2026-09-23 · **ADR:** [0036](../../adr/0036-short-video-is-transcoded-on-device-and-stored-in-our-s3.md)
**Depends on:** PR #326 (combined community activity feed) merged first.

## Goal

Members can post short videos in a community, next to everything else they post. Anyone viewing a community can switch into **Reels mode**: a full-screen, swipe-through player of that community's videos. The person posting decides who can see each video: **community only** or **public**.

Success looks like:

- A member records a 60-second demo on a phone and posts it in under a minute on mobile data.
- It plays on every current phone and desktop browser, including clips shot on an iPhone (HEVC).
- A visitor who isn't a member can watch a community's public videos and join from the player.
- A community-only video can't be watched by a non-member, even with a copied link.

## Decisions

| Decision | Chosen | Decided by |
|---|---|---|
| What videos are for | All of it: member demos, event clips, discovery | Product owner |
| Who sees a video | The poster picks **community only** (default) or **public**, per video | Product owner |
| How public videos go live | Immediately; anyone can report; a reported video is hidden until a moderator reviews it | Product owner |
| Where video is stored | Our existing S3 bucket, not a video platform (Mux was the marketplace default) | Product owner |
| Where video is converted | On the device, before upload (WebCodecs via Mediabunny) | Product owner |
| Where non-members see public videos | On that community's page only; no platform-wide feed yet | Product owner |

The storage and conversion choices are recorded in ADR-0036 with the rejected alternatives.

## Scope

**In:**

- Posting a video (≤ 90 s) as a feed post with a caption.
- Choosing visibility when posting.
- Inline playback in the feed.
- Reels mode for members and for visitors.
- Reporting and moderator review.
- Cleaning up abandoned uploads.

**Out (not in this version):**

- A platform-wide Reels feed.
- Server-side conversion as a fallback.
- Automatic content scanning.
- Captions and subtitles.
- Trimming or editing.
- Music.
- Changing visibility after posting (delete and repost instead).
- Search indexing of public videos.

The data model leaves room for a global feed and for server-side conversion later; neither needs a rework to add.

## User experience

### Posting (composer)

- A **video** button sits beside "Add image". A post has either one image or one video, not both.
- As soon as a clip is picked, before a caption is written:
  1. **Check:** the browser can convert video, the file can be read, and it is at most 90 s. A failed check shows its message at once ("Videos can be up to 90 seconds.", "We can't read this video. Try a different file.", or the browser message below). Nothing is uploaded.
- On **Post**:
  1. **Preparing** (on-device conversion) shows a progress bar and a Cancel button. The same checks run again here.
  2. **Uploading** shows a progress bar and a Cancel button.
  3. **Posting.**
  4. On success the post appears at the top of the feed.
  5. Each step is announced to screen readers through a status region.
- **Try again:** a failed upload or post shows "The video didn't upload. Please try again." with a **Try again** button that retries with the same caption and visibility. The retry skips conversion (the converted clip is kept) and reuses the upload grant while it is still valid (see [Errors and edge cases](#errors-and-edge-cases)).
- **Visibility** is a two-option control under the caption: **Community only** (default) · **Public — anyone with the link can watch**. The public label says plainly who can see it.
- **Browser can't convert:** "Your browser can't prepare videos. Update it or use a recent Chrome, Safari, Edge, or Firefox." Nothing is uploaded.
- **Posting rules:** the community's `feedPostPolicy` applies unchanged (all members, or admins only).

### In the feed

- A video post shows a 9:16 or original-ratio player with the thumbnail as its still image.
- It plays **muted** when at least 60% is on screen and pauses when scrolled away. Tap toggles sound; controls are visible on focus and hover.
- With `prefers-reduced-motion`, nothing autoplays: the thumbnail shows with a play button.
- Likes, comments, pin, edit caption, and delete work as for any post.

### Reels mode

- The entry point is a **Reels** button on the Overview, shown only when the community has at least one video the viewer may watch.
- The viewer is full screen, one video per screen, with vertical scroll snap.
  - **Controls:** swipe, mouse wheel, ↑/↓ keys, Esc to close.
  - The current video plays and preloads fully; the next one loads only its metadata; the rest show only their thumbnail.
- **Overlay:**
  - bottom left: author, caption (two lines, tap to expand), and a "Community only" or "Public" tag;
  - right side: like (count), comments (opens the post's comment sheet), copy link, report, and a mute toggle.
- **Visitors** (signed out, or not members) see public videos only. The header offers **Join** (the existing join button), and liking or commenting opens the existing sign-in / join gate (Gate-Before-Fail rule).
- Each video has a shareable deep link, `/communities/{slug}/reels?v={postId}`. A community-only link opened by a non-member shows "This video is for members" plus Join, never the video.

### Reporting and moderation

- **What can be reported:** any community post the viewer can see, text or video.
- **Who can report:** anyone signed in who can see the post, except its author, once per post.
- **Reasons:** spam, inappropriate, copyright, other (with an optional note).
- **What happens:** the first report hides the video at once for everyone except the author and the community's owners, admins, and moderators.
  - The author sees "Hidden while a moderator reviews a report."
  - Moderators see a **Reported** banner on the post with the reasons (never who reported), plus **Restore** (shows the post again and marks its open reports dismissed; the rows stay, so the same person can't report it twice) or **Remove** (deletes the post, its files, and its reports).
- Moderators are notified through the existing notification system. For a video the notice links to its reel (`/communities/{slug}/reels?v={postId}`); for a text post, to the community page.

## Architecture

### Posting flow

```
Browser                                   Server (tRPC)                    S3
  pick file
  canTranscode() + readVideoDuration(file) ≤ 90 s   (at pick time)
  transcodeForUpload → 720p MP4 + JPEG thumbnail   (on Post)
  ───────── feed.createVideoUpload ────────▶ member? may post? under daily limit?
                                            presigned POST × 2 (video, thumb)
  ◀──────── { uploadId, video, thumb } ─────
  ──────────────── POST video, thumbnail directly ──────────────────────────▶
  ───────── feed.finishVideoPost ──────────▶ HeadObject: exists, type, size
                                            create feed-post (+ video, visibility)
  ◀──────── { id } ─────────────────────────
```

- **Presigned POST, not PUT.** A POST policy enforces `content-length-range` and the exact `Content-Type` and key, so a client can't upload something bigger or different from what was granted. Links expire after 10 minutes.
- **`finishVideoPost` checks, and never trusts the client:**
  - Both objects exist, under the keys it issued for this `uploadId` and user.
  - The content type is `video/mp4` / `image/jpeg`, and the size is within limits.
  - Only then is the post created. It answers with the post id only, so storage keys never reach the client.
  - A missing, wrong, or oversize object is deleted with its grant, and the post is refused.
  - A finish retried after the post was created but before the grant was closed closes the grant and returns the same post.
  - Duration, width, and height come from the client (the device measured them after conversion). They're stored for layout only and are never used for access decisions.

### Storage layout and privacy

| Visibility | Key | How it is read |
|---|---|---|
| Public | `media/videos/public/{communityId}/{uploadId}.mp4` (+ `.jpg`) | Direct URL, same as images today |
| Community only | `private/videos/{communityId}/{uploadId}.mp4` (+ `.jpg`) | Presigned GET, issued only to active members; lives at least 1 hour from when it is served |

- Private playback links are issued inside the list queries (feed, activity, reels), per viewer, after the visibility check.
- A link is signed at the start of a 30-minute window (`PLAYBACK_LINK_WINDOW_SECONDS`) and lives one hour plus that window. Every refetch inside a window (a like, an edit, tab focus) returns the identical URL, so a playing video does not restart.
- On a load error the player asks the list for a fresh link once, then shows "Video unavailable" with **Try again**. A public video's link never changes, so its error shows "Video unavailable" at once.
- **The `private/` prefix must not be publicly readable.** The app's AWS credentials can't read the bucket policy, so this is a **launch prerequisite** checked by the owner in the AWS console (see Rollout).

### Data model

`feed-posts` (Payload collection), new fields:

- `video` (group, optional):
  - `key`, `thumbnailKey`, `storage` (`public` | `private`),
  - `durationSeconds`, `width`, `height`, `bytes`.
- `visibility`: `community` (default) | `public`. Only posts with a video may be `public`. Text and image posts stay `community`.
- `hiddenAt` (date, optional): set by the first report, cleared by Restore.
- `reportCount` (number): open reports, for the server only. It is not part of the post view sent to clients; moderators read reports through `getPostReports`.

`post-reports` (new Payload collection):

- `post` (relation), `reporterId`, `reason` (`spam` | `inappropriate` | `copyright` | `other`, from `REPORT_REASONS`), `note` (≤ 500), `dismissedAt` (set by Restore), `createdAt`.
- Unique on (`post`, `reporterId`).

`video-uploads` (new Payload collection) tracks issued uploads until they're finished:

- `uploadId`, `userId`, `communityId`, `visibility`, `createdAt`, `finishedAt`.
- It lets `finishVideoPost` check ownership, and the cleanup job find abandoned files.

A hand-written migration in `src/migrations/` adds these, applied with `db:apply` in the same window as the deploy.

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/lib/video-rules.ts` | Pure limits and names: `MAX_VIDEO_SECONDS = 90`, `MAX_VIDEO_BYTES` (40 MB), `MAX_THUMB_BYTES` (512 KB), output size (long side 1280, ≤ 30 fps, ~2.5 Mbps), grant and link lifetimes, `VIDEO_VISIBILITIES`, key builders (`videoObjectKeys`), `fitWithin` | nothing |
| `src/lib/post-report-reasons.ts` | `REPORT_REASONS` and admin labels, shared by server, client, and the Payload collection | nothing |
| `src/lib/video-transcode.ts` (browser only) | `canTranscode()`, `readVideoDuration(file)`, `transcodeForUpload(file, { onProgress, signal })` → `{ video: Blob, thumbnail: Blob, durationSeconds, width, height }` | Mediabunny, WebCodecs, `video-rules` |
| `src/server/media/video-storage.ts` | The **only** S3 code for video: `presignUpload`, `inspect`, `playbackUrl(key, storage)` (public URL, or a presigned GET signed per 30-minute window), `remove` | AWS SDK, `video-rules` |
| `src/server/communities/post-visibility.ts` | The one visibility rule: `postVisibilityWhere` (lists) and `canViewPost` (one post). Hidden posts only for author + moderators; community-only only for members | — |
| `src/server/communities/feed-posts.ts` | `requireActiveFeedMember`, `requireFeedPoster`, `requireViewablePost` (one post by id through the visibility rule, for likes, comments, and the agent API), `decorateFeedPosts` (post view: playback links, no storage keys, no `reportCount`) | `post-visibility`, `video-storage` |
| `src/server/communities/video-posts.ts` | `issueVideoUpload` (daily limit, grant), `finishVideoPost`, post-video file cleanup | `video-storage`, `video-rules` |
| `src/server/communities/reels.ts` / `post-reports.ts` | `listReels` (paging, deep-link notice); `reportPost`, `reviewReport`, `listPostReports` | `post-visibility`, `feed-posts` |
| `feed` router additions | `createVideoUpload`, `finishVideoPost`, `getReels`, `reportPost`, `getPostReports`, `reviewReport` | the units above |
| `activity-feed.ts` / `getFeed` | Apply `post-visibility`; attach playback links to video posts | `post-visibility`, `feed-posts` |
| `src/app/api/cron/video-uploads-cleanup` | Daily: delete S3 objects for uploads not finished within 24 h (oldest first, S3 reached only when needed) | `video-storage` |
| UI: `post-composer`, `video-attachment`, `use-video-post`, `feed-video-player`, `reels/*`, `report-dialog`, `reported-banner` | Presentation and interaction only; no S3 or rule logic | tRPC, `video-transcode` |

`getReels` takes `{ communitySlug, limit, cursor, startAtPostId }` (cursor `{ createdAt, id }`, an ISO date-time and a whole number) and pages video posts newest first with the same exclusive-cursor pattern as the activity feed:

- Members get all visible videos.
- Everyone else gets public, non-hidden videos only. It's a `publicProcedure` whose filter depends on whether the viewer is a member.
- A `startAtPostId` deep link the viewer may not open returns a notice instead of a video: `members_only` or `unavailable`.
- It returns nothing while the flag is off.

## Errors and edge cases

| Situation | Behaviour |
|---|---|
| Browser can't encode H.264 | Message on pick, before any work; nothing uploaded |
| Clip > 90 s, or a file that can't be read | Message on pick, before converting; nothing uploaded |
| Conversion fails | Message ("We can't read this video…"); nothing uploaded; pick another file |
| Conversion or upload is cancelled | Back to the composer with no error; the converted clip is kept for the next Post, with a new upload grant |
| Upload fails mid-way | **Try again** keeps the converted clip and re-sends to the same presigned POST while it has more than a minute left and the visibility is unchanged; otherwise it requests a new one. Abandoned objects are removed by the daily cleanup |
| Creating the post fails | **Try again** keeps the converted clip and requests a new grant (the server may have used or removed the old one) |
| Removing or replacing the picked clip | The converted clip and the grant are forgotten |
| `finishVideoPost` finds a missing, wrong, or oversize object | Rejects with a plain message; the objects and the grant are deleted (a storage failure here is logged, not shown) |
| `finishVideoPost` retried after the post was created | Closes the grant and returns the same post |
| Presigned playback link expired | The player asks for a fresh link once, then shows "Video unavailable" with **Try again** (reload + one more fresh-link request) |
| A public video fails to load | "Video unavailable" at once, with **Try again** (its link never changes) |
| Too many uploads | 20 video posts per user per day across communities → friendly limit message (keeps storage cost bounded) |
| Post deleted, or Remove after a report | The post and both S3 objects are deleted |
| Member leaves a community | Their community-only videos stay (like their posts); they lose access to others' community-only videos |
| Reporting your own post, or reporting twice | Not offered / rejected |
| Liking, commenting on, or reading comments of a post the viewer can't see (hidden, or community-only for a non-member) | NOT_FOUND; liking and commenting also need an active membership |

## Accessibility

- Every control is a real button with a label: mute, like, comments, copy link, report, close.
- Reels mode is a modal dialog: it traps focus and closes on Esc. Reels is its own page (`/communities/{slug}/reels`), so closing navigates back to the community page, and focus starts at the top of that page rather than returning to the Reels button.
- Composer steps (preparing, uploading, posting) are announced through a status region (WCAG 4.1.3).
- Autoplay is always muted and never runs under `prefers-reduced-motion`.
- Captions are out of scope for v1. The caption text is shown and readable by screen readers.
- Player overlays keep 4.5:1 contrast with a gradient scrim behind the text.

## Cost

A converted 60 s clip is about 20–25 MB.

- **Storage:** about €0.0006 per video per month.
- **Viewing:** about €0.002 per full view (S3 egress, eu-central-1).
- The 20/day upload limit bounds storage growth.
- If views grow a lot, putting a CDN in front of `media/` and `private/` is the next step. That's a hosting change, not a design change.

## Security review

- Upload grants are narrow: one key, one content type, a size range, and 10 minutes.
- Access decisions never use client-supplied metadata.
- Private objects are only reachable through short-lived links (at most 90 minutes) issued after the visibility check.
- Storage keys and report counts never reach the client.
- Likes and comments go through the same visibility rule as every list.
- Moderation hides content everywhere through one shared filter, so no list can forget it.

## Testing

- **Pure unit tests:** `video-rules` (limits, key builders, `fitWithin`) and `post-visibility` (every viewer role × visibility × hidden state).
- **`video-storage`:** policy conditions on presigned POST (size range, type, key), public vs presigned playback URLs, and the stable signing window, against a mocked S3 client.
- **Router and service tests:**
  - `finishVideoPost` rejects wrong owner, missing object, wrong type, and oversize; answers with the id only; is safe to retry.
  - `getReels` returns only public, non-hidden videos to visitors and all visible videos to members, and refuses a bad cursor.
  - `reportPost` hides the post, is unique per reporter, can't target your own post, and links the moderator notice to the reel for a video.
  - `toggleLike`, `getComments`, and `addComment` apply the visibility rule.
- **`video-transcode`:** unit-tested against a mocked Mediabunny (WebCodecs isn't available in jsdom). Real conversion is covered by the manual device check below.
- **Components:** composer states (pick-time check, preparing / uploading / error / Try again / unsupported), upload retry reuse; player autoplay rules, including reduced motion, and Try again; reels keyboard navigation, preloading, the visitor view, and the members-only deep link.
- **Manual before launch:** an iPhone HEVC clip and an Android clip, posted and played on iPhone Safari, Android Chrome, and desktop Chrome, Safari, and Firefox.

## Rollout

1. Merge PR #326, then build behind the `NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS` flag (`"true" | "false"`, default `"false"`): it gates the composer's video button, the Reels entry point, `createVideoUpload` (refused when off), and `getReels` (empty when off). Remove the flag once the feature is final.
2. **Owner prerequisites in AWS:**
   - (a) Add a CORS rule allowing `POST` from the site origins to the bucket.
   - (b) Confirm `private/` is not publicly readable: bucket policy and public access settings.
   - (c) Grant the app's IAM user `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` on `media/videos/*` and `private/videos/*`.
3. Run the migration in the same window as the deploy.
4. Turn the flag on for one pilot deployment first, then for everyone. The flag is read at build time, so it is set per deployment, not per community.

## Implementation notes

The body above describes what was built. These notes record where the build moved away from the first draft of this spec (2026-09-24):

- **Restore dismisses, not clears.** (First draft: Restore clears reports.) Restore sets `dismissedAt` on the open reports and keeps the rows, so one person still can't report the same post twice after a restore. Only open reports hide a post, count, or show to moderators. Remove still deletes the reports.
- **Moderator reasons query.** A moderator-only `feed.getPostReports({ postId })` returns `{ reason, note, createdAt }[]` (never the reporter) for the Reported banner.
- **Reports cover every post.** `reportPost` works on any community post the viewer can see, text or video, and is not behind the feature flag.
- **One by-id visibility check.** `agent-feed` (`browseFeed`, `getFeedComments`, like, comment) and the member feed's `toggleLike`, `getComments`, and `addComment` share `requireViewablePost`, with a viewer derived from the member (or the agent owner's) membership; unclaimed agents and non-member owners see public posts only. Agent drafts use `canPostToFeed`.
- **Double-finish guard.** `feed_posts.video_key` has a unique index, so two concurrent `finishVideoPost` calls can't both create a post.
- **Finish window 23 h.** `finishVideoPost` refuses grants older than `FINISH_WINDOW_HOURS` (`ABANDONED_UPLOAD_HOURS − 1`), so it never races the daily cleanup on the same grant.
- **Cleanup skips owned files.** A stale grant whose video key a post already owns is marked finished, not deleted.
- **Upload limit counts grants.** The 20/day limit is checked in `createVideoUpload` and counts upload grants, not finished posts.
- **Storage API names.** (First draft: `presignVideoUpload`, `verifyUploadedObject`, `deleteVideo`.) `video-storage.ts` exposes `presignUpload`, `inspect`, `playbackUrl`, and `remove` (throws on partial `DeleteObjects` errors). `canBePublic` wasn't built: only `createVideoUpload` accepts `public`, and `createPost` and agent drafts write `community`.
- **Stable private links.** (First draft: a 1-hour link per request.) Links are signed per 30-minute window and live 90 minutes, so refetches don't restart a playing video.
- **Pick-time checks.** (First draft: `checkVideoFile`.) `canTranscode` and `readVideoDuration` run when a clip is picked; `transcodeForUpload` repeats them.
- **Writes answer with `{ id }`.** `finishVideoPost`, `editPost`, and `deletePost` no longer return the stored post, which carried the video's storage keys.
- **`getReels` input.** (First draft: `{ communitySlug, cursor, startAt? }`.) `{ communitySlug, limit, cursor, startAtPostId }`; a blocked deep link returns a `members_only` or `unavailable` notice. It returns nothing while the flag is off.
- **Reels entry for everyone.** The Reels button sits above the member/visitor split on the community home, so visitors reach it too.
- **Reels comments.** Comments open the existing `FeedComments` in a sheet for members; visitors get the sign-in / join gate.
- **Extra error copy.** The composer tells "browser can't convert" (`unsupported`) apart from "this file can't be read" (`unreadable`: "We can't read this video. Try a different file.").
- **Flag is per deployment.** (First draft: a `communityVideos` flag, turned on for one community first.) The flag is `NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS`, set at build time, so the pilot is one preview or pilot deployment, not one community.
- **Transcode tests are mocked.** (First draft: real-browser fixture tests.) `video-transcode.ts` is unit-tested against a mocked Mediabunny. Real-browser checks are the manual device checklist.
- **Reels close navigates.** (First draft: focus returns to the Reels button.) Reels is its own page, so closing goes back to the community page.
