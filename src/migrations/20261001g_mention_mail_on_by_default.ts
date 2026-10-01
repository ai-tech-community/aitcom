// Mention emails go live, on by default (#391): a member mentioned in a
// post gets an email unless they turn it off. Only the column default
// changes; no member had saved a choice yet (the switch did nothing), and
// stored rows keep whatever they say.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."hub_mail_pref" ALTER COLUMN "mention" SET DEFAULT true;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."hub_mail_pref" ALTER COLUMN "mention" SET DEFAULT false;
  `);
}
