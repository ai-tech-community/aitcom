# Community Short Videos and Reels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members post videos (≤ 90 s) in a community feed with per-video visibility (community only or public), and anyone can watch a community's videos in a full-screen Reels mode.

**Architecture:**
- **Upload path:** the browser converts each clip to 720p H.264 MP4 plus a JPEG thumbnail (WebCodecs via Mediabunny), then uploads straight to our S3 bucket with narrow presigned POST grants. The server checks the stored objects before creating the post.
- **Storage and privacy:** public videos are read by direct URL. Community-only videos sit under `private/` and are read through one-hour presigned links issued only to members.
- **Moderation:** one visibility filter, shared by every feed/reels query, hides reported and community-only posts from viewers who may not see them.

**Tech stack:** Next.js 15 App Router, tRPC 11, Payload 3 (Postgres), Drizzle, next-intl, Mediabunny + @mediabunny/aac-encoder, AWS SDK v3 (`client-s3`, `s3-presigned-post`, `s3-request-presigner`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-community-reels-design.md` · **ADR:** `docs/adr/0036-short-video-is-transcoded-on-device-and-stored-in-our-s3.md`

## Global Constraints

- **Prerequisites:** PR #326 (combined activity feed) and PR #327 (this spec) are merged before Task 1. Work on a new branch `feat/community-reels-build` from up-to-date `main`.
- **Video limits:**
  - Max length 90 seconds.
  - Max converted video 40 MB; max thumbnail 512 KB.
  - Output is H.264 MP4, long side ≤ 1280 px, ≤ 30 fps, ~2.5 Mbps video, AAC 128 kbps audio.
  - Output uses `fastStart: 'in-memory'` so playback can begin before the full download.
- **Access links:**
  - Upload grants: presigned **POST**, 10 minutes, one exact key, one content type, `content-length-range`.
  - Private playback links: presigned GET, 1 hour.
- **Storage keys:**
  - public `media/videos/public/{communityId}/{uploadId}.mp4|.jpg`;
  - community-only `private/videos/{communityId}/{uploadId}.mp4|.jpg`.
- **Rate limit:** 20 video posts per user per rolling 24 hours, across all communities.
- **Visibility:** `community` (default) or `public`. Only video posts may be `public`. Visibility is fixed after posting.
- **Moderation:** the first report sets `hiddenAt`. Hidden posts are visible only to the author and the community's owner/admin/moderator. Report reasons are `spam | inappropriate | copyright | other`, with an optional note ≤ 500 chars, one report per reporter per post.
- **Posting rule:** `feedPostPolicy` (`all_members | admins_only`) applies to video posts exactly as to text posts. A caption is required (1–2000 chars), the same as text posts.
- **Feature flag:** `NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS` (`"true" | "false"`, default `"false"`). The server also refuses `createVideoUpload` when it's off. Remove the flag once the feature is final.
- **Database safety:** `.env` `DATABASE_URL` is **production**. Never run `pnpm db:apply` or `payload generate:types` against `.env`; use `.env.dev` (`pnpm db:apply:dev`). The production migration runs only in the deploy window, by the owner.
- **Copy:**
  - All user-facing text goes in `messages/en.json` and `messages/nl.json` (same keys), in everyday words.
  - Monospace only for data (counts, timestamps).
  - Signal Orange only for the single primary action (DESIGN.md One Voice Rule).
- **Git:**
  - Stage files by name; never `git add -A`.
  - Commit messages carry no AI attribution lines.
  - Check `git branch --show-current` before every commit.

## Review Focus

1. **Portrait phone clips with rotation metadata** (every iPhone/Android portrait video) must come out upright and portrait (for example 720×1280), not sideways. → Task 11 asserts `Conversion.init` gets the *display* (post-rotation) size.
2. **Clips with no audio track** (screen recordings, muted exports) must convert and post normally. Only a missing *video* track is an error. → Task 11 test.
3. **Double-submit:** a second `finishVideoPost` for the same `uploadId` (double click, retry after timeout) must not create a second post. → Task 6 test.
4. **A deep link to a reported (hidden) public video**, opened by a visitor, must show "unavailable", never the video. → Task 9 test.
5. **Reviewing a report on a post the author already deleted** must return a clear NOT_FOUND and leave no dangling report rows. → Task 8 test.

---

### Task 1: Video rules (pure limits and key builders)

**Files:**
- Create: `src/lib/video-rules.ts`
- Test: `src/lib/video-rules.test.ts`

**Interfaces:**
- Produces:
  - Constants: `MAX_VIDEO_SECONDS`, `MAX_VIDEO_BYTES`, `MAX_THUMB_BYTES`, `VIDEO_LONG_SIDE`, `VIDEO_MAX_FPS`, `VIDEO_BITRATE`, `AUDIO_BITRATE`, `VIDEO_UPLOADS_PER_DAY`, `UPLOAD_GRANT_SECONDS`, `PLAYBACK_LINK_SECONDS`, `ABANDONED_UPLOAD_HOURS`, `VIDEO_CONTENT_TYPE`, `THUMB_CONTENT_TYPE`, `VIDEO_VISIBILITIES`.
  - Types: `VideoVisibility`, `VideoStorageClass`.
  - Functions:
    - `storageClassFor(v: VideoVisibility): VideoStorageClass`
    - `isUploadId(s: string): boolean`
    - `videoObjectKeys({ visibility, communityId, uploadId }): { video: string; thumbnail: string }`
    - `fitWithin(width: number, height: number, longSide?: number): { width: number; height: number }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/video-rules.test.ts
import { describe, expect, it } from "vitest";

import {
  MAX_VIDEO_SECONDS,
  fitWithin,
  isUploadId,
  storageClassFor,
  videoObjectKeys,
} from "./video-rules";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

describe("video rules", () => {
  it("caps length at 90 seconds", () => {
    expect(MAX_VIDEO_SECONDS).toBe(90);
  });

  it("stores public videos under media/ and community-only under private/", () => {
    expect(
      videoObjectKeys({ visibility: "public", communityId: "c-1", uploadId: UPLOAD }),
    ).toEqual({
      video: `media/videos/public/c-1/${UPLOAD}.mp4`,
      thumbnail: `media/videos/public/c-1/${UPLOAD}.jpg`,
    });
    expect(
      videoObjectKeys({ visibility: "community", communityId: "c-1", uploadId: UPLOAD }),
    ).toEqual({
      video: `private/videos/c-1/${UPLOAD}.mp4`,
      thumbnail: `private/videos/c-1/${UPLOAD}.jpg`,
    });
    expect(storageClassFor("community")).toBe("private");
  });

  it("refuses ids that could escape their folder", () => {
    expect(isUploadId(UPLOAD)).toBe(true);
    expect(isUploadId("../x")).toBe(false);
    expect(() =>
      videoObjectKeys({ visibility: "public", communityId: "../c", uploadId: UPLOAD }),
    ).toThrow();
    expect(() =>
      videoObjectKeys({ visibility: "public", communityId: "c", uploadId: "x/y" }),
    ).toThrow();
  });

  it("fits the long side to 1280 with even sides and never upscales", () => {
    expect(fitWithin(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(fitWithin(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(fitWithin(640, 360)).toEqual({ width: 640, height: 360 });
    expect(fitWithin(1081, 1921)).toEqual({ width: 720, height: 1280 });
    expect(() => fitWithin(0, 100)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/video-rules.test.ts`
Expected: FAIL, "Failed to resolve import ./video-rules".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/video-rules.ts
/**
 * Limits and names for community short videos. Pure, so the browser (before
 * converting and uploading) and the server (before trusting an upload) use
 * the same numbers and can never disagree. See ADR-0036.
 */
export const MAX_VIDEO_SECONDS = 90;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const MAX_THUMB_BYTES = 512 * 1024;
export const VIDEO_LONG_SIDE = 1280;
export const VIDEO_MAX_FPS = 30;
export const VIDEO_BITRATE = 2_500_000;
export const AUDIO_BITRATE = 128_000;
export const VIDEO_UPLOADS_PER_DAY = 20;
export const UPLOAD_GRANT_SECONDS = 600;
export const PLAYBACK_LINK_SECONDS = 3600;
export const ABANDONED_UPLOAD_HOURS = 24;
export const VIDEO_CONTENT_TYPE = "video/mp4";
export const THUMB_CONTENT_TYPE = "image/jpeg";

export const VIDEO_VISIBILITIES = ["community", "public"] as const;
export type VideoVisibility = (typeof VIDEO_VISIBILITIES)[number];
export type VideoStorageClass = "public" | "private";

export function storageClassFor(visibility: VideoVisibility): VideoStorageClass {
  return visibility === "public" ? "public" : "private";
}

const UPLOAD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isUploadId(value: string): boolean {
  return UPLOAD_ID.test(value);
}

/** Object keys for one upload. Throws on ids that could escape their folder. */
export function videoObjectKeys(input: {
  visibility: VideoVisibility;
  communityId: string;
  uploadId: string;
}): { video: string; thumbnail: string } {
  if (!isUploadId(input.uploadId)) throw new Error("invalid upload id");
  if (!SAFE_SEGMENT.test(input.communityId)) {
    throw new Error("invalid community id");
  }
  const base =
    storageClassFor(input.visibility) === "public"
      ? `media/videos/public/${input.communityId}/${input.uploadId}`
      : `private/videos/${input.communityId}/${input.uploadId}`;
  return { video: `${base}.mp4`, thumbnail: `${base}.jpg` };
}

/** Scale so the long side is at most `longSide`, even sides, never upscale. */
export function fitWithin(
  width: number,
  height: number,
  longSide: number = VIDEO_LONG_SIDE,
): { width: number; height: number } {
  if (!(width > 0 && height > 0)) throw new Error("invalid video size");
  const scale = Math.min(1, longSide / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/video-rules.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/community-reels-build
git add src/lib/video-rules.ts src/lib/video-rules.test.ts
git commit -m "feat(videos): shared limits and storage keys for community videos"
```

---

### Task 2: Post visibility filter (one rule for every read)

**Files:**
- Create: `src/server/communities/post-visibility.ts`
- Test: `src/server/communities/post-visibility.test.ts`

**Interfaces:**
- Produces:
  - `type FeedViewer = { userId: string | null; isMember: boolean; isModerator: boolean }`
  - `isModeratorRole(role: string | null | undefined): boolean`
  - `postVisibilityWhere(viewer: FeedViewer): Where` (a Payload `Where`)
  - `canViewPost(post: { authorId: string; isDeleted?: boolean | null; hiddenAt?: string | null; visibility?: string | null }, viewer: FeedViewer): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/post-visibility.test.ts
import { describe, expect, it } from "vitest";

import {
  canViewPost,
  isModeratorRole,
  postVisibilityWhere,
  type FeedViewer,
} from "./post-visibility";

const member: FeedViewer = { userId: "m", isMember: true, isModerator: false };
const mod: FeedViewer = { userId: "mod", isMember: true, isModerator: true };
const visitor: FeedViewer = { userId: null, isMember: false, isModerator: false };
const signedInOutsider: FeedViewer = { userId: "o", isMember: false, isModerator: false };

const post = (over: Record<string, unknown> = {}) => ({
  authorId: "a",
  isDeleted: false,
  hiddenAt: null,
  visibility: "community",
  ...over,
});

describe("canViewPost", () => {
  it("shows community-only posts to members, never to non-members", () => {
    expect(canViewPost(post(), member)).toBe(true);
    expect(canViewPost(post(), visitor)).toBe(false);
    expect(canViewPost(post(), signedInOutsider)).toBe(false);
    expect(canViewPost(post({ visibility: "public" }), visitor)).toBe(true);
  });

  it("hides reported posts from everyone except the author and moderators", () => {
    const hidden = post({ hiddenAt: "2026-09-24T00:00:00.000Z", visibility: "public" });
    expect(canViewPost(hidden, member)).toBe(false);
    expect(canViewPost(hidden, visitor)).toBe(false);
    expect(canViewPost(hidden, mod)).toBe(true);
    expect(canViewPost(hidden, { ...member, userId: "a" })).toBe(true);
  });

  it("never shows deleted posts", () => {
    expect(canViewPost(post({ isDeleted: true }), mod)).toBe(false);
  });
});

describe("postVisibilityWhere", () => {
  it("members: not deleted, and not hidden unless their own", () => {
    expect(postVisibilityWhere(member)).toEqual({
      and: [
        { isDeleted: { not_equals: true } },
        { or: [{ hiddenAt: { exists: false } }, { authorId: { equals: "m" } }] },
      ],
    });
  });

  it("moderators see hidden posts", () => {
    expect(postVisibilityWhere(mod)).toEqual({
      and: [{ isDeleted: { not_equals: true } }],
    });
  });

  it("visitors: public and not hidden only", () => {
    expect(postVisibilityWhere(visitor)).toEqual({
      and: [
        { isDeleted: { not_equals: true } },
        { or: [{ hiddenAt: { exists: false } }] },
        { visibility: { equals: "public" } },
      ],
    });
  });

  it("knows which roles moderate", () => {
    expect(["owner", "admin", "moderator"].every(isModeratorRole)).toBe(true);
    expect(isModeratorRole("member")).toBe(false);
    expect(isModeratorRole(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/post-visibility.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/communities/post-visibility.ts
import type { Where } from "payload";

/** Who is looking at a community's posts. */
export type FeedViewer = {
  userId: string | null;
  isMember: boolean;
  isModerator: boolean;
};

export function isModeratorRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

/**
 * The one visibility rule for community posts, as a Payload filter. Every
 * list (feed, activity, pinned, reels) applies it, so a hidden or
 * community-only post can't leak through a list that forgot a check.
 */
export function postVisibilityWhere(viewer: FeedViewer): Where {
  const clauses: Where[] = [{ isDeleted: { not_equals: true } }];
  if (!viewer.isModerator) {
    clauses.push({
      or: [
        { hiddenAt: { exists: false } },
        ...(viewer.userId ? [{ authorId: { equals: viewer.userId } }] : []),
      ],
    });
  }
  if (!viewer.isMember) clauses.push({ visibility: { equals: "public" } });
  return { and: clauses };
}

/** The same rule for one already-loaded post. */
export function canViewPost(
  post: {
    authorId: string;
    isDeleted?: boolean | null;
    hiddenAt?: string | null;
    visibility?: string | null;
  },
  viewer: FeedViewer,
): boolean {
  if (post.isDeleted) return false;
  if (post.hiddenAt && !viewer.isModerator && post.authorId !== viewer.userId) {
    return false;
  }
  if (!viewer.isMember && post.visibility !== "public") return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/communities/post-visibility.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/post-visibility.ts src/server/communities/post-visibility.test.ts
git commit -m "feat(videos): one visibility rule for community posts"
```

---

### Task 3: Data model: post fields, reports, uploads, migration

**Files:**
- Modify: `src/collections/FeedPosts.ts` (append fields at the end of `fields`)
- Create: `src/collections/PostReports.ts`
- Create: `src/collections/VideoUploads.ts`
- Modify: `src/payload.config.ts` (import and add both collections to `collections`)
- Create: `src/migrations/20260924a_community_videos.ts`
- Modify: `src/migrations/index.ts` (register the migration after `20260923c_startup_role_posted_at`)
- Regenerate: `src/payload-types.ts`
- Test: `src/collections/community-videos-schema.test.ts`

**Interfaces:**
- Produces:
  - Payload `FeedPost` gains `visibility: 'community' | 'public'`, `video?: { key?, thumbnailKey?, storage?: 'public' | 'private', durationSeconds?, width?, height?, bytes? }`, `hiddenAt?: string | null`, and `reportCount?: number | null`.
  - New collections `post-reports` (`post`, `reporterId`, `reason`, `note`) and `video-uploads` (`uploadId`, `userId`, `communityId`, `visibility`, `finishedAt`).

- [ ] **Step 1: Write the failing test**

```ts
// src/collections/community-videos-schema.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FeedPosts } from "./FeedPosts";
import { PostReports } from "./PostReports";
import { VideoUploads } from "./VideoUploads";

const names = (fields: ReadonlyArray<{ name?: string }>) =>
  fields.map((field) => field.name);

describe("community video schema", () => {
  it("adds video, visibility, and moderation fields to feed posts", () => {
    expect(names(FeedPosts.fields as never)).toEqual(
      expect.arrayContaining(["visibility", "video", "hiddenAt", "reportCount"]),
    );
  });

  it("defines reports and uploads collections", () => {
    expect(PostReports.slug).toBe("post-reports");
    expect(names(PostReports.fields as never)).toEqual(["post", "reporterId", "reason", "note"]);
    expect(VideoUploads.slug).toBe("video-uploads");
    expect(names(VideoUploads.fields as never)).toEqual([
      "uploadId",
      "userId",
      "communityId",
      "visibility",
      "finishedAt",
    ]);
  });

  it("ships a migration with columns, tables, enums, and admin-lock columns", () => {
    const sql = readFileSync(
      join(process.cwd(), "src/migrations/20260924a_community_videos.ts"),
      "utf8",
    );
    for (const needle of [
      '"enum_feed_posts_visibility"',
      '"enum_feed_posts_video_storage"',
      '"enum_post_reports_reason"',
      '"enum_video_uploads_visibility"',
      '"video_key"',
      '"hidden_at"',
      'CREATE TABLE IF NOT EXISTS "post_reports"',
      'CREATE TABLE IF NOT EXISTS "video_uploads"',
      '"post_reports_post_reporter_idx"',
      '"post_reports_id"',
      '"video_uploads_id"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(join(process.cwd(), "src/migrations/index.ts"), "utf8");
    expect(index).toContain('name: "20260924a_community_videos"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/collections/community-videos-schema.test.ts`
Expected: FAIL, `./PostReports` is missing.

- [ ] **Step 3: Add the fields and collections**

Append to the `fields` array in `src/collections/FeedPosts.ts`, after `editedAt`:

```ts
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "community",
      index: true,
      options: [
        { label: "Community only", value: "community" },
        { label: "Public", value: "public" },
      ],
      admin: {
        position: "sidebar",
        description: "Only video posts may be public. Fixed after posting.",
      },
    },
    {
      name: "video",
      type: "group",
      admin: { description: "Set on video posts only. See ADR-0036." },
      fields: [
        { name: "key", type: "text" },
        { name: "thumbnailKey", type: "text" },
        {
          name: "storage",
          type: "select",
          options: [
            { label: "Public", value: "public" },
            { label: "Private", value: "private" },
          ],
        },
        { name: "durationSeconds", type: "number" },
        { name: "width", type: "number" },
        { name: "height", type: "number" },
        { name: "bytes", type: "number" },
      ],
    },
    {
      name: "hiddenAt",
      type: "date",
      index: true,
      admin: {
        position: "sidebar",
        description: "Set by the first report; cleared when a moderator restores.",
      },
    },
    {
      name: "reportCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
```

```ts
// src/collections/PostReports.ts
import type { CollectionConfig } from "payload";

export const PostReports: CollectionConfig = {
  slug: "post-reports",
  admin: {
    useAsTitle: "reason",
    defaultColumns: ["post", "reason", "reporterId", "createdAt"],
    description: "Member reports on community posts. One per reporter per post.",
  },
  indexes: [{ fields: ["post", "reporterId"], unique: true }],
  fields: [
    {
      name: "post",
      type: "relationship",
      relationTo: "feed-posts",
      required: true,
      index: true,
    },
    { name: "reporterId", type: "text", required: true, index: true },
    {
      name: "reason",
      type: "select",
      required: true,
      options: [
        { label: "Spam", value: "spam" },
        { label: "Inappropriate", value: "inappropriate" },
        { label: "Copyright", value: "copyright" },
        { label: "Other", value: "other" },
      ],
    },
    { name: "note", type: "text", maxLength: 500 },
  ],
  timestamps: true,
};
```

```ts
// src/collections/VideoUploads.ts
import type { CollectionConfig } from "payload";

export const VideoUploads: CollectionConfig = {
  slug: "video-uploads",
  admin: {
    useAsTitle: "uploadId",
    defaultColumns: ["uploadId", "userId", "communityId", "finishedAt", "createdAt"],
    description:
      "Upload grants for community videos. Unfinished ones are cleaned up daily.",
  },
  fields: [
    { name: "uploadId", type: "text", required: true, unique: true, index: true },
    { name: "userId", type: "text", required: true, index: true },
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "visibility",
      type: "select",
      required: true,
      options: [
        { label: "Community only", value: "community" },
        { label: "Public", value: "public" },
      ],
    },
    { name: "finishedAt", type: "date", index: true },
  ],
  timestamps: true,
};
```

In `src/payload.config.ts`, add `import { PostReports } from "./collections/PostReports";` and `import { VideoUploads } from "./collections/VideoUploads";` next to the `FeedPosts` import, and add `PostReports, VideoUploads` to the `collections` array directly after `FeedPosts`.

- [ ] **Step 4: Write the migration**

```ts
// src/migrations/20260924a_community_videos.ts
// Community short videos (ADR-0036): video + visibility + moderation on
// feed_posts, plus post_reports and video_uploads. Every new collection also
// needs its admin-lock column on payload_locked_documents_rels (house
// precedent: 20260611b_modules_locked_docs_rels.ts).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_feed_posts_visibility" AS ENUM('community', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_feed_posts_video_storage" AS ENUM('public', 'private');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_post_reports_reason" AS ENUM('spam', 'inappropriate', 'copyright', 'other');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_video_uploads_visibility" AS ENUM('community', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "visibility" "enum_feed_posts_visibility" DEFAULT 'community' NOT NULL,
      ADD COLUMN IF NOT EXISTS "video_key" varchar,
      ADD COLUMN IF NOT EXISTS "video_thumbnail_key" varchar,
      ADD COLUMN IF NOT EXISTS "video_storage" "enum_feed_posts_video_storage",
      ADD COLUMN IF NOT EXISTS "video_duration_seconds" numeric,
      ADD COLUMN IF NOT EXISTS "video_width" numeric,
      ADD COLUMN IF NOT EXISTS "video_height" numeric,
      ADD COLUMN IF NOT EXISTS "video_bytes" numeric,
      ADD COLUMN IF NOT EXISTS "hidden_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "report_count" numeric DEFAULT 0;
    CREATE INDEX IF NOT EXISTS "feed_posts_visibility_idx" ON "feed_posts"("visibility");
    CREATE INDEX IF NOT EXISTS "feed_posts_hidden_at_idx" ON "feed_posts"("hidden_at");

    CREATE TABLE IF NOT EXISTS "post_reports" (
      "id" serial PRIMARY KEY,
      "post_id" integer NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
      "reporter_id" varchar NOT NULL,
      "reason" "enum_post_reports_reason" NOT NULL,
      "note" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "post_reports_post_reporter_idx"
      ON "post_reports"("post_id", "reporter_id");
    CREATE INDEX IF NOT EXISTS "post_reports_post_idx" ON "post_reports"("post_id");
    CREATE INDEX IF NOT EXISTS "post_reports_reporter_id_idx" ON "post_reports"("reporter_id");
    CREATE INDEX IF NOT EXISTS "post_reports_created_at_idx" ON "post_reports"("created_at");

    CREATE TABLE IF NOT EXISTS "video_uploads" (
      "id" serial PRIMARY KEY,
      "upload_id" varchar NOT NULL,
      "user_id" varchar NOT NULL,
      "community_id" varchar NOT NULL,
      "visibility" "enum_video_uploads_visibility" NOT NULL,
      "finished_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "video_uploads_upload_id_idx" ON "video_uploads"("upload_id");
    CREATE INDEX IF NOT EXISTS "video_uploads_user_id_idx" ON "video_uploads"("user_id");
    CREATE INDEX IF NOT EXISTS "video_uploads_community_id_idx" ON "video_uploads"("community_id");
    CREATE INDEX IF NOT EXISTS "video_uploads_finished_at_idx" ON "video_uploads"("finished_at");
    CREATE INDEX IF NOT EXISTS "video_uploads_created_at_idx" ON "video_uploads"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "post_reports_id" integer REFERENCES "post_reports"("id") ON DELETE cascade,
      ADD COLUMN IF NOT EXISTS "video_uploads_id" integer REFERENCES "video_uploads"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_post_reports_id_idx"
      ON "payload_locked_documents_rels"("post_reports_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_video_uploads_id_idx"
      ON "payload_locked_documents_rels"("video_uploads_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "post_reports_id",
      DROP COLUMN IF EXISTS "video_uploads_id";
    DROP TABLE IF EXISTS "post_reports";
    DROP TABLE IF EXISTS "video_uploads";
    ALTER TABLE "feed_posts"
      DROP COLUMN IF EXISTS "visibility",
      DROP COLUMN IF EXISTS "video_key",
      DROP COLUMN IF EXISTS "video_thumbnail_key",
      DROP COLUMN IF EXISTS "video_storage",
      DROP COLUMN IF EXISTS "video_duration_seconds",
      DROP COLUMN IF EXISTS "video_width",
      DROP COLUMN IF EXISTS "video_height",
      DROP COLUMN IF EXISTS "video_bytes",
      DROP COLUMN IF EXISTS "hidden_at",
      DROP COLUMN IF EXISTS "report_count";
    DROP TYPE IF EXISTS "public"."enum_feed_posts_visibility";
    DROP TYPE IF EXISTS "public"."enum_feed_posts_video_storage";
    DROP TYPE IF EXISTS "public"."enum_post_reports_reason";
    DROP TYPE IF EXISTS "public"."enum_video_uploads_visibility";
  `);
}
```

Register it in `src/migrations/index.ts`: add `import * as migration_20260924a_community_videos from "./20260924a_community_videos";` after the `20260923c` import. Then add this entry after the `20260923c_startup_role_posted_at` entry in the exported array:

```ts
  {
    up: migration_20260924a_community_videos.up,
    down: migration_20260924a_community_videos.down,
    name: "20260924a_community_videos",
  },
```

- [ ] **Step 5: Apply on the dev database and regenerate types (never `.env`)**

```bash
pnpm db:apply:dev:dry        # expect: 20260924a_community_videos pending
pnpm db:apply:dev            # applies to the .env.dev database only
npx tsx --env-file=.env.dev node_modules/payload/bin.js generate:types
git diff --stat src/payload-types.ts   # expect FeedPost/PostReport/VideoUpload changes only
```

Check that `src/payload-types.ts` now has `visibility: 'community' | 'public';`, a `video?: {...}` group, and the `PostReport` and `VideoUpload` interfaces. Then run `npx tsc --noEmit -p .` and fix any consumer that constructs `FeedPost` field-by-field. Grep `collection: "feed-posts"` in `src` and check each `payload.create` call still compiles; `visibility` has a default, so creates don't need to pass it.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/collections/community-videos-schema.test.ts && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/collections/FeedPosts.ts src/collections/PostReports.ts src/collections/VideoUploads.ts src/payload.config.ts src/migrations/20260924a_community_videos.ts src/migrations/index.ts src/payload-types.ts src/collections/community-videos-schema.test.ts
git commit -m "feat(videos): video, visibility, and report fields; reports and uploads collections"
```

---

### Task 4: Video storage (the only S3 code for video)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (direct deps)
- Create: `src/server/media/video-storage.ts`
- Test: `src/server/media/video-storage.test.ts`

**Interfaces:**
- Consumes: `PLAYBACK_LINK_SECONDS`, `UPLOAD_GRANT_SECONDS`, and `VideoStorageClass` from Task 1.
- Produces:
  - `type PresignedUpload = { url: string; fields: Record<string, string> }`
  - `type StoredObject = { contentType: string | null; bytes: number }`
  - `type VideoStorage = { presignUpload(i: { key: string; contentType: string; maxBytes: number }): Promise<PresignedUpload>; inspect(key: string): Promise<StoredObject | null>; playbackUrl(key: string, storage: VideoStorageClass): Promise<string>; remove(keys: readonly string[]): Promise<void> }`
  - `createVideoStorage(config: { client: S3Client; bucket: string; region: string }): VideoStorage`
  - `getVideoStorage(): VideoStorage`

- [ ] **Step 1: Add the AWS packages as direct dependencies** (they're already present transitively via `@payloadcms/storage-s3`)

```bash
npm view @aws-sdk/s3-presigned-post@3.1000.0 version   # expect 3.1000.0; else use the latest 3.x for all three
pnpm add @aws-sdk/client-s3@3.1000.0 @aws-sdk/s3-presigned-post@3.1000.0 @aws-sdk/s3-request-presigner@3.1000.0
```

- [ ] **Step 2: Write the failing test**

```ts
// src/server/media/video-storage.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPresignedPost, getSignedUrl } = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  getSignedUrl: vi.fn(),
}));
vi.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

import { createVideoStorage } from "./video-storage";

function setup() {
  const send = vi.fn();
  const storage = createVideoStorage({
    client: { send } as never,
    bucket: "ait-media",
    region: "eu-central-1",
  });
  return { storage, send };
}

beforeEach(() => {
  createPresignedPost.mockReset();
  getSignedUrl.mockReset();
});

describe("video storage", () => {
  it("grants one key, one type, a size range, for ten minutes", async () => {
    createPresignedPost.mockResolvedValue({ url: "https://s3/", fields: { key: "k" } });
    const { storage } = setup();
    await expect(
      storage.presignUpload({ key: "private/videos/c/u.mp4", contentType: "video/mp4", maxBytes: 100 }),
    ).resolves.toEqual({ url: "https://s3/", fields: { key: "k" } });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.anything(), {
      Bucket: "ait-media",
      Key: "private/videos/c/u.mp4",
      Conditions: [
        ["content-length-range", 1, 100],
        ["eq", "$Content-Type", "video/mp4"],
      ],
      Fields: { "Content-Type": "video/mp4" },
      Expires: 600,
    });
  });

  it("links public videos directly and signs private ones for an hour", async () => {
    getSignedUrl.mockResolvedValue("https://signed");
    const { storage } = setup();
    await expect(storage.playbackUrl("media/videos/public/c/u.mp4", "public")).resolves.toBe(
      "https://ait-media.s3.eu-central-1.amazonaws.com/media/videos/public/c/u.mp4",
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
    await expect(storage.playbackUrl("private/videos/c/u.mp4", "private")).resolves.toBe(
      "https://signed",
    );
    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 3600,
    });
  });

  it("inspects an object, and reports a missing one as null", async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({ ContentType: "video/mp4", ContentLength: 42 });
    await expect(storage.inspect("k")).resolves.toEqual({ contentType: "video/mp4", bytes: 42 });
    send.mockRejectedValueOnce(Object.assign(new Error("nf"), { name: "NotFound" }));
    await expect(storage.inspect("k")).resolves.toBeNull();
    send.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "AccessDenied" }));
    await expect(storage.inspect("k")).rejects.toThrow("boom");
  });

  it("removes several objects in one call and skips an empty list", async () => {
    const { storage, send } = setup();
    await storage.remove([]);
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValue({});
    await storage.remove(["a", "b"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].input).toEqual({
      Bucket: "ait-media",
      Delete: { Objects: [{ Key: "a" }, { Key: "b" }], Quiet: true },
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/server/media/video-storage.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 4: Write the implementation**

```ts
// src/server/media/video-storage.ts
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";
import {
  PLAYBACK_LINK_SECONDS,
  UPLOAD_GRANT_SECONDS,
  type VideoStorageClass,
} from "@/lib/video-rules";

export type PresignedUpload = { url: string; fields: Record<string, string> };
export type StoredObject = { contentType: string | null; bytes: number };

/**
 * The only code that touches video storage (ADR-0036). Everything else asks
 * this module, so moving to a video platform later changes one file.
 */
export type VideoStorage = {
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload>;
  inspect(key: string): Promise<StoredObject | null>;
  playbackUrl(key: string, storage: VideoStorageClass): Promise<string>;
  remove(keys: readonly string[]): Promise<void>;
};

export function createVideoStorage({
  client,
  bucket,
  region,
}: {
  client: S3Client;
  bucket: string;
  region: string;
}): VideoStorage {
  return {
    async presignUpload({ key, contentType, maxBytes }) {
      const { url, fields } = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ["content-length-range", 1, maxBytes],
          ["eq", "$Content-Type", contentType],
        ],
        Fields: { "Content-Type": contentType },
        Expires: UPLOAD_GRANT_SECONDS,
      });
      return { url, fields };
    },
    async inspect(key) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          contentType: head.ContentType ?? null,
          bytes: head.ContentLength ?? 0,
        };
      } catch (error) {
        if ((error as { name?: string }).name === "NotFound") return null;
        throw error;
      }
    },
    async playbackUrl(key, storage) {
      if (storage === "public") {
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      }
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: PLAYBACK_LINK_SECONDS },
      );
    },
    async remove(keys) {
      if (keys.length === 0) return;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    },
  };
}

let shared: VideoStorage | null = null;

/** The app's video storage, built from the same S3 settings as Payload media. */
export function getVideoStorage(): VideoStorage {
  if (shared) return shared;
  const bucket = env.S3_BUCKET;
  const region = env.S3_REGION ?? "eu-central-1";
  if (!bucket || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 is not configured for video storage");
  }
  shared = createVideoStorage({
    bucket,
    region,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    }),
  });
  return shared;
}
```

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run src/server/media/video-storage.test.ts && npx tsc --noEmit -p .`
Expected: PASS (4 tests), and no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/server/media/video-storage.ts src/server/media/video-storage.test.ts
git commit -m "feat(videos): S3 video storage with narrow upload grants and signed playback"
```

---

### Task 5: Feature flag and shared posting guard

**Files:**
- Modify: `src/env.js` (add `NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS` next to `NEXT_PUBLIC_FEATURE_CHAT_UI`, in both the `client` schema and `runtimeEnv`)
- Create: `src/lib/community-videos-flag.ts`
- Modify: `src/server/communities/feed-posts.ts` (return the member's role; add `canPostToFeed`, `requireFeedPoster`)
- Modify: `src/server/api/routers/feed.ts` (`createPost` uses `requireFeedPoster`)
- Test: `src/server/communities/feed-posts.test.ts`

**Interfaces:**
- Produces:
  - `isCommunityVideosEnabled(): boolean`
  - `type FeedMemberRole = "owner" | "admin" | "moderator" | "member"`
  - `requireActiveFeedMember(db, slug, userId): Promise<{ id: string; slug: string; role: FeedMemberRole; feedPostPolicy: "all_members" | "admins_only" }>`
  - `canPostToFeed(policy: "all_members" | "admins_only", role: FeedMemberRole): boolean`
  - `requireFeedPoster(db, slug, userId)`: the same return type; throws FORBIDDEN when `canPostToFeed` is false.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/feed-posts.test.ts
import { describe, expect, it } from "vitest";

import { canPostToFeed } from "./feed-posts";

describe("canPostToFeed", () => {
  it("lets every member post when the policy is all_members", () => {
    expect(canPostToFeed("all_members", "member")).toBe(true);
  });
  it("limits admins_only communities to owners, admins, and moderators", () => {
    expect(canPostToFeed("admins_only", "member")).toBe(false);
    expect(canPostToFeed("admins_only", "moderator")).toBe(true);
    expect(canPostToFeed("admins_only", "owner")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/feed-posts.test.ts`
Expected: FAIL, `canPostToFeed` is not exported.

- [ ] **Step 3: Implement**

Add to `src/env.js`, in the client schema next to `NEXT_PUBLIC_FEATURE_CHAT_UI`:
`NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS: z.enum(["true", "false"]).default("false"),`
In `runtimeEnv`, add:
`NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS: process.env.NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS,`

```ts
// src/lib/community-videos-flag.ts
import { env } from "@/env";

/** Community short videos (ADR-0036). Remove once the feature is final. */
export const isCommunityVideosEnabled = () =>
  env.NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS === "true";
```

In `src/server/communities/feed-posts.ts`:
- Add `role: true` to the membership `columns`, and `feedPostPolicy: true` to the community `columns`.
- Change `requireActiveFeedMember` to return `{ id: community.id, slug: community.slug, role: membership.role as FeedMemberRole, feedPostPolicy: (community.feedPostPolicy ?? "all_members") as "all_members" | "admins_only" }`.
- Then add:

```ts
export type FeedMemberRole = "owner" | "admin" | "moderator" | "member";

export function canPostToFeed(
  policy: "all_members" | "admins_only",
  role: FeedMemberRole,
): boolean {
  if (policy === "all_members") return true;
  return role === "owner" || role === "admin" || role === "moderator";
}

/** An active member who may post under the community's feed policy. */
export async function requireFeedPoster(
  database: Database,
  communitySlug: string,
  userId: string,
) {
  const community = await requireActiveFeedMember(database, communitySlug, userId);
  if (!canPostToFeed(community.feedPostPolicy, community.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return community;
}
```

In `src/server/api/routers/feed.ts` `createPost`: replace the community lookup, the membership check, and the "Enforce feed post policy" block with:

```ts
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
```

`community.id` is used exactly as before. Add `requireFeedPoster` to the existing import from `@/server/communities/feed-posts`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/server/communities src/server/api && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/env.js src/lib/community-videos-flag.ts src/server/communities/feed-posts.ts src/server/communities/feed-posts.test.ts src/server/api/routers/feed.ts
git commit -m "feat(videos): feature flag and one shared feed posting guard"
```

---

### Task 6: Posting a video (upload grant, finish, delete cleanup)

**Files:**
- Create: `src/server/communities/video-posts.ts`
- Test: `src/server/communities/video-posts.test.ts`
- Modify: `src/server/api/routers/feed.ts` (new `createVideoUpload` and `finishVideoPost`; `deletePost` removes files)

**Interfaces:**
- Consumes:
  - Task 1 rules;
  - Task 4 `VideoStorage`, `PresignedUpload`;
  - Task 5 `requireFeedPoster`, `isCommunityVideosEnabled`.
- Produces:
  - `type VideoPostDeps = { payload: Payload; storage: VideoStorage; now?: () => Date; newUploadId?: () => string }`
  - `issueVideoUpload(deps, { userId, communityId, visibility }): Promise<{ uploadId: string; video: PresignedUpload; thumbnail: PresignedUpload }>`
  - `finishVideoPost(deps, { userId, authorName, communityId, uploadId, caption, topicSlug, durationSeconds, width, height }): Promise<FeedPost>`
  - `removePostVideo(storage, post: { video?: { key?: string | null; thumbnailKey?: string | null } | null }): Promise<void>`
  - tRPC: `feed.createVideoUpload({ communitySlug, visibility })`, `feed.finishVideoPost({ communitySlug, uploadId, caption, topicSlug?, durationSeconds, width, height })`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/video-posts.test.ts
import { describe, expect, it, vi } from "vitest";

import { finishVideoPost, issueVideoUpload, removePostVideo } from "./video-posts";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-09-24T12:00:00.000Z");

function fakes(over: { uploads?: unknown[]; recent?: number; heads?: unknown[] } = {}) {
  const payload = {
    count: vi.fn().mockResolvedValue({ totalDocs: over.recent ?? 0 }),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data })),
    find: vi.fn().mockResolvedValue({ docs: over.uploads ?? [] }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const heads = [...(over.heads ?? [])];
  const storage = {
    presignUpload: vi.fn().mockImplementation(({ key }) => Promise.resolve({ url: "u", fields: { key } })),
    inspect: vi.fn().mockImplementation(() => Promise.resolve(heads.shift() ?? null)),
    playbackUrl: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return {
    payload,
    storage,
    deps: { payload: payload as never, storage, now: () => NOW, newUploadId: () => UPLOAD },
  };
}

const upload = (over: Record<string, unknown> = {}) => ({
  id: 3,
  uploadId: UPLOAD,
  userId: "u1",
  communityId: "c1",
  visibility: "public",
  finishedAt: null,
  ...over,
});

const finish = {
  userId: "u1",
  authorName: "Greg",
  communityId: "c1",
  uploadId: UPLOAD,
  caption: "Demo",
  topicSlug: "general",
  durationSeconds: 42,
  width: 720,
  height: 1280,
};

describe("issueVideoUpload", () => {
  it("records the grant and signs the video and thumbnail keys", async () => {
    const { deps, payload, storage } = fakes();
    const grant = await issueVideoUpload(deps, { userId: "u1", communityId: "c1", visibility: "community" });
    expect(grant.uploadId).toBe(UPLOAD);
    expect(payload.create).toHaveBeenCalledWith({
      collection: "video-uploads",
      data: { uploadId: UPLOAD, userId: "u1", communityId: "c1", visibility: "community" },
    });
    expect(storage.presignUpload.mock.calls.map(([c]) => c)).toEqual([
      { key: `private/videos/c1/${UPLOAD}.mp4`, contentType: "video/mp4", maxBytes: 40 * 1024 * 1024 },
      { key: `private/videos/c1/${UPLOAD}.jpg`, contentType: "image/jpeg", maxBytes: 512 * 1024 },
    ]);
  });

  it("stops at 20 uploads a day", async () => {
    const { deps } = fakes({ recent: 20 });
    await expect(
      issueVideoUpload(deps, { userId: "u1", communityId: "c1", visibility: "public" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("finishVideoPost", () => {
  it("creates the post only after both files check out, then closes the grant", async () => {
    const { deps, payload } = fakes({
      uploads: [upload()],
      heads: [
        { contentType: "video/mp4", bytes: 1_000_000 },
        { contentType: "image/jpeg", bytes: 20_000 },
      ],
    });
    const post = await finishVideoPost(deps, finish);
    expect(post).toMatchObject({
      content: "Demo",
      visibility: "public",
      video: {
        key: `media/videos/public/c1/${UPLOAD}.mp4`,
        thumbnailKey: `media/videos/public/c1/${UPLOAD}.jpg`,
        storage: "public",
        durationSeconds: 42,
        width: 720,
        height: 1280,
        bytes: 1_000_000,
      },
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "video-uploads",
      id: 3,
      data: { finishedAt: NOW.toISOString() },
    });
  });

  it("refuses a second finish for the same upload (double submit)", async () => {
    const { deps, payload } = fakes({ uploads: [upload({ finishedAt: NOW.toISOString() })] });
    await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses someone else's upload", async () => {
    const { deps } = fakes({ uploads: [upload({ userId: "other" })] });
    await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes the files and refuses when a file is missing, wrong, or too big", async () => {
    for (const heads of [
      [null, { contentType: "image/jpeg", bytes: 10 }],
      [{ contentType: "video/quicktime", bytes: 10 }, { contentType: "image/jpeg", bytes: 10 }],
      [{ contentType: "video/mp4", bytes: 41 * 1024 * 1024 }, { contentType: "image/jpeg", bytes: 10 }],
    ]) {
      const { deps, storage, payload } = fakes({ uploads: [upload()], heads });
      await expect(finishVideoPost(deps, finish)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(storage.remove).toHaveBeenCalledWith([
        `media/videos/public/c1/${UPLOAD}.mp4`,
        `media/videos/public/c1/${UPLOAD}.jpg`,
      ]);
      expect(payload.delete).toHaveBeenCalledWith({ collection: "video-uploads", id: 3 });
    }
  });

  it("refuses an impossible length", async () => {
    const { deps } = fakes({
      uploads: [upload()],
      heads: [{ contentType: "video/mp4", bytes: 10 }, { contentType: "image/jpeg", bytes: 10 }],
    });
    await expect(finishVideoPost(deps, { ...finish, durationSeconds: 400 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("removePostVideo", () => {
  it("removes both files of a video post and ignores other posts", async () => {
    const { storage } = fakes();
    await removePostVideo(storage, { video: { key: "a.mp4", thumbnailKey: "a.jpg" } });
    expect(storage.remove).toHaveBeenCalledWith(["a.mp4", "a.jpg"]);
    storage.remove.mockClear();
    await removePostVideo(storage, { video: null });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/video-posts.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/server/communities/video-posts.ts
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";

import {
  MAX_THUMB_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  THUMB_CONTENT_TYPE,
  VIDEO_CONTENT_TYPE,
  VIDEO_UPLOADS_PER_DAY,
  storageClassFor,
  videoObjectKeys,
  type VideoVisibility,
} from "@/lib/video-rules";
import type { PresignedUpload, VideoStorage } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type VideoPostDeps = {
  payload: Payload;
  storage: VideoStorage;
  now?: () => Date;
  newUploadId?: () => string;
};

/** Grants one video and one thumbnail upload, within the daily limit. */
export async function issueVideoUpload(
  deps: VideoPostDeps,
  input: { userId: string; communityId: string; visibility: VideoVisibility },
): Promise<{ uploadId: string; video: PresignedUpload; thumbnail: PresignedUpload }> {
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { totalDocs } = await deps.payload.count({
    collection: "video-uploads",
    where: {
      and: [{ userId: { equals: input.userId } }, { createdAt: { greater_than: since } }],
    },
  });
  if (totalDocs >= VIDEO_UPLOADS_PER_DAY) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "You've posted the most videos allowed for today. Try again tomorrow.",
    });
  }
  const uploadId = deps.newUploadId?.() ?? randomUUID();
  await deps.payload.create({
    collection: "video-uploads",
    data: {
      uploadId,
      userId: input.userId,
      communityId: input.communityId,
      visibility: input.visibility,
    },
  });
  const keys = videoObjectKeys({ ...input, uploadId });
  const [video, thumbnail] = await Promise.all([
    deps.storage.presignUpload({
      key: keys.video,
      contentType: VIDEO_CONTENT_TYPE,
      maxBytes: MAX_VIDEO_BYTES,
    }),
    deps.storage.presignUpload({
      key: keys.thumbnail,
      contentType: THUMB_CONTENT_TYPE,
      maxBytes: MAX_THUMB_BYTES,
    }),
  ]);
  return { uploadId, video, thumbnail };
}

/**
 * Turns a finished upload into a post. Trusts nothing from the client for
 * access: the grant must be the caller's and unused, and both stored objects
 * must exist with the right type and size. Size and length from the client
 * are kept for layout only, after a sanity check.
 */
export async function finishVideoPost(
  deps: VideoPostDeps,
  input: {
    userId: string;
    authorName: string;
    communityId: string;
    uploadId: string;
    caption: string;
    topicSlug: string;
    durationSeconds: number;
    width: number;
    height: number;
  },
) {
  const { docs } = await deps.payload.find({
    collection: "video-uploads",
    where: { uploadId: { equals: input.uploadId } },
    limit: 1,
    depth: 0,
  });
  const grant = docs[0];
  if (
    !grant ||
    grant.userId !== input.userId ||
    grant.communityId !== input.communityId ||
    grant.finishedAt
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That upload has expired. Please try again." });
  }
  const visibility = grant.visibility as VideoVisibility;
  const keys = videoObjectKeys({
    visibility,
    communityId: grant.communityId,
    uploadId: grant.uploadId,
  });
  const [video, thumbnail] = await Promise.all([
    deps.storage.inspect(keys.video),
    deps.storage.inspect(keys.thumbnail),
  ]);
  const valid =
    video?.contentType === VIDEO_CONTENT_TYPE &&
    video.bytes > 0 &&
    video.bytes <= MAX_VIDEO_BYTES &&
    thumbnail?.contentType === THUMB_CONTENT_TYPE &&
    thumbnail.bytes > 0 &&
    thumbnail.bytes <= MAX_THUMB_BYTES &&
    input.durationSeconds > 0 &&
    input.durationSeconds <= MAX_VIDEO_SECONDS + 1 &&
    input.width > 0 &&
    input.width <= 4096 &&
    input.height > 0 &&
    input.height <= 4096;
  if (!valid) {
    await deps.storage.remove([keys.video, keys.thumbnail]);
    await deps.payload.delete({ collection: "video-uploads", id: grant.id });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The video didn't upload correctly. Please try again.",
    });
  }
  const post = await deps.payload.create({
    collection: "feed-posts",
    data: {
      content: input.caption,
      authorId: input.userId,
      authorName: input.authorName,
      communityId: input.communityId,
      topicSlug: input.topicSlug,
      likeCount: 0,
      commentCount: 0,
      visibility,
      video: {
        key: keys.video,
        thumbnailKey: keys.thumbnail,
        storage: storageClassFor(visibility),
        durationSeconds: Math.round(input.durationSeconds * 10) / 10,
        width: Math.round(input.width),
        height: Math.round(input.height),
        bytes: video.bytes,
      },
    },
  });
  await deps.payload.update({
    collection: "video-uploads",
    id: grant.id,
    data: { finishedAt: (deps.now?.() ?? new Date()).toISOString() },
  });
  return post;
}

/** Deletes a video post's files. Safe to call for posts without a video. */
export async function removePostVideo(
  storage: VideoStorage,
  post: { video?: { key?: string | null; thumbnailKey?: string | null } | null },
): Promise<void> {
  const keys = [post.video?.key, post.video?.thumbnailKey].filter(
    (key): key is string => Boolean(key),
  );
  await storage.remove(keys);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/communities/video-posts.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Wire the router**

In `src/server/api/routers/feed.ts`, add these imports:

```ts
import { VIDEO_VISIBILITIES } from "@/lib/video-rules";
import { isCommunityVideosEnabled } from "@/lib/community-videos-flag";
import { getVideoStorage } from "@/server/media/video-storage";
import {
  finishVideoPost,
  issueVideoUpload,
  removePostVideo,
} from "@/server/communities/video-posts";
```

Then add these procedures after `createPost`:

```ts
  // ── createVideoUpload ───────────────────────────────────────────────────────
  createVideoUpload: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        visibility: z.enum(VIDEO_VISIBILITIES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isCommunityVideosEnabled()) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      return issueVideoUpload(
        { payload: await getPayloadClient(), storage: getVideoStorage() },
        {
          userId: ctx.session.user.id,
          communityId: community.id,
          visibility: input.visibility,
        },
      );
    }),

  // ── finishVideoPost ─────────────────────────────────────────────────────────
  finishVideoPost: protectedProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        uploadId: z.string().uuid(),
        caption: z.string().trim().min(1).max(2000),
        topicSlug: z.string().optional(),
        durationSeconds: z.number().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const community = await requireFeedPoster(
        ctx.db,
        input.communitySlug,
        ctx.session.user.id,
      );
      const post = await finishVideoPost(
        { payload: await getPayloadClient(), storage: getVideoStorage() },
        {
          userId: ctx.session.user.id,
          authorName: ctx.session.user.name ?? "member",
          communityId: community.id,
          uploadId: input.uploadId,
          caption: input.caption,
          topicSlug: input.topicSlug ?? "general",
          durationSeconds: input.durationSeconds,
          width: input.width,
          height: input.height,
        },
      );
      await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.FEED_POST_CREATE);
      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "feed.post_created",
        targetType: "feed-posts",
        targetId: String(post.id),
        communityId: community.id,
        metadata: { communityId: community.id, video: true },
      });
      return post;
    }),
```

In `deletePost`, replace the final `return payload.update({...})` with this, so a deleted video's files are removed too:

```ts
      const deleted = await payload.update({
        collection: "feed-posts",
        id: input.postId,
        data: {
          isDeleted: true,
          content: "",
          authorName: "",
          imageUrl: null,
        },
      });
      if (post.video?.key) await removePostVideo(getVideoStorage(), post);
      return deleted;
```

- [ ] **Step 6: Run tests and type check**

Run: `npx vitest run src/server && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/communities/video-posts.ts src/server/communities/video-posts.test.ts src/server/api/routers/feed.ts
git commit -m "feat(videos): upload grants, checked finish, and file cleanup on delete"
```

---

### Task 7: Read path: visibility filter and playback links in feeds

**Files:**
- Modify: `src/server/communities/feed-posts.ts` (`decorateFeedPosts` adds a `video` view)
- Modify: `src/server/api/routers/feed.ts` (`getFeed` applies `postVisibilityWhere`; pass storage)
- Modify: `src/server/communities/activity-feed.ts` (posts and pinned apply `postVisibilityWhere`; pass storage; `viewer` input)
- Test: `src/server/communities/feed-posts-video.test.ts`

**Interfaces:**
- Consumes:
  - Task 2 `postVisibilityWhere`, `isModeratorRole`, `FeedViewer`;
  - Task 4 `VideoStorage`, `getVideoStorage`.
- Produces:
  - `type FeedVideoView = { url: string; thumbnailUrl: string; durationSeconds: number; width: number; height: number; visibility: "community" | "public" }`
  - `FeedPostView` gains `video: FeedVideoView | null` (it replaces the raw Payload `video` group in the response, so storage keys are never sent to the client);
  - `decorateFeedPosts(db, payload, posts, viewerId, storage)`;
  - `loadCommunityActivity({ ..., viewer: FeedViewer, storage: VideoStorage })`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/feed-posts-video.test.ts
import { describe, expect, it, vi } from "vitest";

import { decorateFeedPosts } from "./feed-posts";

const base = {
  id: 1,
  content: "hi",
  authorId: "",
  communityId: "c1",
  topicSlug: "general",
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
  visibility: "community" as const,
};

describe("decorateFeedPosts video view", () => {
  it("swaps storage keys for playback links and keeps posts without video as null", async () => {
    const storage = {
      playbackUrl: vi.fn().mockImplementation((key: string, cls: string) => Promise.resolve(`${cls}:${key}`)),
      presignUpload: vi.fn(),
      inspect: vi.fn(),
      remove: vi.fn(),
    };
    const [withVideo, plain] = await decorateFeedPosts(
      {} as never,
      {} as never,
      [
        {
          ...base,
          video: {
            key: "private/videos/c1/u.mp4",
            thumbnailKey: "private/videos/c1/u.jpg",
            storage: "private",
            durationSeconds: 12,
            width: 720,
            height: 1280,
            bytes: 9,
          },
        },
        { ...base, id: 2 },
      ] as never,
      null,
      storage,
    );
    expect(withVideo!.video).toEqual({
      url: "private:private/videos/c1/u.mp4",
      thumbnailUrl: "private:private/videos/c1/u.jpg",
      durationSeconds: 12,
      width: 720,
      height: 1280,
      visibility: "community",
    });
    expect(JSON.stringify(withVideo)).not.toContain('"key"');
    expect(plain!.video).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/feed-posts-video.test.ts`
Expected: FAIL: `decorateFeedPosts` takes no storage, and `video` is the raw group.

- [ ] **Step 3: Implement**

In `src/server/communities/feed-posts.ts`:

```ts
import type { VideoStorage } from "@/server/media/video-storage";

export type FeedVideoView = {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  visibility: "community" | "public";
};

export type FeedPostView = Omit<FeedPost, "video"> & {
  authorImage: string | null;
  hasLiked: boolean;
  video: FeedVideoView | null;
};

async function videoView(
  post: FeedPost,
  storage: VideoStorage,
): Promise<FeedVideoView | null> {
  const video = post.video;
  if (!video?.key || !video.thumbnailKey || !video.storage) return null;
  const [url, thumbnailUrl] = await Promise.all([
    storage.playbackUrl(video.key, video.storage),
    storage.playbackUrl(video.thumbnailKey, video.storage),
  ]);
  return {
    url,
    thumbnailUrl,
    durationSeconds: video.durationSeconds ?? 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    visibility: post.visibility === "public" ? "public" : "community",
  };
}
```

Change `decorateFeedPosts` to take `storage: VideoStorage` as its fifth parameter. In the final `map`, build each view with `video: await videoView(post, storage)`. Use `Promise.all(posts.map(async (post) => ({ ...post, authorImage: ..., hasLiked: ..., video: await videoView(post, storage) })))`.

In `src/server/api/routers/feed.ts` `getFeed`:
- push `postVisibilityWhere({ userId: ctx.session.user.id, isMember: true, isModerator: isModeratorRole(community.role) })` into `whereClause.and`;
- pass `getVideoStorage()` to `decorateFeedPosts`.
- Keep the existing `isDeleted` clause; it's harmlessly duplicated by the filter.

In `src/server/communities/activity-feed.ts`:
- add `viewer: FeedViewer` and `storage: VideoStorage` to the `loadCommunityActivity` input;
- add `postVisibilityWhere(viewer)` to both the `feed-posts` stream query's clauses and the pinned query's `and`;
- pass `storage` to both `decorateFeedPosts` calls.

In `getActivity` in the router, pass:

```ts
        viewer: {
          userId: ctx.session.user.id,
          isMember: true,
          isModerator: isModeratorRole(community.role),
        },
        storage: getVideoStorage(),
```

- [ ] **Step 4: Run tests and type check**

Run: `npx vitest run src/server src/components/communities src/lib && npx tsc --noEmit -p .`
Expected: PASS. The UI's `FeedPostCard` type still compiles because `video` is new and optional to it.

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/feed-posts.ts src/server/communities/feed-posts-video.test.ts src/server/api/routers/feed.ts src/server/communities/activity-feed.ts
git commit -m "feat(videos): playback links and the shared visibility filter on every feed read"
```

---

### Task 8: Reporting and moderator review

**Files:**
- Create: `src/server/communities/post-reports.ts`
- Test: `src/server/communities/post-reports.test.ts`
- Modify: `src/server/api/routers/feed.ts` (`reportPost`, `reviewReport`)

**Interfaces:**
- Consumes: Task 2 `canViewPost`, `isModeratorRole`; Task 6 `removePostVideo`.
- Produces:
  - `REPORT_REASONS = ["spam", "inappropriate", "copyright", "other"] as const`
  - `type ReportDeps = { payload: Payload; notifyModerators: (input: { communityId: string; postId: number }) => Promise<void>; storage: VideoStorage; now?: () => Date }`
  - `reportPost(deps, { postId, reporterId, reason, note, viewer }): Promise<{ hidden: boolean }>`
  - `reviewReport(deps, { postId, action: "restore" | "remove" }): Promise<void>`
  - tRPC: `feed.reportPost({ postId, reason, note? })`, `feed.reviewReport({ postId, action })`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/post-reports.test.ts
import { describe, expect, it, vi } from "vitest";

import { reportPost, reviewReport } from "./post-reports";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const member = { userId: "r1", isMember: true, isModerator: false };

function fakes(post: Record<string, unknown> | null, existing: unknown[] = []) {
  const payload = {
    findByID: vi.fn().mockImplementation(() =>
      post ? Promise.resolve(post) : Promise.reject(Object.assign(new Error("nf"), { status: 404 })),
    ),
    find: vi.fn().mockResolvedValue({ docs: existing }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const notifyModerators = vi.fn().mockResolvedValue(undefined);
  const storage = { remove: vi.fn().mockResolvedValue(undefined) };
  return {
    payload,
    notifyModerators,
    storage,
    deps: { payload: payload as never, notifyModerators, storage: storage as never, now: () => NOW },
  };
}

const video = {
  id: 5,
  authorId: "a1",
  communityId: "c1",
  visibility: "public",
  hiddenAt: null,
  reportCount: 0,
  isDeleted: false,
  video: { key: "k.mp4", thumbnailKey: "k.jpg" },
};

describe("reportPost", () => {
  it("records the report, hides the post, and tells moderators once", async () => {
    const { deps, payload, notifyModerators } = fakes(video);
    await expect(
      reportPost(deps, { postId: 5, reporterId: "r1", reason: "spam", note: "", viewer: member }),
    ).resolves.toEqual({ hidden: true });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "post-reports",
      data: { post: 5, reporterId: "r1", reason: "spam", note: undefined },
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt: NOW.toISOString(), reportCount: 1 },
    });
    expect(notifyModerators).toHaveBeenCalledWith({ communityId: "c1", postId: 5 });
  });

  it("doesn't notify again when the post is already hidden", async () => {
    const { deps, notifyModerators } = fakes({ ...video, hiddenAt: NOW.toISOString(), reportCount: 1 });
    await reportPost(deps, { postId: 5, reporterId: "r2", reason: "other", note: "x", viewer: { ...member, userId: "r2" } });
    expect(notifyModerators).not.toHaveBeenCalled();
  });

  it("refuses your own post, a second report, and a post you can't see", async () => {
    await expect(
      reportPost(fakes(video).deps, { postId: 5, reporterId: "a1", reason: "spam", note: "", viewer: { ...member, userId: "a1" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      reportPost(fakes(video, [{ id: 1 }]).deps, { postId: 5, reporterId: "r1", reason: "spam", note: "", viewer: member }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      reportPost(fakes({ ...video, visibility: "community" }).deps, {
        postId: 5,
        reporterId: "r1",
        reason: "spam",
        note: "",
        viewer: { userId: "r1", isMember: false, isModerator: false },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reviewReport", () => {
  it("restore shows the post again and clears its reports", async () => {
    const { deps, payload } = fakes({ ...video, hiddenAt: NOW.toISOString(), reportCount: 2 });
    await reviewReport(deps, { postId: 5, action: "restore" });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { hiddenAt: null, reportCount: 0 },
    });
    expect(payload.delete).toHaveBeenCalledWith({ collection: "post-reports", where: { post: { equals: 5 } } });
  });

  it("remove deletes the post, its files, and its reports", async () => {
    const { deps, payload, storage } = fakes({ ...video, hiddenAt: NOW.toISOString() });
    await reviewReport(deps, { postId: 5, action: "remove" });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { isDeleted: true, content: "", authorName: "", imageUrl: null },
    });
    expect(storage.remove).toHaveBeenCalledWith(["k.mp4", "k.jpg"]);
    expect(payload.delete).toHaveBeenCalledWith({ collection: "post-reports", where: { post: { equals: 5 } } });
  });

  it("reviewing a post its author already deleted clears its reports and says not found", async () => {
    const { deps, payload } = fakes({ ...video, isDeleted: true });
    await expect(reviewReport(deps, { postId: 5, action: "restore" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(payload.delete).toHaveBeenCalledWith({ collection: "post-reports", where: { post: { equals: 5 } } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/post-reports.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/server/communities/post-reports.ts
import { TRPCError } from "@trpc/server";

import type { VideoStorage } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import { canViewPost, type FeedViewer } from "./post-visibility";
import { removePostVideo } from "./video-posts";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export const REPORT_REASONS = ["spam", "inappropriate", "copyright", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportDeps = {
  payload: Payload;
  storage: VideoStorage;
  notifyModerators: (input: { communityId: string; postId: number }) => Promise<void>;
  now?: () => Date;
};

async function loadPost(payload: Payload, postId: number) {
  try {
    return await payload.findByID({ collection: "feed-posts", id: postId, depth: 0 });
  } catch {
    return null;
  }
}

/** The first report hides the post until a moderator reviews it. */
export async function reportPost(
  deps: ReportDeps,
  input: {
    postId: number;
    reporterId: string;
    reason: ReportReason;
    note: string;
    viewer: FeedViewer;
  },
): Promise<{ hidden: boolean }> {
  const post = await loadPost(deps.payload, input.postId);
  if (!post || !canViewPost(post, input.viewer)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (post.authorId === input.reporterId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You can't report your own post." });
  }
  const { docs: existing } = await deps.payload.find({
    collection: "post-reports",
    where: {
      and: [{ post: { equals: post.id } }, { reporterId: { equals: input.reporterId } }],
    },
    limit: 1,
    depth: 0,
  });
  if (existing.length > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "You already reported this post." });
  }
  await deps.payload.create({
    collection: "post-reports",
    data: {
      post: post.id,
      reporterId: input.reporterId,
      reason: input.reason,
      note: input.note.trim() || undefined,
    },
  });
  const firstReport = !post.hiddenAt;
  await deps.payload.update({
    collection: "feed-posts",
    id: post.id,
    data: {
      hiddenAt: post.hiddenAt ?? (deps.now?.() ?? new Date()).toISOString(),
      reportCount: (post.reportCount ?? 0) + 1,
    },
  });
  if (firstReport && post.communityId) {
    await deps.notifyModerators({ communityId: post.communityId, postId: post.id });
  }
  return { hidden: true };
}

/** Restore shows the post again; remove deletes it and its files. */
export async function reviewReport(
  deps: ReportDeps,
  input: { postId: number; action: "restore" | "remove" },
): Promise<void> {
  const clearReports = () =>
    deps.payload.delete({
      collection: "post-reports",
      where: { post: { equals: input.postId } },
    });
  const post = await loadPost(deps.payload, input.postId);
  if (!post || post.isDeleted) {
    await clearReports();
    throw new TRPCError({ code: "NOT_FOUND", message: "This post no longer exists." });
  }
  if (input.action === "restore") {
    await deps.payload.update({
      collection: "feed-posts",
      id: post.id,
      data: { hiddenAt: null, reportCount: 0 },
    });
  } else {
    await deps.payload.update({
      collection: "feed-posts",
      id: post.id,
      data: { isDeleted: true, content: "", authorName: "", imageUrl: null },
    });
    await removePostVideo(deps.storage, post);
  }
  await clearReports();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/communities/post-reports.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the router, with moderator notifications**

Add to `src/server/api/routers/feed.ts`:
- import `{ REPORT_REASONS, reportPost, reviewReport }` from `@/server/communities/post-reports`;
- import `{ isModeratorRole }` from `@/server/communities/post-visibility`;
- import `notifications` from `@/server/db/schema`;
- import `inArray` from `drizzle-orm`.

Then add:

```ts
async function notifyPostReported(
  database: typeof import("@/server/db").db,
  input: { communityId: string; postId: number },
) {
  const community = await database.query.communities.findFirst({
    where: eq(communities.id, input.communityId),
    columns: { slug: true, name: true },
  });
  const moderators = await database
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, input.communityId),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, ["owner", "admin", "moderator"]),
      ),
    );
  if (!community || moderators.length === 0) return;
  const path = `/communities/${community.slug}`;
  await database.insert(notifications).values(
    moderators.map(({ userId }) => ({
      userId,
      type: "post_reported",
      title: "A post was reported",
      content: `A post in **${community.name}** was reported and is hidden until you review it. [Review it](${path}).`,
      communityId: input.communityId,
      metadata: { postId: input.postId, path },
    })),
  );
}
```

```ts
  // ── reportPost ──────────────────────────────────────────────────────────────
  reportPost: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        reason: z.enum(REPORT_REASONS),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const post = await payload
        .findByID({ collection: "feed-posts", id: input.postId, depth: 0 })
        .catch(() => null);
      if (!post?.communityId) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, post.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
        columns: { role: true },
      });
      return reportPost(
        {
          payload,
          storage: getVideoStorage(),
          notifyModerators: (args) => notifyPostReported(ctx.db, args),
        },
        {
          postId: input.postId,
          reporterId: ctx.session.user.id,
          reason: input.reason,
          note: input.note ?? "",
          viewer: {
            userId: ctx.session.user.id,
            isMember: Boolean(membership),
            isModerator: isModeratorRole(membership?.role),
          },
        },
      );
    }),

  // ── reviewReport ────────────────────────────────────────────────────────────
  reviewReport: protectedProcedure
    .input(z.object({ postId: z.number(), action: z.enum(["restore", "remove"]) }))
    .mutation(async ({ ctx, input }) => {
      const payload = await getPayloadClient();
      const post = await payload
        .findByID({ collection: "feed-posts", id: input.postId, depth: 0 })
        .catch(() => null);
      if (!post?.communityId) throw new TRPCError({ code: "NOT_FOUND" });
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, post.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
        columns: { role: true },
      });
      if (!isModeratorRole(membership?.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await reviewReport(
        {
          payload,
          storage: getVideoStorage(),
          notifyModerators: async () => undefined,
        },
        input,
      );
      return { ok: true };
    }),
```

- [ ] **Step 6: Run tests and type check**

Run: `npx vitest run src/server && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/communities/post-reports.ts src/server/communities/post-reports.test.ts src/server/api/routers/feed.ts
git commit -m "feat(videos): report a post, hide it, and let moderators restore or remove it"
```

---

### Task 9: Reels query (members and visitors)

**Files:**
- Create: `src/server/communities/reels.ts`
- Test: `src/server/communities/reels.test.ts`
- Modify: `src/server/api/routers/feed.ts` (`getReels`, a `publicProcedure`)

**Interfaces:**
- Consumes: Task 2 `postVisibilityWhere`, `canViewPost`; Task 7 `decorateFeedPosts`, `FeedPostView`; Task 4 `VideoStorage`.
- Produces:
  - `type ReelsCursor = { createdAt: string; id: number }`
  - `listReels(deps: { database, payload, storage }, { community: { id: string }, viewer: FeedViewer, cursor: ReelsCursor | null, startAtPostId: number | null, limit: number }): Promise<{ items: FeedPostView[]; nextCursor: ReelsCursor | null; notice: "members_only" | "unavailable" | null }>`
  - tRPC: `feed.getReels({ communitySlug, cursor?, startAtPostId?, limit? })`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/reels.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./feed-posts", () => ({
  decorateFeedPosts: vi.fn((_db, _p, posts) => Promise.resolve(posts.map((p: object) => ({ ...p })))),
}));

import { listReels } from "./reels";

const visitor = { userId: null, isMember: false, isModerator: false };
const member = { userId: "m", isMember: true, isModerator: false };
const video = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  authorId: "a",
  communityId: "c1",
  createdAt: `2026-09-2${id}T00:00:00.000Z`,
  visibility: "public",
  hiddenAt: null,
  isDeleted: false,
  video: { key: `${id}.mp4` },
  ...over,
});

function deps(docs: unknown[], byId: Record<number, unknown> = {}) {
  const payload = {
    find: vi.fn().mockResolvedValue({ docs }),
    findByID: vi.fn().mockImplementation(({ id }) =>
      byId[id] ? Promise.resolve(byId[id]) : Promise.reject(new Error("nf")),
    ),
  };
  return { payload, deps: { database: {} as never, payload: payload as never, storage: {} as never } };
}

describe("listReels", () => {
  it("asks for video posts only, filtered by the visitor's visibility", async () => {
    const { deps: d, payload } = deps([video(3), video(2)]);
    const page = await listReels(d, { community: { id: "c1" }, viewer: visitor, cursor: null, startAtPostId: null, limit: 1 });
    const where = payload.find.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain('"visibility":{"equals":"public"}');
    expect(JSON.stringify(where)).toContain('"video.key":{"exists":true}');
    expect(page.items.map((p) => p.id)).toEqual([3]);
    expect(page.nextCursor).toEqual({ createdAt: video(3).createdAt, id: 3 });
    expect(page.notice).toBeNull();
  });

  it("starts at a deep-linked video the viewer may see", async () => {
    const { deps: d } = deps([video(2)], { 3: video(3) });
    const page = await listReels(d, { community: { id: "c1" }, viewer: member, cursor: null, startAtPostId: 3, limit: 5 });
    expect(page.items.map((p) => p.id)).toEqual([3, 2]);
  });

  it("says 'members only' for a community-only deep link opened by a visitor", async () => {
    const { deps: d } = deps([], { 3: video(3, { visibility: "community" }) });
    const page = await listReels(d, { community: { id: "c1" }, viewer: visitor, cursor: null, startAtPostId: 3, limit: 5 });
    expect(page.notice).toBe("members_only");
    expect(page.items).toEqual([]);
  });

  it("says 'unavailable' for a hidden (reported) public video, never showing it", async () => {
    const { deps: d } = deps([], { 3: video(3, { hiddenAt: "2026-09-24T00:00:00.000Z" }) });
    const page = await listReels(d, { community: { id: "c1" }, viewer: visitor, cursor: null, startAtPostId: 3, limit: 5 });
    expect(page.notice).toBe("unavailable");
    expect(page.items).toEqual([]);
  });

  it("treats a deep link to another community's post as unavailable", async () => {
    const { deps: d } = deps([], { 3: video(3, { communityId: "other" }) });
    const page = await listReels(d, { community: { id: "c1" }, viewer: member, cursor: null, startAtPostId: 3, limit: 5 });
    expect(page.notice).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/reels.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/server/communities/reels.ts
import type { Where } from "payload";

import type { db as Db } from "@/server/db";
import type { VideoStorage } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import { decorateFeedPosts, type FeedPostView } from "./feed-posts";
import { canViewPost, postVisibilityWhere, type FeedViewer } from "./post-visibility";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;
export type ReelsCursor = { createdAt: string; id: number };

/**
 * A community's video posts, newest first, for Reels mode. Visitors get
 * public, non-hidden videos only; a deep link to anything else returns a
 * notice instead of the video.
 */
export async function listReels(
  deps: { database: typeof Db; payload: Payload; storage: VideoStorage },
  input: {
    community: { id: string };
    viewer: FeedViewer;
    cursor: ReelsCursor | null;
    startAtPostId: number | null;
    limit: number;
  },
): Promise<{
  items: FeedPostView[];
  nextCursor: ReelsCursor | null;
  notice: "members_only" | "unavailable" | null;
}> {
  let start: Awaited<ReturnType<Payload["findByID"]>> | null = null;
  if (input.startAtPostId && !input.cursor) {
    start = await deps.payload
      .findByID({ collection: "feed-posts", id: input.startAtPostId, depth: 0 })
      .catch(() => null);
    const sameCommunity = start?.communityId === input.community.id && start?.video?.key;
    if (!start || !sameCommunity) {
      return { items: [], nextCursor: null, notice: "unavailable" };
    }
    if (!canViewPost(start, input.viewer)) {
      const membersOnly =
        !input.viewer.isMember && start.visibility !== "public" && !start.hiddenAt && !start.isDeleted;
      return { items: [], nextCursor: null, notice: membersOnly ? "members_only" : "unavailable" };
    }
  }

  const after = input.cursor ?? (start ? { createdAt: start.createdAt, id: start.id } : null);
  const clauses: Where[] = [
    { communityId: { equals: input.community.id } },
    { "video.key": { exists: true } },
    postVisibilityWhere(input.viewer),
  ];
  if (after) {
    clauses.push({
      or: [
        { createdAt: { less_than: after.createdAt } },
        { and: [{ createdAt: { equals: after.createdAt } }, { id: { less_than: after.id } }] },
      ],
    });
  }
  const { docs } = await deps.payload.find({
    collection: "feed-posts",
    where: { and: clauses },
    sort: "-createdAt",
    limit: input.limit + 1,
    depth: 0,
  });
  const page = [...(start ? [start] : []), ...docs].slice(0, input.limit);
  const hasMore = (start ? 1 : 0) + docs.length > input.limit;
  const items = await decorateFeedPosts(
    deps.database,
    deps.payload,
    page,
    input.viewer.userId,
    deps.storage,
  );
  const last = page.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
    notice: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/communities/reels.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire `getReels` as a public procedure**

Add to `src/server/api/routers/feed.ts`:
- import `publicProcedure` from `@/server/api/trpc`;
- import `{ listReels }` from `@/server/communities/reels`.

```ts
  // ── getReels ────────────────────────────────────────────────────────────────
  getReels: publicProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        limit: z.number().min(1).max(20).default(8),
        cursor: z.object({ createdAt: z.string(), id: z.number() }).nullish(),
        startAtPostId: z.number().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const empty = { items: [], nextCursor: null, notice: null } as const;
      if (!isCommunityVideosEnabled()) return empty;
      const community = await ctx.db.query.communities.findFirst({
        where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
        columns: { id: true },
      });
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });
      const userId = ctx.session?.user?.id ?? null;
      const membership = userId
        ? await ctx.db.query.communityMemberships.findFirst({
            where: and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.userId, userId),
              eq(communityMemberships.status, "active"),
            ),
            columns: { role: true },
          })
        : undefined;
      return listReels(
        { database: ctx.db, payload: await getPayloadClient(), storage: getVideoStorage() },
        {
          community,
          viewer: {
            userId,
            isMember: Boolean(membership),
            isModerator: isModeratorRole(membership?.role),
          },
          cursor: input.cursor ?? null,
          startAtPostId: input.startAtPostId ?? null,
          limit: input.limit,
        },
      );
    }),
```

- [ ] **Step 6: Run tests and type check**

Run: `npx vitest run src/server && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/communities/reels.ts src/server/communities/reels.test.ts src/server/api/routers/feed.ts
git commit -m "feat(videos): reels query for members and visitors with safe deep links"
```

---

### Task 10: Daily cleanup of abandoned uploads

**Files:**
- Create: `src/server/communities/video-uploads-cleanup.ts`
- Test: `src/server/communities/video-uploads-cleanup.test.ts`
- Create: `src/app/api/cron/video-uploads-cleanup/route.ts`
- Modify: `vercel.json` (`crons` entry)

**Interfaces:**
- Consumes: Task 1 `ABANDONED_UPLOAD_HOURS`, `videoObjectKeys`; Task 4 `VideoStorage`.
- Produces: `cleanupAbandonedUploads(deps: { payload, storage, now? }): Promise<{ removed: number }>`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/video-uploads-cleanup.test.ts
import { describe, expect, it, vi } from "vitest";

import { cleanupAbandonedUploads } from "./video-uploads-cleanup";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

describe("cleanupAbandonedUploads", () => {
  it("deletes files and grants for uploads unfinished after 24 hours", async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 1, uploadId: UPLOAD, communityId: "c1", visibility: "community" }],
      }),
      delete: vi.fn().mockResolvedValue({}),
    };
    const storage = { remove: vi.fn().mockResolvedValue(undefined) };
    const now = new Date("2026-09-24T12:00:00.000Z");
    await expect(
      cleanupAbandonedUploads({ payload: payload as never, storage: storage as never, now: () => now }),
    ).resolves.toEqual({ removed: 1 });
    expect(payload.find.mock.calls[0]![0].where).toEqual({
      and: [
        { finishedAt: { exists: false } },
        { createdAt: { less_than: "2026-09-23T12:00:00.000Z" } },
      ],
    });
    expect(storage.remove).toHaveBeenCalledWith([
      `private/videos/c1/${UPLOAD}.mp4`,
      `private/videos/c1/${UPLOAD}.jpg`,
    ]);
    expect(payload.delete).toHaveBeenCalledWith({ collection: "video-uploads", id: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/communities/video-uploads-cleanup.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement the job, route, and schedule**

```ts
// src/server/communities/video-uploads-cleanup.ts
import { ABANDONED_UPLOAD_HOURS, videoObjectKeys, type VideoVisibility } from "@/lib/video-rules";
import type { VideoStorage } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** Removes files and grants for uploads nobody finished within 24 hours. */
export async function cleanupAbandonedUploads(deps: {
  payload: Payload;
  storage: VideoStorage;
  now?: () => Date;
}): Promise<{ removed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
  const { docs } = await deps.payload.find({
    collection: "video-uploads",
    where: {
      and: [
        { finishedAt: { exists: false } },
        { createdAt: { less_than: cutoff.toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
  });
  for (const grant of docs) {
    const keys = videoObjectKeys({
      visibility: grant.visibility as VideoVisibility,
      communityId: grant.communityId,
      uploadId: grant.uploadId,
    });
    await deps.storage.remove([keys.video, keys.thumbnail]);
    await deps.payload.delete({ collection: "video-uploads", id: grant.id });
  }
  return { removed: docs.length };
}
```

```ts
// src/app/api/cron/video-uploads-cleanup/route.ts
import { NextResponse } from "next/server";

import { cleanupAbandonedUploads } from "@/server/communities/video-uploads-cleanup";
import { getVideoStorage } from "@/server/media/video-storage";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: delete files and grants for video uploads never finished. */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await cleanupAbandonedUploads({
      payload: await getPayloadClient(),
      storage: getVideoStorage(),
    });
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[video-uploads-cleanup] error", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 200 });
  }
}
```

Add to `vercel.json` `crons`: `{ "path": "/api/cron/video-uploads-cleanup", "schedule": "30 3 * * *" }`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/server/communities/video-uploads-cleanup.test.ts && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/video-uploads-cleanup.ts src/server/communities/video-uploads-cleanup.test.ts src/app/api/cron/video-uploads-cleanup/route.ts vercel.json
git commit -m "feat(videos): daily cleanup of abandoned video uploads"
```

---

### Task 11: On-device conversion (Mediabunny)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (`mediabunny`, `@mediabunny/aac-encoder`, both `^1.59.1`)
- Create: `src/lib/video-transcode.ts`
- Test: `src/lib/video-transcode.test.ts`

**Interfaces:**
- Consumes: Task 1 constants and `fitWithin`.
- Produces:
  - `class VideoTooLongError extends Error`
  - `class UnsupportedVideoError extends Error`
  - `canTranscode(): Promise<boolean>`
  - `transcodeForUpload(file: File, opts: { onProgress?: (share: number) => void; signal?: AbortSignal }): Promise<{ video: Blob; thumbnail: Blob; durationSeconds: number; width: number; height: number }>`

- [ ] **Step 1: Install**

```bash
pnpm add mediabunny@^1.59.1 @mediabunny/aac-encoder@^1.59.1
```

- [ ] **Step 2: Write the failing test** (Mediabunny is mocked; real encoding is checked on devices in Task 15)

```ts
// src/lib/video-transcode.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mb = vi.hoisted(() => ({
  duration: 30,
  track: { displayWidth: 1080, displayHeight: 1920, getFirstTimestamp: async () => 0 } as unknown,
  init: vi.fn(),
  isValid: true,
  discarded: [] as Array<{ track: { type: string } }>,
}));

vi.mock("mediabunny", () => {
  class Input {
    computeDuration = async () => mb.duration;
    getPrimaryVideoTrack = async () => mb.track;
    dispose() {}
  }
  class Output {
    target = { buffer: new ArrayBuffer(8) };
  }
  class CanvasSink {
    getCanvas = async () => ({
      canvas: { convertToBlob: async () => new Blob(["jpg"], { type: "image/jpeg" }) },
    });
  }
  return {
    Input,
    Output,
    CanvasSink,
    BlobSource: class {},
    BufferTarget: class {},
    Mp4OutputFormat: class {},
    Quality: class {
      constructor(public opts: unknown) {}
    },
    ALL_FORMATS: [],
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => true,
    Conversion: {
      init: async (opts: unknown) => {
        mb.init(opts);
        return {
          isValid: mb.isValid,
          discardedTracks: mb.discarded,
          onProgress: null,
          execute: async () => undefined,
          cancel: async () => undefined,
        };
      },
    },
  };
});
vi.mock("@mediabunny/aac-encoder", () => ({ registerAacEncoder: vi.fn() }));

import {
  UnsupportedVideoError,
  VideoTooLongError,
  transcodeForUpload,
} from "./video-transcode";

const file = new File(["x"], "clip.mov", { type: "video/quicktime" });

beforeEach(() => {
  mb.duration = 30;
  mb.track = { displayWidth: 1080, displayHeight: 1920, getFirstTimestamp: async () => 0 };
  mb.init.mockReset();
  mb.isValid = true;
  mb.discarded = [];
});

describe("transcodeForUpload", () => {
  it("keeps portrait clips portrait, using the display (post-rotation) size", async () => {
    const result = await transcodeForUpload(file, {});
    const opts = mb.init.mock.calls[0]![0] as { video: Record<string, unknown> };
    expect(opts.video).toMatchObject({ codec: "avc", width: 720, height: 1280, fit: "fill", frameRate: 30 });
    expect(result).toMatchObject({ width: 720, height: 1280, durationSeconds: 30 });
    expect(result.video.type).toBe("video/mp4");
    expect(result.thumbnail.type).toBe("image/jpeg");
  });

  it("refuses clips over 90 seconds before converting", async () => {
    mb.duration = 91;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(VideoTooLongError);
    expect(mb.init).not.toHaveBeenCalled();
  });

  it("accepts clips with no audio track", async () => {
    mb.discarded = [{ track: { type: "audio" } }];
    await expect(transcodeForUpload(file, {})).resolves.toMatchObject({ width: 720 });
  });

  it("refuses files without a usable video track", async () => {
    mb.track = null;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(UnsupportedVideoError);
    mb.track = { displayWidth: 1080, displayHeight: 1920, getFirstTimestamp: async () => 0 };
    mb.isValid = false;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(UnsupportedVideoError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/video-transcode.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/video-transcode.ts
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";

import {
  AUDIO_BITRATE,
  MAX_VIDEO_SECONDS,
  VIDEO_BITRATE,
  VIDEO_CONTENT_TYPE,
  VIDEO_LONG_SIDE,
  VIDEO_MAX_FPS,
  fitWithin,
} from "./video-rules";

export class VideoTooLongError extends Error {}
export class UnsupportedVideoError extends Error {}

/** True when this browser can encode H.264 (WebCodecs). */
export async function canTranscode(): Promise<boolean> {
  if (typeof globalThis.VideoEncoder === "undefined") return false;
  return canEncodeVideo("avc", {
    width: VIDEO_LONG_SIDE,
    height: 720,
    quality: new Quality({ bitrate: VIDEO_BITRATE }),
  });
}

/**
 * Converts a picked clip to a 720p H.264 MP4 and a JPEG thumbnail, on the
 * device (ADR-0036). Uses the track's display size, which already accounts
 * for rotation, so portrait phone clips stay upright.
 */
export async function transcodeForUpload(
  file: File,
  opts: { onProgress?: (share: number) => void; signal?: AbortSignal },
): Promise<{
  video: Blob;
  thumbnail: Blob;
  durationSeconds: number;
  width: number;
  height: number;
}> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const durationSeconds = await input.computeDuration();
    if (durationSeconds > MAX_VIDEO_SECONDS) throw new VideoTooLongError();
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new UnsupportedVideoError();
    const size = fitWithin(track.displayWidth, track.displayHeight);

    if (!(await canEncodeAudio("aac"))) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
        width: size.width,
        height: size.height,
        fit: "fill",
        frameRate: VIDEO_MAX_FPS,
        quality: new Quality({ bitrate: VIDEO_BITRATE }),
        forceTranscode: true,
      },
      audio: { codec: "aac", quality: new Quality({ bitrate: AUDIO_BITRATE }) },
    });
    // A missing audio track is fine; a missing video track is not.
    const lostVideo = conversion.discardedTracks.some(
      (entry) => entry.track.type === "video",
    );
    if (!conversion.isValid || lostVideo) throw new UnsupportedVideoError();

    conversion.onProgress = (share) => opts.onProgress?.(share);
    opts.signal?.addEventListener("abort", () => void conversion.cancel(), { once: true });
    await conversion.execute();

    const sink = new CanvasSink(track, { width: size.width, height: size.height, fit: "fill" });
    const frame = await sink.getCanvas(await track.getFirstTimestamp());
    if (!frame) throw new UnsupportedVideoError();
    const canvas = frame.canvas as OffscreenCanvas | HTMLCanvasElement;
    const thumbnail =
      "convertToBlob" in canvas
        ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })
        : await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new UnsupportedVideoError())),
              "image/jpeg",
              0.8,
            ),
          );

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new UnsupportedVideoError();
    return {
      video: new Blob([buffer], { type: VIDEO_CONTENT_TYPE }),
      thumbnail,
      durationSeconds,
      width: size.width,
      height: size.height,
    };
  } finally {
    input.dispose();
  }
}
```

If `npx tsc` reports that an option name differs in the installed Mediabunny version, check `node_modules/mediabunny/dist/*.d.ts` and use the installed name. The options used here (`frameRate`, `quality`, `fit`, `fastStart`, `discardedTracks`) are from the 1.59 docs.

- [ ] **Step 5: Run tests and type check**

Run: `npx vitest run src/lib/video-transcode.test.ts && npx tsc --noEmit -p .`
Expected: PASS (4 tests), and no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/video-transcode.ts src/lib/video-transcode.test.ts
git commit -m "feat(videos): convert clips to 720p H.264 on the device before upload"
```

---

### Task 12: Composer: pick, prepare, upload, post

**Files:**
- Create: `src/components/communities/feed/use-video-post.ts`
- Create: `src/components/communities/feed/video-attachment.tsx`
- Modify: `src/components/communities/feed/post-composer.tsx`
- Modify: `messages/en.json`, `messages/nl.json` (`communities.video`)
- Test: `src/components/communities/feed/video-attachment.test.tsx`

**Interfaces:**
- Consumes: Task 11 `canTranscode`, `transcodeForUpload`, and the errors; tRPC `feed.createVideoUpload`, `feed.finishVideoPost`; the Task 5 flag.
- Produces:
  - `type VideoPostState = { step: "idle" } | { step: "preparing" | "uploading"; share: number } | { step: "posting" } | { step: "error"; message: string }`
  - `useVideoPost(slug)` returning `{ state, post(input: { file: File; caption: string; visibility: VideoVisibility; topicSlug: string }): Promise<boolean>, cancel(): void, reset(): void }`
  - `<VideoAttachment file visibility onVisibilityChange onRemove state />`

- [ ] **Step 1: Add copy** (`communities.video` in `messages/en.json`, same keys in `nl.json`)

```json
"video": {
  "add": "Add video",
  "remove": "Remove video",
  "visibilityLabel": "Who can watch",
  "community": "Community only",
  "public": "Public — anyone with the link can watch",
  "preparing": "Preparing video…",
  "uploading": "Uploading…",
  "posting": "Posting…",
  "cancel": "Cancel",
  "tooLong": "Videos can be up to 90 seconds.",
  "unsupported": "Your browser can't prepare videos. Update it or use a recent Chrome, Safari, Edge, or Firefox.",
  "failed": "The video didn't upload. Please try again.",
  "limit": "You've posted the most videos allowed for today. Try again tomorrow."
}
```

Dutch (`nl.json`):

```json
"video": {
  "add": "Video toevoegen",
  "remove": "Video verwijderen",
  "visibilityLabel": "Wie mag kijken",
  "community": "Alleen de community",
  "public": "Openbaar — iedereen met de link kan kijken",
  "preparing": "Video voorbereiden…",
  "uploading": "Uploaden…",
  "posting": "Plaatsen…",
  "cancel": "Annuleren",
  "tooLong": "Video's mogen maximaal 90 seconden duren.",
  "unsupported": "Je browser kan geen video's voorbereiden. Werk hem bij of gebruik een recente Chrome, Safari, Edge of Firefox.",
  "failed": "De video is niet geüpload. Probeer het opnieuw.",
  "limit": "Je hebt vandaag het maximale aantal video's geplaatst. Probeer het morgen opnieuw."
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/communities/feed/video-attachment.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { VideoAttachment } from "./video-attachment";

const file = new File(["x"], "demo.mp4", { type: "video/mp4" });

function renderIt(props: Partial<React.ComponentProps<typeof VideoAttachment>> = {}) {
  const onVisibilityChange = vi.fn();
  const onRemove = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VideoAttachment
        file={file}
        visibility="community"
        onVisibilityChange={onVisibilityChange}
        onRemove={onRemove}
        onCancel={onCancel}
        state={{ step: "idle" }}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onVisibilityChange, onRemove, onCancel };
}

describe("VideoAttachment", () => {
  it("defaults to community only and switches to public", () => {
    const { onVisibilityChange } = renderIt();
    expect(screen.getByRole("radio", { name: "Community only" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    expect(onVisibilityChange).toHaveBeenCalledWith("public");
  });

  it("shows progress while preparing, with a cancel", () => {
    const { onCancel } = renderIt({ state: { step: "preparing", share: 0.4 } });
    expect(screen.getByText("Preparing video…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the error in plain words", () => {
    renderIt({ state: { step: "error", message: en.communities.video.tooLong } });
    expect(screen.getByRole("alert")).toHaveTextContent("Videos can be up to 90 seconds.");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/communities/feed/video-attachment.test.tsx`
Expected: FAIL, the module is missing.

- [ ] **Step 4: Implement the hook and the attachment**

```ts
// src/components/communities/feed/use-video-post.ts
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { VideoVisibility } from "@/lib/video-rules";
import {
  UnsupportedVideoError,
  VideoTooLongError,
  canTranscode,
  transcodeForUpload,
} from "@/lib/video-transcode";
import { api } from "@/trpc/react";

export type VideoPostState =
  | { step: "idle" }
  | { step: "preparing" | "uploading"; share: number }
  | { step: "posting" }
  | { step: "error"; message: string };

/** POSTs a file to a presigned S3 form, reporting upload progress. */
function uploadToGrant(
  grant: { url: string; fields: Record<string, string> },
  blob: Blob,
  onProgress: (share: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(grant.fields)) form.append(name, value);
    form.append("file", blob); // S3 requires the file field last.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", grant.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status)));
    xhr.onerror = () => reject(new Error("network"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Prepare on the device, upload straight to S3, then create the post. */
export function useVideoPost(slug: string) {
  const t = useTranslations("communities.video");
  const utils = api.useUtils();
  const [state, setState] = useState<VideoPostState>({ step: "idle" });
  const abort = useRef<AbortController | null>(null);
  const createUpload = api.feed.createVideoUpload.useMutation();
  const finish = api.feed.finishVideoPost.useMutation();

  async function post(input: {
    file: File;
    caption: string;
    visibility: VideoVisibility;
    topicSlug: string;
  }): Promise<boolean> {
    const controller = new AbortController();
    abort.current = controller;
    try {
      if (!(await canTranscode())) throw new UnsupportedVideoError();
      setState({ step: "preparing", share: 0 });
      const prepared = await transcodeForUpload(input.file, {
        signal: controller.signal,
        onProgress: (share) => setState({ step: "preparing", share }),
      });
      setState({ step: "uploading", share: 0 });
      const grant = await createUpload.mutateAsync({
        communitySlug: slug,
        visibility: input.visibility,
      });
      await uploadToGrant(grant.thumbnail, prepared.thumbnail, () => undefined, controller.signal);
      await uploadToGrant(
        grant.video,
        prepared.video,
        (share) => setState({ step: "uploading", share }),
        controller.signal,
      );
      setState({ step: "posting" });
      await finish.mutateAsync({
        communitySlug: slug,
        uploadId: grant.uploadId,
        caption: input.caption,
        topicSlug: input.topicSlug,
        durationSeconds: prepared.durationSeconds,
        width: prepared.width,
        height: prepared.height,
      });
      await Promise.all([
        utils.feed.getActivity.invalidate({ communitySlug: slug }),
        utils.feed.getFeed.invalidate(),
        utils.feed.getReels.invalidate({ communitySlug: slug }),
      ]);
      setState({ step: "idle" });
      return true;
    } catch (error) {
      if (controller.signal.aborted) {
        setState({ step: "idle" });
        return false;
      }
      const code = (error as { data?: { code?: string } }).data?.code;
      setState({
        step: "error",
        message:
          error instanceof VideoTooLongError
            ? t("tooLong")
            : error instanceof UnsupportedVideoError
              ? t("unsupported")
              : code === "TOO_MANY_REQUESTS"
                ? t("limit")
                : t("failed"),
      });
      return false;
    } finally {
      abort.current = null;
    }
  }

  return {
    state,
    post,
    cancel: () => abort.current?.abort(),
    reset: () => setState({ step: "idle" }),
  };
}
```

```tsx
// src/components/communities/feed/video-attachment.tsx
"use client";

import { Film, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { VideoVisibility } from "@/lib/video-rules";
import type { VideoPostState } from "./use-video-post";

/** The picked clip in the composer: visibility, progress, and errors. */
export function VideoAttachment({
  file,
  visibility,
  onVisibilityChange,
  onRemove,
  onCancel,
  state,
}: {
  file: File;
  visibility: VideoVisibility;
  onVisibilityChange: (visibility: VideoVisibility) => void;
  onRemove: () => void;
  onCancel: () => void;
  state: VideoPostState;
}) {
  const t = useTranslations("communities.video");
  const busy = state.step === "preparing" || state.step === "uploading" || state.step === "posting";
  const share = "share" in state ? Math.round(state.share * 100) : 0;
  const label =
    state.step === "preparing"
      ? t("preparing")
      : state.step === "uploading"
        ? t("uploading")
        : state.step === "posting"
          ? t("posting")
          : null;

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm">
        <Film aria-hidden="true" className="text-muted-foreground size-4" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        {busy ? null : (
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label={t("remove")}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">{t("visibilityLabel")}</span>
        <SegmentedControl<VideoVisibility>
          aria-label={t("visibilityLabel")}
          size="sm"
          value={visibility}
          onValueChange={onVisibilityChange}
          options={[
            { value: "community", label: t("community") },
            { value: "public", label: t("public") },
          ]}
        />
      </div>
      {label ? (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-xs">{label}</span>
            <div
              role="progressbar"
              aria-label={label}
              aria-valuenow={state.step === "posting" ? 100 : share}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <Progress value={state.step === "posting" ? 100 : share} />
            </div>
          </div>
          {state.step === "posting" ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
        </div>
      ) : null}
      {state.step === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
```

The shared `Progress` has no `role`, so the wrapper `div` carries the progressbar semantics. Don't change the shared component.

- [ ] **Step 5: Wire into `post-composer.tsx`**

- Import `isCommunityVideosEnabled`, `useVideoPost`, `VideoAttachment`, the `Film` icon, and the `VideoVisibility` type.
- Add state: `const [videoFile, setVideoFile] = useState<File | null>(null); const [visibility, setVisibility] = useState<VideoVisibility>("community"); const videoPost = useVideoPost(slug); const videoInputRef = useRef<HTMLInputElement>(null);`
- Next to "Add Image", when `isCommunityVideosEnabled()` and there's no `imageUrl`, add a ghost button (label `t("add")` from `communities.video`, `Film` icon) that clicks a hidden `<input type="file" accept="video/*" ref={videoInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVideoFile(f); videoPost.reset(); } e.target.value = ""; }} />`.
- Hide the "Add Image" button while `videoFile` is set, so a post has one image *or* one video.
- Render `<VideoAttachment file={videoFile} visibility={visibility} onVisibilityChange={setVisibility} onRemove={() => setVideoFile(null)} onCancel={videoPost.cancel} state={videoPost.state} />` above the button row when `videoFile` is set.
- In `handleSubmit`: if `videoFile`, call `const ok = await videoPost.post({ file: videoFile, caption: content.trim(), visibility, topicSlug }); if (ok) { setContent(""); setVideoFile(null); setVisibility("community"); toast.success(t("postCreated")); }` and return. Otherwise keep the existing `createPost.mutate(...)` path.
- Disable the Post button while `videoPost.state.step` is `preparing`, `uploading`, or `posting`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/communities && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/communities/feed/use-video-post.ts src/components/communities/feed/video-attachment.tsx src/components/communities/feed/video-attachment.test.tsx src/components/communities/feed/post-composer.tsx messages/en.json messages/nl.json
git commit -m "feat(videos): post a video from the composer with visibility and progress"
```

---

### Task 13: Watching and moderating in the feed (player, report, review)

**Files:**
- Create: `src/components/communities/feed/feed-video-player.tsx`
- Create: `src/components/communities/feed/report-dialog.tsx`
- Create: `src/components/communities/feed/reported-banner.tsx`
- Modify: `src/components/communities/feed/feed-post-card.tsx`
- Modify: `messages/en.json`, `messages/nl.json` (`communities.report`)
- Test: `src/components/communities/feed/feed-video-player.test.tsx`, `src/components/communities/feed/report-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 7 `FeedVideoView` (as `post.video`); tRPC `feed.reportPost`, `feed.reviewReport`.
- Produces:
  - `<FeedVideoPlayer video onExpired? />`: muted autoplay at ≥ 60% visible, pauses when out of view, never autoplays under reduced motion, tap toggles sound;
  - `<ReportDialog postId open onOpenChange />`
  - `<ReportedBanner postId canReview />`

- [ ] **Step 1: Add copy** (`communities.report`, EN; the same keys in NL)

```json
"report": {
  "action": "Report",
  "title": "Report this post",
  "reasonLabel": "What's wrong?",
  "spam": "Spam",
  "inappropriate": "Inappropriate",
  "copyright": "Copyright",
  "other": "Something else",
  "noteLabel": "Anything to add? (optional)",
  "submit": "Send report",
  "sent": "Thanks. The post is hidden while a moderator reviews it.",
  "hiddenForAuthor": "Hidden while a moderator reviews a report.",
  "hiddenForModerator": "Reported and hidden from members.",
  "restore": "Restore",
  "remove": "Remove",
  "unmute": "Turn sound on",
  "mute": "Turn sound off",
  "play": "Play video",
  "unavailable": "Video unavailable."
}
```

NL: `"action": "Melden"`, `"title": "Dit bericht melden"`, `"reasonLabel": "Wat is er mis?"`, `"spam": "Spam"`, `"inappropriate": "Ongepast"`, `"copyright": "Auteursrecht"`, `"other": "Iets anders"`, `"noteLabel": "Nog iets toe te voegen? (optioneel)"`, `"submit": "Melding versturen"`, `"sent": "Bedankt. Het bericht is verborgen tot een moderator het bekijkt."`, `"hiddenForAuthor": "Verborgen tot een moderator een melding bekijkt."`, `"hiddenForModerator": "Gemeld en verborgen voor leden."`, `"restore": "Herstellen"`, `"remove": "Verwijderen"`, `"unmute": "Geluid aan"`, `"mute": "Geluid uit"`, `"play": "Video afspelen"`, `"unavailable": "Video niet beschikbaar."`.

- [ ] **Step 2: Write the failing tests**

```tsx
// src/components/communities/feed/feed-video-player.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { FeedVideoPlayer } from "./feed-video-player";

let visible: (ratio: number) => void = () => undefined;
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: Array<{ intersectionRatio: number }>) => void) {
        visible = (ratio) => cb([{ intersectionRatio: ratio }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
});
afterEach(() => {
  vi.unstubAllGlobals();
  play.mockClear();
  pause.mockClear();
});

const video = {
  url: "https://v/1.mp4",
  thumbnailUrl: "https://v/1.jpg",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  visibility: "public" as const,
};

function renderPlayer(reducedMotion = false) {
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }));
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedVideoPlayer video={video} />
    </NextIntlClientProvider>,
  );
}

describe("FeedVideoPlayer", () => {
  it("plays muted when mostly on screen and pauses when scrolled away", () => {
    const { container } = renderPlayer();
    const el = container.querySelector("video")!;
    expect(el.muted).toBe(true);
    act(() => visible(0.7));
    expect(play).toHaveBeenCalled();
    act(() => visible(0.1));
    expect(pause).toHaveBeenCalled();
  });

  it("never autoplays with reduced motion; shows a play button instead", () => {
    renderPlayer(true);
    act(() => visible(1));
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    expect(play).toHaveBeenCalled();
  });

  it("toggles sound with a labelled button", () => {
    const { container } = renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: "Turn sound on" }));
    expect(container.querySelector("video")!.muted).toBe(false);
    expect(screen.getByRole("button", { name: "Turn sound off" })).toBeInTheDocument();
  });
});
```

```tsx
// src/components/communities/feed/report-dialog.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const mutate = vi.fn();
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ feed: { getActivity: { invalidate: vi.fn() }, getFeed: { invalidate: vi.fn() } } }),
    feed: { reportPost: { useMutation: () => ({ mutate, isPending: false }) } },
  },
}));

import { ReportDialog } from "./report-dialog";

describe("ReportDialog", () => {
  it("sends the chosen reason and note", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReportDialog postId={5} open onOpenChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Copyright" }));
    fireEvent.change(screen.getByLabelText("Anything to add? (optional)"), { target: { value: "My clip" } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(mutate).toHaveBeenCalledWith({ postId: 5, reason: "copyright", note: "My clip" }, expect.anything());
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/communities/feed/feed-video-player.test.tsx src/components/communities/feed/report-dialog.test.tsx`
Expected: FAIL, the modules are missing.

- [ ] **Step 4: Implement the player**

```tsx
// src/components/communities/feed/feed-video-player.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export type FeedVideo = {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  visibility: "community" | "public";
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Inline video: muted autoplay once 60% is on screen, paused when scrolled
 * away, never autoplayed under reduced motion. Retries once on an expired
 * private link through `onExpired`.
 */
export function FeedVideoPlayer({
  video,
  onExpired,
  className,
}: {
  video: FeedVideo;
  onExpired?: () => void;
  className?: string;
}) {
  const t = useTranslations("communities.report");
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    setReduced(reduce);
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio >= 0.6 && !reduce) void el.play().catch(() => undefined);
        else if (entry.intersectionRatio < 0.6) el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ratio = video.width > 0 && video.height > 0 ? video.width / video.height : 9 / 16;

  return (
    <div
      className={`bg-muted relative mx-auto w-full max-w-sm overflow-hidden rounded-lg ${className ?? ""}`}
      style={{ aspectRatio: String(ratio) }}
    >
      <video
        ref={ref}
        src={video.url}
        poster={video.thumbnailUrl}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        onPlay={() => setStarted(true)}
        onError={() => {
          if (!retried.current && onExpired) {
            retried.current = true;
            onExpired();
          } else setFailed(true);
        }}
        className="size-full object-cover"
      />
      {failed ? (
        <p className="bg-background/80 absolute inset-0 flex items-center justify-center text-sm">
          {t("unavailable")}
        </p>
      ) : null}
      {reduced && !started ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute inset-0 m-auto size-12 rounded-full"
          aria-label={t("play")}
          onClick={() => void ref.current?.play()}
        >
          <Play aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="absolute right-2 bottom-2 rounded-full"
        aria-label={muted ? t("unmute") : t("mute")}
        onClick={() => setMuted((value) => !value)}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Implement the report dialog and the reported banner**

```tsx
// src/components/communities/feed/report-dialog.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/trpc/react";

const REASONS = ["spam", "inappropriate", "copyright", "other"] as const;
type Reason = (typeof REASONS)[number];

export function ReportDialog({
  postId,
  open,
  onOpenChange,
}: {
  postId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("communities.report");
  const utils = api.useUtils();
  const [reason, setReason] = useState<Reason>("spam");
  const [note, setNote] = useState("");
  const report = api.feed.reportPost.useMutation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("reasonLabel")}</legend>
          {REASONS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="report-reason"
                value={id}
                checked={reason === id}
                onChange={() => setReason(id)}
              />
              {t(id)}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`report-note-${postId}`}>{t("noteLabel")}</Label>
          <Textarea
            id={`report-note-${postId}`}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={report.isPending}
            onClick={() =>
              report.mutate(
                { postId, reason, note: note.trim() },
                {
                  onSuccess: () => {
                    toast.success(t("sent"));
                    onOpenChange(false);
                    void utils.feed.getActivity.invalidate();
                    void utils.feed.getFeed.invalidate();
                  },
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          >
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/communities/feed/reported-banner.tsx
"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

/** Shown on a hidden post: moderators get Restore / Remove, authors a note. */
export function ReportedBanner({
  postId,
  canReview,
}: {
  postId: number;
  canReview: boolean;
}) {
  const t = useTranslations("communities.report");
  const utils = api.useUtils();
  const review = api.feed.reviewReport.useMutation({
    onSuccess: () => {
      void utils.feed.getActivity.invalidate();
      void utils.feed.getFeed.invalidate();
      void utils.feed.getReels.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div
      role="status"
      className="bg-warning/15 text-warning flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm"
    >
      <ShieldAlert aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {canReview ? t("hiddenForModerator") : t("hiddenForAuthor")}
      </span>
      {canReview ? (
        <span className="flex gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={review.isPending}
            onClick={() => review.mutate({ postId, action: "restore" })}
          >
            {t("restore")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            disabled={review.isPending}
            onClick={() => review.mutate({ postId, action: "remove" })}
          >
            {t("remove")}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Integrate into `feed-post-card.tsx`**

- Extend the `FeedPost` interface with these optional fields:
  - `video?: { url: string; thumbnailUrl: string; durationSeconds: number; width: number; height: number; visibility: "community" | "public" } | null`
  - `hiddenAt?: string | null`
  - `visibility?: "community" | "public" | null`
- Render `<FeedVideoPlayer video={post.video} onExpired={onRefresh} />` where the image renders, when `post.video` is set.
- When `post.video?.visibility === "public"`, show a small `Badge variant="outline"` reading `t("public")` from `communities.video` next to the timestamp.
- When `post.hiddenAt` is set, render `<ReportedBanner postId={post.id} canReview={memberRole === "owner" || memberRole === "admin" || memberRole === "moderator"} />` above the content.
- In the card's action row, for a signed-in viewer who isn't the author, add a ghost `Report` button (`t("action")`, `Flag` icon) that opens `<ReportDialog postId={post.id} open={reportOpen} onOpenChange={setReportOpen} />`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components/communities && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/communities/feed/feed-video-player.tsx src/components/communities/feed/feed-video-player.test.tsx src/components/communities/feed/report-dialog.tsx src/components/communities/feed/report-dialog.test.tsx src/components/communities/feed/reported-banner.tsx src/components/communities/feed/feed-post-card.tsx messages/en.json messages/nl.json
git commit -m "feat(videos): inline player, reporting, and moderator review in the feed"
```

---

### Task 14: Reels mode

**Files:**
- Create: `src/components/communities/reels/reels-viewer.tsx`
- Create: `src/app/[locale]/communities/[slug]/reels/page.tsx`
- Modify: `src/components/communities/feed/feed-page.tsx` (the Reels entry button)
- Modify: `messages/en.json`, `messages/nl.json` (`communities.reels`)
- Test: `src/components/communities/reels/reels-viewer.test.tsx`

**Interfaces:**
- Consumes: tRPC `feed.getReels`; Task 13 `FeedVideoPlayer`, `ReportDialog`; the existing `JoinButton`.
- Produces:
  - Route `/communities/{slug}/reels?v={postId}`;
  - `<ReelsViewer slug startAtPostId isMember />`.

- [ ] **Step 1: Add copy** (`communities.reels`, EN; the same keys in NL)

```json
"reels": {
  "open": "Reels",
  "close": "Close reels",
  "membersOnly": "This video is for members.",
  "unavailable": "This video isn't available.",
  "empty": "No videos here yet.",
  "copyLink": "Copy link",
  "linkCopied": "Link copied",
  "comments": "{count, plural, one {# comment} other {# comments}}",
  "communityOnly": "Community only",
  "public": "Public",
  "position": "Video {current} of {total}"
}
```

NL: `"open": "Reels"`, `"close": "Reels sluiten"`, `"membersOnly": "Deze video is voor leden."`, `"unavailable": "Deze video is niet beschikbaar."`, `"empty": "Hier staan nog geen video's."`, `"copyLink": "Link kopiëren"`, `"linkCopied": "Link gekopieerd"`, `"comments": "{count, plural, one {# reactie} other {# reacties}}"`, `"communityOnly": "Alleen de community"`, `"public": "Openbaar"`, `"position": "Video {current} van {total}"`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/communities/reels/reels-viewer.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const { query } = vi.hoisted(() => ({ query: { current: {} as Record<string, unknown> } }));
vi.mock("@/trpc/react", () => ({
  api: { feed: { getReels: { useInfiniteQuery: () => query.current } } },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("../feed/feed-video-player", () => ({
  FeedVideoPlayer: ({ video }: { video: { url: string } }) => <div data-player={video.url} />,
}));
vi.mock("../join-button", () => ({ JoinButton: () => <button type="button">Join Community</button> }));

import { ReelsViewer } from "./reels-viewer";

const reel = (id: number) => ({
  id,
  content: `Clip ${id}`,
  authorName: "Greg",
  likeCount: 3,
  commentCount: 1,
  hasLiked: false,
  video: { url: `https://v/${id}.mp4`, thumbnailUrl: "t", durationSeconds: 9, width: 720, height: 1280, visibility: "public" },
});

function renderViewer(pages: unknown[], isMember = true) {
  query.current = { data: { pages }, isLoading: false, isError: false, hasNextPage: false, fetchNextPage: vi.fn() };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReelsViewer slug="mlops" startAtPostId={null} isMember={isMember} joinPolicy="open" />
    </NextIntlClientProvider>,
  );
}

describe("ReelsViewer", () => {
  it("shows one video at a time and moves with the arrow keys", () => {
    renderViewer([{ items: [reel(1), reel(2)], nextCursor: null, notice: null }]);
    expect(screen.getByText("Video 1 of 2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Video 2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText("Video 1 of 2")).toBeInTheDocument();
  });

  it("tells a visitor a community-only link is for members and offers Join", () => {
    renderViewer([{ items: [], nextCursor: null, notice: "members_only" }], false);
    expect(screen.getByText("This video is for members.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Community" })).toBeInTheDocument();
  });

  it("closes with a labelled button", () => {
    renderViewer([{ items: [reel(1)], nextCursor: null, notice: null }]);
    expect(screen.getByRole("link", { name: "Close reels" })).toHaveAttribute("href", "/communities/mlops");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/communities/reels/reels-viewer.test.tsx`
Expected: FAIL, the module is missing.

- [ ] **Step 4: Implement the viewer**

```tsx
// src/components/communities/reels/reels-viewer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, Heart, Link2, MessageSquare, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { FeedVideoPlayer } from "../feed/feed-video-player";
import { ReportDialog } from "../feed/report-dialog";
import { JoinButton } from "../join-button";

/**
 * Full-screen, one-video-per-screen Reels mode. Scroll-snap does the swipe;
 * ↑/↓ move, Esc closes. Only the current video plays (FeedVideoPlayer
 * autoplays at 60% visibility), so the rest stay unloaded.
 */
export function ReelsViewer({
  slug,
  startAtPostId,
  isMember,
  joinPolicy,
}: {
  slug: string;
  startAtPostId: number | null;
  isMember: boolean;
  joinPolicy: "open" | "invite_only" | "approval_required";
}) {
  const t = useTranslations("communities.reels");
  const [index, setIndex] = useState(0);
  const [reporting, setReporting] = useState<number | null>(null);
  const slides = useRef<Array<HTMLElement | null>>([]);
  const { data, hasNextPage, fetchNextPage, refetch } =
    api.feed.getReels.useInfiniteQuery(
      { communitySlug: slug, limit: 8, startAtPostId },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    );
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const notice = data?.pages[0]?.notice ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
      if (event.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  useEffect(() => {
    slides.current[index]?.scrollIntoView?.({ block: "start" });
    if (index >= items.length - 2 && hasNextPage) void fetchNextPage();
  }, [index, items.length, hasNextPage, fetchNextPage]);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
        <span className="font-mono text-xs tabular-nums" aria-live="polite">
          {items.length > 0 ? t("position", { current: index + 1, total: items.length }) : null}
        </span>
        <div className="flex items-center gap-2">
          {isMember ? null : (
            <JoinButton slug={slug} joinPolicy={joinPolicy} membershipStatus={null} memberRole={null} />
          )}
          <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <Link href={`/communities/${slug}` as never} aria-label={t("close")}>
              <X aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      {notice || items.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm">
          {notice === "members_only"
            ? t("membersOnly")
            : notice === "unavailable"
              ? t("unavailable")
              : t("empty")}
        </div>
      ) : (
        <div
          className="h-full snap-y snap-mandatory overflow-y-auto"
          onScroll={(event) => {
            const el = event.currentTarget;
            setIndex(Math.round(el.scrollTop / el.clientHeight));
          }}
        >
          {items.map((reel, i) => (
            <section
              key={reel.id}
              ref={(node) => {
                slides.current[i] = node;
              }}
              aria-roledescription="slide"
              className="relative flex h-full snap-start items-center justify-center"
            >
              {reel.video ? (
                <FeedVideoPlayer video={reel.video} onExpired={() => void refetch()} className="max-w-md" />
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pr-20">
                <p className="text-sm font-semibold">{reel.authorName}</p>
                <p className="line-clamp-2 text-sm">{reel.content}</p>
                <p className="mt-1 text-xs text-white/80">
                  {reel.video?.visibility === "public" ? t("public") : t("communityOnly")}
                </p>
              </div>
              <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
                <span className="flex flex-col items-center text-xs">
                  <Heart aria-hidden="true" className="size-6" />
                  <span className="font-mono tabular-nums">{reel.likeCount ?? 0}</span>
                </span>
                <Link
                  href={`/communities/${slug}` as never}
                  className="flex flex-col items-center text-xs"
                  aria-label={t("comments", { count: reel.commentCount ?? 0 })}
                >
                  <MessageSquare aria-hidden="true" className="size-6" />
                  <span className="font-mono tabular-nums">{reel.commentCount ?? 0}</span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  aria-label={t("copyLink")}
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?v=${reel.id}`;
                    void navigator.clipboard.writeText(url).then(() => toast.success(t("linkCopied")));
                  }}
                >
                  <Link2 aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  aria-label="Report"
                  onClick={() => setReporting(reel.id)}
                >
                  <Flag aria-hidden="true" />
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
      {reporting ? (
        <ReportDialog
          postId={reporting}
          open
          onOpenChange={(open) => {
            if (!open) setReporting(null);
          }}
        />
      ) : null}
    </div>
  );
}
```

Replace the literal `aria-label="Report"` with `useTranslations("communities.report")("action")`: add `const tr = useTranslations("communities.report");` and use `aria-label={tr("action")}`.

- [ ] **Step 5: Add the route and the entry button**

```tsx
// src/app/[locale]/communities/[slug]/reels/page.tsx
"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";

import { ReelsViewer } from "@/components/communities/reels/reels-viewer";
import { authClient } from "@/server/better-auth/client";
import { memberRoleForSlug } from "@/server/better-auth/hub-session";
import { api } from "@/trpc/react";

export default function CommunityReelsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const search = useSearchParams();
  const startAt = Number(search.get("v"));
  const { data: session } = authClient.useSession();
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: mine } = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: Boolean(session?.user),
  });
  const isMember = Boolean(memberRoleForSlug(mine ?? [], slug));
  return (
    <ReelsViewer
      slug={slug}
      startAtPostId={Number.isInteger(startAt) && startAt > 0 ? startAt : null}
      isMember={isMember}
      joinPolicy={community?.joinPolicy ?? "open"}
    />
  );
}
```

In `feed-page.tsx`, above the composer, when `isCommunityVideosEnabled()`:
- query `api.feed.getReels.useQuery({ communitySlug: slug, limit: 1 })`;
- when `data?.items.length > 0`, render `<Button asChild variant="outline" size="sm"><Link href={`/communities/${slug}/reels`}><Clapperboard aria-hidden="true" />{t("open")}</Link></Button>` using `communities.reels`.

It shows for visitors too, because `getReels` is public and returns public videos only.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/communities && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/communities/reels/reels-viewer.tsx src/components/communities/reels/reels-viewer.test.tsx "src/app/[locale]/communities/[slug]/reels/page.tsx" src/components/communities/feed/feed-page.tsx messages/en.json messages/nl.json
git commit -m "feat(videos): full-screen Reels mode with deep links and a join path for visitors"
```

---

### Task 15: Docs, full verification, and launch checklist

**Files:**
- Modify: `docs/product-qa-map.md` (Feed section: video posts, visibility, reports, Reels)
- Modify: `docs/superpowers/specs/2026-09-23-community-reels-design.md` (Status → implemented; note any deviations)

- [ ] **Step 1: Update the QA map.** In `docs/product-qa-map.md` §7 Feed, add a "Video posts and Reels" paragraph that states:
  - Posting: `feed.createVideoUpload` → a direct S3 POST → `feed.finishVideoPost`.
  - Visibility: `community` or `public`; one rule in `post-visibility.ts`.
  - Reports: the first report hides the post; moderators Restore or Remove through `reviewReport`.
  - Reels: `feed.getReels` is public; visitors get public videos only.
  - Cleanup: the daily `/api/cron/video-uploads-cleanup`.
  - Launch: the flag `NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS`, plus the three AWS prerequisites.

- [ ] **Step 2: Full checks**

```bash
npx vitest run src
npx tsc --noEmit -p .
npx eslint src/components/communities src/server src/lib "src/app/[locale]/communities"
git status --short   # must be empty after committing
```

Expected: all tests pass, no type or lint errors.

- [ ] **Step 3: Device check (manual, on a preview deploy with the flag on for one test community)**
  - Post an iPhone portrait HEVC clip and an Android clip. Each plays upright in iPhone Safari, Android Chrome, and desktop Chrome, Safari, and Firefox.
  - A screen recording with no audio posts and plays.
  - A 95-second clip is refused before converting.
  - A community-only video URL copied into a private window stops working within an hour (the link expires) and never plays for a signed-out visitor.
  - Report a public video as a second account: it disappears for members and visitors, the moderator gets a notification, Restore brings it back, and Remove deletes the post and its S3 files.
  - Reels: swipe, arrow keys, and Esc work. A visitor sees only public videos and a Join button. A `?v=` link to a community-only video shows "This video is for members."

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/product-qa-map.md docs/superpowers/specs/2026-09-23-community-reels-design.md
git commit -m "docs(videos): QA map and spec status for community videos"
git push -u origin feat/community-reels-build
```

The PR description lists the owner's launch prerequisites:
1. S3 CORS for `POST` from the site origins.
2. Confirm `private/` isn't publicly readable.
3. IAM `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:ListBucket` on `media/videos/*` and `private/videos/*`.
4. `pnpm db:apply` for `20260924a_community_videos` in the deploy window.
5. Set `NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS=true` for the pilot.
