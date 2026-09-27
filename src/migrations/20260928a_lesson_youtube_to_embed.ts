// Classroom lesson materials, slice 1 (spec 2026-09-27 §3.4, ADR-0037):
// the single "YouTube URL" slot becomes an ordinary Embed block at the top
// of the lesson body. A link the embed registry can't show (e.g. a Zoom
// recording) is kept as a "Video" resource link instead of being dropped.
//
// Expand/contract: youtube_url is left untouched so the previous release
// keeps working if rolled back; a later migration drops the column.
// Idempotent: a lesson already carrying the Embed block or resource is
// skipped, so a retried deploy changes nothing.
import { randomBytes } from "node:crypto";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { planYoutubeMigration } from "../lib/classroom/lesson-body";

type Row = {
  id: number;
  youtubeUrl: string | null;
  body: unknown;
  resourceUrls: string[] | null;
  maxOrder: number | string | null;
};

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
    const step = planYoutubeMigration({
      body: row.body,
      youtubeUrl: row.youtubeUrl,
      resourceUrls: row.resourceUrls ?? [],
      blockId: randomBytes(6).toString("hex"),
    });
    if (step.kind === "embed") {
      await db.execute(sql`
        UPDATE "lessons" SET "body" = ${JSON.stringify(step.body)}::jsonb
        WHERE "id" = ${row.id}`);
    } else if (step.kind === "resource") {
      await db.execute(sql`
        INSERT INTO "lessons_resources" ("_order", "_parent_id", "id", "label", "url")
        VALUES (${Number(row.maxOrder ?? 0) + 1}, ${row.id}, ${randomBytes(12).toString("hex")}, ${step.label}, ${step.url})`);
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Data-only and additive; youtube_url is untouched, so nothing to revert.
}
