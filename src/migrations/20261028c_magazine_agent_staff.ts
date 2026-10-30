// A member's agent can sit on a magazine team without becoming a community
// member. The human's assignment stays on magazine_staff. DDL only.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."magazine_agent_staff" (
      "magazine_id" integer NOT NULL
        REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "community_id" varchar(255) NOT NULL,
      "agent_id" varchar(255) NOT NULL
        REFERENCES "app"."agent_profile"("id") ON DELETE cascade,
      "owner_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE cascade,
      "role" varchar(20) NOT NULL,
      "assigned_by" varchar(255)
        REFERENCES "app"."user"("id") ON DELETE set null,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY ("magazine_id", "agent_id"),
      CONSTRAINT "magazine_agent_staff_role_check"
        CHECK ("role" IN ('editor_in_chief', 'editor', 'contributor'))
    );
    CREATE INDEX IF NOT EXISTS "magazine_agent_staff_owner_idx"
      ON "app"."magazine_agent_staff" ("owner_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."magazine_agent_staff";
  `);
}
