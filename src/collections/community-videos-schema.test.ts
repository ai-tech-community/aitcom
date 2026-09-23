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

  it("makes the video key unique so a double-submit cannot create two posts", () => {
    const video = FeedPosts.fields.find(
      (field) => "name" in field && field.name === "video",
    ) as { fields: Array<{ name: string; unique?: boolean }> } | undefined;
    const key = video?.fields.find((field) => field.name === "key");
    expect(key?.unique).toBe(true);
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
      'CREATE UNIQUE INDEX IF NOT EXISTS "feed_posts_video_video_key_idx"',
      'DROP INDEX IF EXISTS "feed_posts_video_video_key_idx"',
    ]) {
      expect(sql).toContain(needle);
    }
    const index = readFileSync(join(process.cwd(), "src/migrations/index.ts"), "utf8");
    expect(index).toContain('name: "20260924a_community_videos"');
  });
});
