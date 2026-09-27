// @vitest-environment node
import type { sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type {
  applyYoutubeMigrationRow as ApplyRow,
  up as Up,
} from "./20260928b_lesson_youtube_to_embed";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)(
  "migration 20260928b lesson youtube → embed [DB integration]",
  () => {
    type Mods = {
      db: typeof Db;
      sql: typeof Sql;
      up: typeof Up;
      applyRow: typeof ApplyRow;
    };
    let m: Mods;
    const created: number[] = [];

    beforeAll(async () => {
      const [{ db }, { sql }, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20260928b_lesson_youtube_to_embed"),
      ]);
      m = {
        db,
        sql,
        up: migration.up,
        applyRow: migration.applyYoutubeMigrationRow,
      };
    }, 120_000);

    afterEach(async () => {
      if (created.length === 0) return;
      await m.db.execute(m.sql`DELETE FROM "lessons" WHERE "id" IN ${created}`);
      created.length = 0;
    });

    async function insertLesson(youtubeUrl: string | null, body: unknown) {
      const res = await m.db.execute(m.sql`
      INSERT INTO "lessons" ("course", "title", "order", "youtube_url", "body")
      VALUES (999999999, 'migration test', 0, ${youtubeUrl}, ${body === null ? null : JSON.stringify(body)}::jsonb)
      RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      created.push(id);
      return id;
    }

    async function read(id: number) {
      const lesson = await m.db.execute(
        m.sql`SELECT "body", "youtube_url" FROM "lessons" WHERE "id" = ${id}`,
      );
      const resources = await m.db.execute(
        m.sql`SELECT "label", "url", "_order" FROM "lessons_resources" WHERE "_parent_id" = ${id} ORDER BY "_order"`,
      );
      return {
        body: (lesson.rows[0] as { body: unknown }).body,
        youtubeUrl: (lesson.rows[0] as { youtube_url: string | null })
          .youtube_url,
        resources: resources.rows as {
          label: string;
          url: string;
          _order: number;
        }[],
      };
    }

    const run = () => m.up({ db: m.db } as never);
    const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    it("prepends an Embed block, keeps the notes and leaves youtube_url for rollback", async () => {
      const id = await insertLesson(YT, {
        root: {
          type: "root",
          children: [
            { type: "paragraph", children: [{ type: "text", text: "notes" }] },
          ],
        },
      });
      await run();
      const after = await read(id);
      const children = (
        after.body as {
          root: {
            children: {
              type: string;
              fields?: { blockType?: string; url?: string };
            }[];
          };
        }
      ).root.children;
      expect(children[0]).toMatchObject({
        type: "block",
        fields: { blockType: "Embed", url: YT },
      });
      expect(children[1]).toMatchObject({ type: "paragraph" });
      expect(after.youtubeUrl).toBe(YT);
    });

    it("gives a lesson with no body a body", async () => {
      const id = await insertLesson(YT, null);
      await run();
      const after = await read(id);
      expect(JSON.stringify(after.body)).toContain('"blockType":"Embed"');
    });

    it("keeps a non-embeddable link as a resource after existing ones", async () => {
      const zoom = "https://zoom.us/rec/share/abc";
      const id = await insertLesson(zoom, null);
      await m.db.execute(m.sql`
      INSERT INTO "lessons_resources" ("_order", "_parent_id", "id", "label", "url")
      VALUES (3, ${id}, ${`r-${id}`}, 'Slides', 'https://example.test/s')`);
      await run();
      const after = await read(id);
      expect(after.resources).toEqual([
        { label: "Slides", url: "https://example.test/s", _order: 3 },
        { label: "Video", url: zoom, _order: 4 },
      ]);
      expect(after.body).toBeNull();
    });

    it("is safe to run twice", async () => {
      const embedId = await insertLesson(YT, null);
      const zoomId = await insertLesson("https://zoom.us/rec/share/abc", null);
      await run();
      await run();
      const embed = await read(embedId);
      const embedCount =
        JSON.stringify(embed.body).split('"blockType":"Embed"').length - 1;
      expect(embedCount).toBe(1);
      expect((await read(zoomId)).resources).toHaveLength(1);
    });

    it("does not overwrite a body edited after the migration read it", async () => {
      const id = await insertLesson(YT, null);
      const edited = {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "edited meanwhile" }],
            },
          ],
        },
      };
      await m.db.execute(
        m.sql`UPDATE "lessons" SET "body" = ${JSON.stringify(edited)}::jsonb WHERE "id" = ${id}`,
      );
      // The row as the migration's SELECT saw it, before the edit.
      await m.applyRow(m.db as never, {
        id,
        youtubeUrl: YT,
        body: null,
        resourceUrls: null,
        maxOrder: null,
      });
      expect((await read(id)).body).toEqual(edited);
    });

    it("does not add the Video resource twice when another run added it meanwhile", async () => {
      const zoom = "https://zoom.us/rec/share/abc";
      const id = await insertLesson(zoom, null);
      await m.db.execute(m.sql`
      INSERT INTO "lessons_resources" ("_order", "_parent_id", "id", "label", "url")
      VALUES (1, ${id}, ${`r-${id}`}, 'Video', ${zoom})`);
      // The row as the migration's SELECT saw it, before the resource appeared.
      await m.applyRow(m.db as never, {
        id,
        youtubeUrl: zoom,
        body: null,
        resourceUrls: null,
        maxOrder: null,
      });
      expect((await read(id)).resources).toHaveLength(1);
    });

    it("leaves lessons without a youtube_url alone", async () => {
      const id = await insertLesson(null, null);
      await run();
      expect((await read(id)).body).toBeNull();
    });
  },
);
