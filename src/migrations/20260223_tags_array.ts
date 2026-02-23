import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "articles_tags" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "tag" varchar
    );

    CREATE TABLE IF NOT EXISTS "_articles_v_version_tags" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "tag" varchar,
      "_uuid" varchar
    );

    ALTER TABLE "articles_tags" DROP CONSTRAINT IF EXISTS "articles_tags_parent_id_fk";
    ALTER TABLE "articles_tags" ADD CONSTRAINT "articles_tags_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "_articles_v_version_tags" DROP CONSTRAINT IF EXISTS "_articles_v_version_tags_parent_id_fk";
    ALTER TABLE "_articles_v_version_tags" ADD CONSTRAINT "_articles_v_version_tags_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "articles_tags_order_idx" ON "articles_tags" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "articles_tags_parent_id_idx" ON "articles_tags" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "_articles_v_version_tags_order_idx" ON "_articles_v_version_tags" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "_articles_v_version_tags_parent_id_idx" ON "_articles_v_version_tags" USING btree ("_parent_id");

    ALTER TABLE "articles" DROP COLUMN IF EXISTS "tags";
    ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_tags";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "articles_tags" CASCADE;
    DROP TABLE "_articles_v_version_tags" CASCADE;
    ALTER TABLE "articles" ADD COLUMN "tags" jsonb;
    ALTER TABLE "_articles_v" ADD COLUMN "version_tags" jsonb;
  `)
}
