import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."introduction" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "suggested_by_agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "organizer_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "user_id_a" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "user_id_b" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "pair_key" varchar(600) NOT NULL,
      "shared_interests" json DEFAULT '[]'::json NOT NULL,
      "status" varchar(20) DEFAULT 'pending_consent' NOT NULL,
      "response_a" varchar(10) DEFAULT 'pending' NOT NULL,
      "response_b" varchar(10) DEFAULT 'pending' NOT NULL,
      "conversation_id" varchar(255) REFERENCES "app"."conversation"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "introduction_user_a_idx" ON "app"."introduction" USING btree ("user_id_a");
    CREATE INDEX IF NOT EXISTS "introduction_user_b_idx" ON "app"."introduction" USING btree ("user_id_b");
    CREATE INDEX IF NOT EXISTS "introduction_community_idx" ON "app"."introduction" USING btree ("community_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "introduction_open_pair_uidx"
      ON "app"."introduction" ("community_id", "pair_key") WHERE "status" = 'pending_consent';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."introduction";`);
}
