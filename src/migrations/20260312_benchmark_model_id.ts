import { sql } from "drizzle-orm";
import type { MigrationConfig } from "drizzle-orm/migrator";

export async function up(db: any): Promise<void> {
  await db.execute(
    sql`ALTER TABLE app.benchmark_run ADD COLUMN IF NOT EXISTS model_id TEXT;`
  );
}