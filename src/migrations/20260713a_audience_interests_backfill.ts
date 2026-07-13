import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { AUDIENCE_SEED } from "@/lib/audience-seed";

/**
 * Data-only backfill for #218: the discovery classifier needs a fuller
 * interest vocabulary per audience than the original
 * `20260707a_audiences_collection_seed` migration seeded (that migration
 * only gave engineers/founders/executives 3 tags each, and left
 * marketers/product/researchers/mixed with none). `src/lib/audience-seed.ts`
 * is the single source of truth for the vocabulary and has been updated to
 * the full lists in the same change; this migration catches up any
 * pre-existing `audiences` rows (prod, dev-verify) that were seeded before
 * that update.
 *
 * No DDL — `audiences_interests` already exists (created by 20260707a).
 * Table shape: `_order` int, `_parent_id` int FK -> audiences.id, `id`
 * varchar PRIMARY KEY (generated with `gen_random_uuid()::text`, matching
 * 20260707a exactly), `tag` varchar.
 *
 * Idempotent: each insert is guarded by a NOT EXISTS check against
 * (_parent_id, tag), and new `_order` values continue from the audience's
 * current max `_order` — so tags already present (e.g. engineers' "ai")
 * are skipped, and re-running this migration is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const audience of AUDIENCE_SEED) {
    for (const tag of audience.interests) {
      await db.execute(sql`
        INSERT INTO "audiences_interests" ("_order", "_parent_id", "id", "tag")
        SELECT
          COALESCE(
            (SELECT MAX(ai_existing."_order") FROM "audiences_interests" ai_existing WHERE ai_existing."_parent_id" = a."id"),
            0
          ) + 1,
          a."id",
          gen_random_uuid()::text,
          ${tag}
        FROM "audiences" a
        WHERE a."slug" = ${audience.slug}
          AND NOT EXISTS (
            SELECT 1 FROM "audiences_interests" ai
            WHERE ai."_parent_id" = a."id" AND ai."tag" = ${tag}
          );
      `);
    }
  }
}

/**
 * Best-effort reversal: deletes exactly the (slug, tag) pairs this
 * migration's `up()` would have inserted (the full AUDIENCE_SEED interest
 * lists), regardless of whether a given row was actually added by this
 * migration or pre-existed from `20260707a`. This is intentionally
 * imprecise — a byte-for-byte reversal would require snapshotting
 * pre-migration state — but it's safe: worst case it removes a tag that
 * `20260707a` also would have inserted, and running `up()` again restores
 * it (both migrations use the same NOT EXISTS-guarded insert shape).
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const audience of AUDIENCE_SEED) {
    for (const tag of audience.interests) {
      await db.execute(sql`
        DELETE FROM "audiences_interests" ai
        USING "audiences" a
        WHERE ai."_parent_id" = a."id"
          AND a."slug" = ${audience.slug}
          AND ai."tag" = ${tag};
      `);
    }
  }
}
