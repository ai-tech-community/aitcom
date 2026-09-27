# Classroom lesson materials — design

**Date:** 2026-09-27
**Status:** proposed
**Decision record:** [ADR-0037](../../adr/0037-classroom-long-form-video-is-hosted-on-mux.md)
**Prerequisite:** #351 (members-only courses readable by non-members)

## Goal

Trainers can build a complete training inside a lesson — slides, videos,
documents, worksheets — without sending learners to other sites to piece it
together. Learners get smooth playback on any connection, and trainers can
require a video to be genuinely watched before a lesson counts as done.

**Stance on hosting:** embeds come first. Most trainers already keep video on
YouTube, Loom or Vimeo and slides in Google Slides; pasting a link costs the
community nothing. Hosting (video on Mux, files on our S3) is the supported
fallback for material that has no other home or must stay members-only. It is
metered per community today and is the natural thing to charge for later.

## Decisions (settled in brainstorming)

| Topic | Decision |
|---|---|
| Who may upload hosted material | New per-community setting `classroomUploadPolicy`: `admins_only` (**default**) or `all_members` |
| Who pays | Platform, within a per-community **allowance**; the allowance module is the seam for paid plans later |
| Watch requirement | Per lesson, optional `requiredWatchPercent`; when set, the server refuses completion until met (same shape as a mandatory exam) |
| Hosted material in public courses | Each hosted material is `members` (**default**) or `preview`; non-members of a public course only get `preview` material |
| Structure | Uploaded material is a first-class record; the lesson body holds blocks that reference it; embeds are plain blocks with no record |
| Video host | **Mux** for classroom video (long-form); feed/Reels short video stays on ADR-0036's device-transcoded S3 path |
| File storage | Our existing S3 bucket, private prefix, same presigned-POST pattern as Reels |
| Viewing limit | Soft: notify at 80% and 100%, never block playback |
| Storage limit | Hard: refuse new uploads at the limit |

## Glossary additions

- **Lesson material** — any material block inside a lesson body: an *embed*,
  a *hosted video* or a *hosted file*.
- **Embed** — a link to material on an allowed external provider, shown in
  place. No record, no storage, no allowance use.
- **Hosted material** — an uploaded video or file we store (video on Mux,
  file on S3). Has a record, belongs to a course, counts against the
  community allowance, and carries a visibility (`members` | `preview`).
- **Watch progress** — per enrolled learner per hosted video: which 5-second
  slices were played, and the last position.
- **Media allowance** — a community's limits for stored video, stored files
  and monthly viewing.

These go into `CONTEXT.md` in this PR.

## Slices

Each slice gets its own implementation plan and PR, in this order:

0. **Course access policy** (#351) — the single gatekeeper; fixes the
   existing leak. Everything below depends on it.
1. **Lesson materials + embeds** — the block model, provider registry,
   renderer seam, editor "Add material" menu, `youtubeUrl` → Embed migration.
2. **Hosted files** — `HostedMaterials` collection, generalised object
   storage, upload policy setting, file allowance, usage bar.
3. **Hosted video** — Mux video host, webhook, Mux Player, signed playback,
   video allowance, viewing counter + notices, cleanup.
4. **Watch tracking + watch requirement** — slice reports, cheat clamp,
   resume, completion gate, trainer stats.

Slices 1 and 2 ship value on their own. Slice 3 needs the Mux account
configured (see *Setup*).

---

## 1. Course access policy (prerequisite, #351)

`src/server/classroom/course-access.ts`

```ts
export type CourseAccess = "none" | "visitor" | "member" | "manager";

export function resolveCourseAccess(input: {
  course: { status: string; isPublic: boolean; authorId: string };
  viewerId: string | null;
  membership: { role: CommunityRole; active: boolean } | null;
}): CourseAccess;
```

| Viewer | Draft/archived | Published, members-only | Published, public |
|---|---|---|---|
| Author | manager | manager | manager |
| Community owner/admin/moderator | manager | manager | manager |
| Active member | none | member | member |
| Anyone else | none | none | visitor |

A pure function (the table above is its test), plus one server helper that
loads the course and membership and returns the level. **Every** classroom
entry point calls it: `classrooms.get`, material playback/download links,
watch reports, trainer stats. `none` → `NOT_FOUND` (never reveal a
members-only course exists).

`visitor` sees the course outline, lesson text and embeds; hosted material
with visibility `preview`; hosted `members` material renders a "Join the
community to watch" card.

## 2. Data model

All schema changes ship as hand-written migrations in `src/migrations/`
(applied with `db:apply` in the same window as the code deploy — never
`db:push`). Regenerate `payload-types.ts` after collection changes.

### 2.1 `hosted-materials` (Payload collection)

| Field | Type | Notes |
|---|---|---|
| `communityId` | text, indexed | owner community (allowance accounting) |
| `course` | number, indexed | `courses.id`; material belongs to a course, reusable across its lessons |
| `uploaderId` | text | Better Auth user id |
| `kind` | select `video` \| `file` | |
| `status` | select `uploading` \| `processing` \| `ready` \| `failed` | files skip `processing` |
| `failureReason` | text | shown to the trainer |
| `title` | text, ≤200 | defaults to the file name |
| `visibility` | select `members` \| `preview` | default `members` |
| `bytes` | number | verified server-side, never client-trusted |
| `durationSeconds` | number | video only, from Mux |
| `contentType` | text | files: verified via S3 HEAD |
| `storageKey` | text | files: S3 object key under `private/classroom/…` |
| `muxUploadId` | text, indexed | video |
| `muxAssetId` | text, indexed | video |
| `muxPlaybackId` | text | video, **signed** playback policy only |
| `processingSince` | date | for the reconcile safety net |

Deleting a course deletes its hosted materials (records and remote objects).

### 2.2 Drizzle tables (`app` schema)

```
video_watch_progress
  user_id            text      not null
  material_id        integer   not null   -- hosted-materials.id
  course_id          integer   not null
  slice_seconds      smallint  not null   -- 5; stored so a future change doesn't corrupt old rows
  watched_slices     bytea     not null   -- bitset, bit i = slice i played
  watched_count      integer   not null   -- popcount, kept for cheap queries
  total_slices       integer   not null
  last_position_s    integer   not null
  last_report_at     timestamptz not null
  primary key (user_id, material_id)

community_media_usage
  community_id       text      not null
  month              date      not null   -- first day of the month, UTC
  viewing_seconds    bigint    not null default 0
  notified_80        boolean   not null default false
  notified_100       boolean   not null default false
  primary key (community_id, month)
```

### 2.3 Changes to existing records

- `lessons.requiredWatchPercent` — number 1–100, nullable (null = no
  requirement).
- `lessons.youtubeUrl` — **removed** (expand/contract, see 3.4).
- `communities.classroomUploadPolicy` — varchar(30), not null, default
  `admins_only`, type `"all_members" | "admins_only"`. `admins_only` means
  owner or admin (moderators excluded, matching `classroomCreatePolicy`).

## 3. Lesson materials and embeds (slice 1)

### 3.1 Material kinds registry

The known pattern here is a **registry of strategies**: each material kind
owns its validation, its embed-URL construction and its rendering. Adding a
kind (e.g. Miro) is one new entry; no switch statements spread across the
editor, renderer and server.

`src/lib/classroom/embed-providers.ts` (pure, shared by client and server):

```ts
export type EmbedProvider = {
  id: "youtube" | "vimeo" | "loom" | "google-slides" | "google-docs"
    | "google-sheets" | "google-drive" | "figma";
  label: string;
  /** Parse an author-pasted URL. Returns null if it isn't this provider. */
  parse(url: URL): { embedSrc: string; aspect: "16:9" | "4:3" | "page" } | null;
  /** Shown in the editor: what sharing setting the source needs. */
  sharingHint: string | null;
};
export function resolveEmbed(raw: string): ResolvedEmbed | null;
```

Rules:
- `embedSrc` is **always built by us** from parsed IDs onto a fixed host
  (`www.youtube-nocookie.com/embed/…`, `player.vimeo.com/video/…`,
  `www.loom.com/embed/…`, `docs.google.com/presentation/d/<id>/embed`,
  `drive.google.com/file/d/<id>/preview`, `www.figma.com/embed?…`). The raw
  author URL never reaches an `src`.
- Unknown hosts are rejected in the editor ("This site can't be embedded —
  add it as a resource link instead").
- The server re-resolves every Embed block on lesson save; an unresolvable
  block fails validation. The client check is convenience, the server check
  is the rule.
- Iframes render with `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`,
  `referrerpolicy="strict-origin-when-cross-origin"`, `loading="lazy"`, and
  an accessible `title`.
- Google providers carry a `sharingHint`: the file must be shared "Anyone
  with the link" (or published to the web) to embed. Shown in the editor
  next to the preview.
- Replaces `youtubeEmbedUrl` in `src/lib/classroom.ts`.

### 3.2 Lexical blocks

Added to the `Lessons` body `BlocksFeature`:

| Block slug | Fields |
|---|---|
| `Embed` | `url` (the author's original, for re-editing) |
| `HostedVideo` | `materialId` |
| `HostedFile` | `materialId` |

Blocks store references only. Status, visibility, playback IDs and URLs are
resolved at read time, so changing a material's visibility or deleting it
never requires rewriting lesson bodies.

### 3.3 Renderer seam

`src/lib/lexical.tsx` is shared with forum and launchpad. It gains an
optional `blockRenderers?: Record<string, (fields) => ReactNode>` prop;
unknown block types render nothing (today's behaviour). The classroom passes
its renderers from `src/components/classroom/materials/`; forum and
launchpad pass none, so classroom blocks can never render there.

Hosted blocks render from a per-lesson **materials manifest** returned by
`classrooms.get`: `{ [materialId]: { kind, title, status, visibility, durationSeconds, bytes, contentType, access: "play" | "join" | "processing" | "failed" | "removed" } }`.
Playback tokens and download links are **not** in the manifest; they're
fetched on demand (see 5.3, 4.3) so page loads don't mint credentials for
every material.

### 3.4 `youtubeUrl` migration (expand/contract)

1. Migration A (with slice 1 deploy): for every lesson with a `youtubeUrl`,
   prepend an `Embed` block with that URL to the body. The code stops
   reading/writing `youtubeUrl`.
2. Migration B (a later deploy, once A is verified in prod): drop the column.

### 3.5 Editor

`lesson-editor.tsx` gets an **Add material** menu inserting at the cursor:

1. **Paste a link** (primary) — URL field, live preview, sharing hint.
2. **Upload a file** — shown only if the viewer may upload (policy).
3. **Upload a video** — secondary; shown only if the viewer may upload;
   carries the nudge copy: *"Already on YouTube or Loom? Paste the link — it's
   faster and doesn't use your community's storage."*
4. **Reuse from this course** — pick an existing hosted material.

The old single "YouTube URL" input is removed. Resource links stay as they
are (they're a list of links, not in-place material).

## 4. Hosted files (slice 2)

### 4.1 Object storage generalisation

`src/server/media/video-storage.ts` becomes `object-storage.ts`
(`ObjectStorage`: `presignUpload`, `inspect`, `signedGetUrl`, `publicUrl`,
`remove`). Reels' video posts keep their key layout and limits (`video-rules.ts`
unchanged); classroom files add `src/lib/classroom/material-rules.ts` with
their own key builder:
`private/classroom/<communityId>/<courseId>/<uploadId>.<ext>`.
Existing Reels tests must pass unchanged — that's the proof the refactor is
behaviour-neutral.

### 4.2 Upload flow

1. `classroomMaterials.startFileUpload({ courseId, fileName, contentType, bytes })`
   — checks: the viewer may edit this course (today: its author, as in
   `updateLesson`) **and** `classroomUploadPolicy` allows them; allowed
   type; size ≤ 200 MB; allowance headroom. Creates the record
   (`uploading`) and returns a presigned POST (content-length-range and
   content-type pinned).
2. Browser POSTs directly to S3.
3. `classroomMaterials.finishFileUpload({ materialId })` — HEAD the object;
   verify it exists, type and size match and are within limits; set
   `bytes`, `status: ready`. Mismatch → delete the object, `failed`.

Allowed types: PDF, PPTX/PPT, DOCX/DOC, XLSX/XLS/CSV, Keynote, ZIP, PNG,
JPEG, WebP. PDFs render inline in the lesson (`<iframe>` on a signed link);
everything else renders as a download card (icon, title, size).

### 4.3 Download

`classroomMaterials.fileLink({ materialId })` → access check (member, or
visitor + `preview`) → presigned GET, 1 hour, `Content-Disposition` with
the material title.

## 5. Hosted video on Mux (slice 3)

### 5.1 Video host port

`src/server/classroom/video-host.ts`:

```ts
export type VideoHost = {
  createUpload(input: { materialId: number; corsOrigin: string }): Promise<{ uploadId: string; url: string }>;
  getAsset(assetId: string): Promise<{ status: "preparing" | "ready" | "errored"; durationSeconds: number | null; playbackId: string | null; error: string | null }>;
  cancelUpload(uploadId: string): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
  playbackTokens(playbackId: string, ttlSeconds: number): { video: string; thumbnail: string; storyboard: string };
  parseWebhook(rawBody: string, headers: Headers): VideoHostEvent; // throws on bad signature
};
```

`mux-video-host.ts` implements it with `@mux/mux-node`. Only this file
imports Mux. Tests use an in-memory fake implementing the same type.

Asset settings: `playback_policies: ["signed"]`, `video_quality: "basic"`
(free encoding, adaptive up to 1080p), `passthrough: <materialId>`.

### 5.2 Upload and processing

1. `classroomMaterials.startVideoUpload({ courseId, fileName, bytes })` —
   same checks as files; size ≤ 10 GB; allowance headroom uses a
   conservative estimate until the real duration is known. Creates the
   record (`uploading`) and a Mux direct upload (`cors_origin` = site
   origin, `timeout` 1 hour). Returns the upload URL.
2. Browser uploads with **UpChunk** (resumable, chunked). The trainer sees a
   progress bar and may leave once it reaches 100%.
3. `POST /api/webhooks/mux` — verify signature, then:
   - `video.upload.asset_created` → store `muxAssetId`, `processing`,
     `processingSince = now`
   - `video.asset.ready` → `durationSeconds`, `muxPlaybackId`, `ready`.
     If the real duration exceeds 4 hours or pushes the community over its
     video allowance → delete the asset, `failed` with a clear reason.
   - `video.asset.errored` / `video.upload.cancelled` → `failed`
   Handlers look up the record by `passthrough`/ids and are idempotent:
   status only moves forward, repeats are no-ops.
4. **Reconcile:** any read that sees `processing` older than 15 minutes
   calls `getAsset` and applies the same transition.
5. **Cleanup:** the existing daily cleanup cron also handles classroom
   materials stuck in `uploading` for over 24 hours (cancel Mux upload /
   delete S3 object, then delete the record).

### 5.3 Playback

`classroomMaterials.playback({ materialId })` → access check (member, or
visitor + `preview`) → signed JWTs for video, thumbnail and storyboard.
Token lifetime = `max(2h, duration + 1h)` so long lessons never cut off,
signed at the start of a fixed window (as Reels do) so refetches return the
same token and a playing video is not reloaded.

Rendered with `@mux/mux-player-react`: adaptive streaming, poster,
thumbnails on scrub, speed control, keyboard access, captions if present.

## 6. Watch tracking and requirement (slice 4)

### 6.1 Reporting

- Slice size **5 s**. The client marks slice `i` as played when playback
  time passes through it while playing (seeks do not mark skipped slices).
- The client batches newly played slice indices and the current position:
  every ~15 s while playing, and on pause, end and `pagehide`
  (`navigator.sendBeacon` to a route handler that calls the same service).
- `classroomMaterials.reportWatch({ materialId, slices: number[], position })`.
- **Every** viewer's report adds the wall-clock-plausible seconds to
  `community_media_usage` (the viewing counter, §7). Only **enrolled**
  learners get `video_watch_progress` rows.

### 6.2 Server clamp (the cheat guard)

`src/lib/classroom/watch-slices.ts` (pure):

```
allowedNew = ceil((now - lastReportAt) * MAX_RATE / sliceSeconds) + GRACE_SLICES
  MAX_RATE = 2 (2× playback speed), GRACE_SLICES = 3
```

New slices beyond `allowedNew` are dropped (lowest indices first kept). A
first report is measured from the playback-token issue time. This makes a
forged "I watched everything" request worth at most what real playback
could have produced.

Honest limit: a background tab playing the video counts as watched. The
requirement proves the video was played, not understood, which is why it
gates completion only and never grants XP.

### 6.3 Completion gate

`markLessonComplete` (server) refuses when the lesson has
`requiredWatchPercent` and any **ready** hosted video in the lesson body
has `watched_count / total_slices * 100 < requiredWatchPercent` for this
learner. Combined with a mandatory exam, both must hold. The response names
what's missing so the UI can say *"Watch 90% of 'Intro to Grok bots'
(now 62%)"*.

Existing completions are never revoked when a trainer adds a video or
raises the percentage (same as exams).

Course pass and the existing course certificate follow from lesson
completions, so the gate flows into them with no certificate change: a
learner can't pass the course, or receive its certificate, while a
watch-required lesson is incomplete.

### 6.4 Resume and trainer stats

- The player seeks to `last_position_s` on load ("Continue where you left
  off", dismissible).
- `classroomMaterials.videoStats({ courseId })` (manager only): per video —
  enrolled learners who started, who reached the lesson's requirement,
  average percent watched.

## 7. Media allowance (slices 2–3)

`src/lib/classroom/material-rules.ts` holds the per-item limits;
`src/server/classroom/media-allowance.ts` holds the per-community allowance:

```ts
export type MediaAllowance = {
  videoSecondsStored: number;      // default 5 h = 18_000
  fileBytesStored: number;         // default 5 GB
  viewingSecondsPerMonth: number;  // default 20_000 min = 1_200_000
};
export async function allowanceFor(communityId: string): Promise<MediaAllowance>;
export async function usageFor(communityId: string): Promise<MediaUsage>;
```

Today `allowanceFor` returns the defaults. **Paid plans later change only
this function.** Upload checks, notices and the settings usage bar all read
from it.

- Storage usage = sums over `hosted-materials` with status in
  (`uploading`, `processing`, `ready`) — exact, no external calls.
- Storage limit is **hard**: uploads are refused past it; existing material
  keeps working.
- Viewing is **soft**: when `viewing_seconds` crosses 80% and 100% of the
  monthly allowance, email the community owners/admins (existing
  notifications/mail module, respecting mail prefs) and the platform
  owner, once each per month (`notified_80` / `notified_100`). Playback is
  never blocked.

Per-item limits: video ≤ 4 h and ≤ 10 GB; file ≤ 200 MB.

**Cost at list price** (Mux pay-as-you-go, 2026-09): encoding free
(basic, ≤1080p); storage $0.003/min/month (1 h ≈ $0.18/month); delivery
first 100,000 min/month free account-wide, then $0.001/min (1 h viewed ≈
$0.06); $20/month usage credit. A community at its full default allowance
costs at most ≈ $0.90/month storage + ≈ $20/month viewing beyond the free
tier. S3 files at 5 GB ≈ $0.12/month plus download egress.

Classroom settings shows admins a usage bar: video hours, file GB, viewing
this month.

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Upload interrupted | UpChunk resumes; S3 files restart (≤200 MB) |
| Upload never finished | Daily cleanup removes it after 24 h |
| Webhook lost | Reconcile on read after 15 min in `processing` |
| Webhook repeated / out of order | Forward-only status; no-op |
| Bad webhook signature | 400, logged, no state change |
| Mux processing failed | `failed` + reason shown to the trainer, with "try again" |
| Material deleted but still referenced | Block renders "This material was removed" |
| Embed URL from unknown site | Rejected in editor and on save |
| Mux/S3 unreachable at playback | Player error state with retry; lesson text still renders |
| Allowance exceeded | Clear message naming the limit; no partial upload |

## 9. Testing

- **Pure unit tests:** `resolveCourseAccess` (full matrix), every embed
  provider (valid URLs, lookalike hosts such as `youtube.com.evil.test`,
  malformed input), slice clamp, percent math, allowance arithmetic, key
  builders (path-escape attempts).
- **Router integration tests:** access matrix on `get`, `playback`,
  `fileLink`, `reportWatch`; `markLessonComplete` refuses below the watch
  requirement and accepts at it (assert on the refusal, not only the final
  state); upload refused over allowance and under `admins_only` for a
  member.
- **Webhook tests:** signed fixture payloads through the fake `VideoHost`;
  bad signature, repeated event, out-of-order events.
- **Migration test:** a lesson with `youtubeUrl` ends up with a leading
  `Embed` block and identical rendered output.
- **Reels regression:** the full existing Reels/feed video suite passes
  after the object-storage refactor.
- **UI:** the editor calls `startVideoUpload` / `finishFileUpload` with
  what the screen actually holds; the lesson view requests playback tokens
  only on play.
- Run every workspace suite the diff touches, not only new tests.

## 10. Setup (run by the product owner)

1. In the Mux dashboard: create an **API access token** (Video read/write),
   a **signing key**, and a **webhook** pointing to
   `https://www.aitcommunity.org/api/webhooks/mux`; copy its secret.
2. Set a **spending alert** on the Mux account.
3. Add to Vercel env (production and preview), never to chat:
   `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`,
   `MUX_SIGNING_PRIVATE_KEY` (base64), `MUX_WEBHOOK_SECRET`.
4. S3: confirm the bucket CORS rule allows browser POSTs from the site
   origin (already required by Reels) and that `private/` stays
   non-public.
5. Apply each slice's migration in the same window as its deploy.

## 11. Out of scope

- DRM / screen-recording prevention.
- Drop-off charts and per-second analytics (Mux Data can add later).
- Auto-generated captions (a Mux option to evaluate later).
- Hard viewing caps and paid hosting plans (the allowance seam is ready).
- Git-backed / versioned lessons (separate deferred idea).
- Drip scheduling.

## 12. Rejected alternatives

- **Materials only inside rich text** (no records): quota, access control,
  watch tracking and cleanup can't be done reliably on data buried in a
  JSON document.
- **Separate materials list beside the text:** clean records, but a trainer
  can't put "look at this slide" next to the slide.
- **Stretch ADR-0036 to long video:** hour-long in-browser transcoding is
  slow and fragile, and single-rendition MP4 stalls on slow connections —
  exactly the trigger ADR-0036 named for moving to Mux.
- **Hosting as the default path:** costs grow with no benefit when the
  material already lives on YouTube/Slides; embeds first keeps hosting a
  deliberate choice.
