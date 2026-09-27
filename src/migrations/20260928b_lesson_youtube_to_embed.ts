// Classroom lesson materials, slice 1 (spec 2026-09-27 §3.4, ADR-0037):
// the single "YouTube URL" slot becomes an ordinary Embed block at the top
// of the lesson body. A link the embed registry can't show (e.g. a Zoom
// recording) is kept as a "Video" resource link instead of being dropped.
//
// Expand/contract: youtube_url is left untouched and a later migration
// drops it. What the previous release does with a migrated lesson:
// - It keeps *showing* the video: its renderer ignores the Embed block and
//   still reads youtube_url.
// - Its lesson *editor* cannot open a migrated lesson (the Embed block type
//   is unknown to it). So during the build window, or after a rollback,
//   editing a lesson that had a YouTube link fails until the new code is
//   live.
// Before the contract migration drops youtube_url, re-run
// planYoutubeMigration only for lessons whose updated_at falls inside this
// deploy window (a blind re-run would resurrect Embed blocks trainers
// removed on purpose).
//
// Idempotent: a lesson already carrying the Embed block or resource is
// skipped, so a retried deploy changes nothing. Race-safe per row: the body
// is only rewritten if it is still what was read, and the resource is only
// inserted if no row with that link exists yet. A lesson edited between the
// read and the write is left alone (its author saw the old editor).
import { randomBytes } from "node:crypto";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { planYoutubeMigration } from "../lib/classroom/lesson-body";

export type Row = {
  id: number;
  youtubeUrl: string | null;
  body: unknown;
  resourceUrls: string[] | null;
  maxOrder: number | string | null;
};

type Db = MigrateUpArgs["db"];

/** Migrate one lesson as read by `up`'s SELECT. Exported for tests. */
export async function applyYoutubeMigrationRow(
  db: Db,
  row: Row,
): Promise<void> {
  const step = planYoutubeMigration({
    body: row.body,
    youtubeUrl: row.youtubeUrl,
    resourceUrls: row.resourceUrls ?? [],
    blockId: randomBytes(6).toString("hex"),
  });
  if (step.kind === "embed") {
    const readBody = row.body === null ? null : JSON.stringify(row.body);
    // Zero rows updated means the lesson was edited since the read: skip it.
    await db.execute(sql`
      UPDATE "lessons" SET "body" = ${JSON.stringify(step.body)}::jsonb
      WHERE "id" = ${row.id}
        AND "body" IS NOT DISTINCT FROM ${readBody}::jsonb`);
  } else if (step.kind === "resource") {
    await db.execute(sql`
      INSERT INTO "lessons_resources" ("_order", "_parent_id", "id", "label", "url")
      SELECT ${Number(row.maxOrder ?? 0) + 1}, ${row.id}, ${randomBytes(12).toString("hex")}, ${step.label}, ${step.url}
      WHERE NOT EXISTS (
        SELECT 1 FROM "lessons_resources"
        WHERE "_parent_id" = ${row.id} AND "url" = ${step.url})`);
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT
      l."id",
      l."youtube_url" AS "youtubeUrl",
      l."body",
      (SELECT json_agg(r."url") FROM "lessons_resources" r WHERE r."_parent_id" = l."id") AS "resourceUrls",
      (SELECT max(r."_order") FROM "lessons_resources" r WHERE r."_parent_id" = l."id") AS "maxOrder"
    FROM "lessons" l
    WHERE l."youtube_url" IS NOT NULL AND btrim(l."youtube_url") <> ''
  `);

  for (const row of rows as Row[]) {
    await applyYoutubeMigrationRow(db, row);
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Data-only and additive; youtube_url is untouched, so nothing to revert.
}
