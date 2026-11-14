import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Members upload their own profile photo. The upload is a `media` file with
 * the new purpose `avatar`: it belongs to its uploader and is deleted when
 * they replace or remove it, or delete their account. Additive: one enum
 * value, no rows change.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_media_purpose" ADD VALUE IF NOT EXISTS 'avatar';
  `);
}

/**
 * Postgres cannot drop one value from an enum in place. The value is left:
 * unused, it changes nothing.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally empty.
}
