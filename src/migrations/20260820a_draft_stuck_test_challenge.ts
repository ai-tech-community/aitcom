import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Live junk challenge id 9 (title "test", slug test-c-1781069637721) is Active
 * on https://www.aitcommunity.org/en/challenges and its Payload admin editor
 * blank-forms (null `tags` JSON, empty-string rewards, incomplete Lexical).
 * Bulk Status → Draft save reverts with no toast because Payload re-validates
 * the whole document.
 *
 * Do not delete the row (historical hackathon). Do not touch the two real
 * published challenges. Idempotent: the WHERE clause pins id + title + slug.
 */
const PROTECTED_SLUGS = [
  "build-your-first-mcp-tool",
  "build-the-ait-benchmark",
] as const;

const COMPLETE_LEXICAL = {
  root: {
    type: "root",
    version: 1,
    direction: "ltr",
    format: "",
    indent: 0,
    children: [
      {
        type: "paragraph",
        version: 1,
        format: "",
        indent: 0,
        direction: "ltr",
        textFormat: 0,
        textStyle: "",
        children: [
          {
            type: "text",
            text: "tes",
            version: 1,
            format: 0,
            detail: 0,
            mode: "normal",
            style: "",
          },
        ],
      },
    ],
  },
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const description = JSON.stringify(COMPLETE_LEXICAL);

  await db.execute(sql`
    UPDATE "challenges"
    SET
      "status" = 'draft',
      "tags" = '[]'::jsonb,
      "rewards_badge_reward" = NULLIF("rewards_badge_reward", ''),
      "rewards_sponsor_reward" = NULLIF("rewards_sponsor_reward", ''),
      "description" = ${description}::jsonb,
      "updated_at" = NOW()
    WHERE "id" = 9
      AND "title" = 'test'
      AND "slug" LIKE 'test-c-%'
      AND "slug" NOT IN (${PROTECTED_SLUGS[0]}, ${PROTECTED_SLUGS[1]});
  `);

  // Bound hackathon event (public challenge page: "runs as part of the test
  // hackathon"). Draft + unpublish so it leaves the live event list too.
  await db.execute(sql`
    UPDATE "events"
    SET
      "status" = 'draft',
      "_status" = 'draft',
      "updated_at" = NOW()
    WHERE "challenge_id" = '9';
  `);

  await db.execute(sql`
    UPDATE "_events_v"
    SET
      "version_status" = 'draft',
      "version__status" = 'draft',
      "updated_at" = NOW()
    WHERE "version_challenge_id" = '9'
       OR "parent_id" IN (
         SELECT "id" FROM "events" WHERE "challenge_id" = '9'
       );
  `);

  // Stale document locks also blank the admin form and reject updates.
  // A lock row has rels to both the challenge and the locking user — delete
  // every rel for those parents, then the parent rows.
  await db.execute(sql`
    WITH locked AS (
      SELECT DISTINCT "parent_id" AS id
      FROM "payload_locked_documents_rels"
      WHERE "challenges_id" = 9
    ),
    _rels AS (
      DELETE FROM "payload_locked_documents_rels"
      WHERE "parent_id" IN (SELECT id FROM locked)
      RETURNING "parent_id"
    )
    DELETE FROM "payload_locked_documents"
    WHERE "id" IN (SELECT id FROM locked);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Restore only the junk row we drafted. Do not republish protected slugs.
  await db.execute(sql`
    UPDATE "challenges"
    SET
      "status" = 'active',
      "updated_at" = NOW()
    WHERE "id" = 9
      AND "title" = 'test'
      AND "slug" LIKE 'test-c-%'
      AND "slug" NOT IN (${PROTECTED_SLUGS[0]}, ${PROTECTED_SLUGS[1]});
  `);

  await db.execute(sql`
    UPDATE "events"
    SET
      "status" = 'published',
      "_status" = 'published',
      "updated_at" = NOW()
    WHERE "challenge_id" = '9';
  `);

  await db.execute(sql`
    UPDATE "_events_v"
    SET
      "version_status" = 'published',
      "version__status" = 'published',
      "updated_at" = NOW()
    WHERE "version_challenge_id" = '9'
       OR "parent_id" IN (
         SELECT "id" FROM "events" WHERE "challenge_id" = '9'
       );
  `);
}
