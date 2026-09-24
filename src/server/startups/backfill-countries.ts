/**
 * Backfill `startup.country` for rows that have none. Idempotent: only rows
 * with a null country are read, so a re-run retries what is still unplaced.
 *
 * Local lists first; Nominatim (1 req/s) once per distinct unknown place.
 * Dry run by default — prints every place and the country it resolves to.
 *
 * Run with:
 *   pnpm db:backfill-startup-countries            # dry run, no writes
 *   pnpm db:backfill-startup-countries --apply    # write
 *
 * How to tell it worked:
 *   SELECT country, count(*) FROM app.startup
 *   WHERE status = 'approved' GROUP BY 1 ORDER BY 2 DESC;
 *   Expected: no city names (only ISO codes), and null only for remote,
 *   multi-region, or places the geocoder could not match.
 */
import { and, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { startups } from "@/server/db/schema";
import {
  createStartupCountryResolver,
  planStartupCountryBackfill,
} from "@/server/startups/country";

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await db
    .select({ id: startups.id, region: startups.region })
    .from(startups)
    .where(isNull(startups.country));
  console.log(`Rows without a country: ${rows.length}`);

  const groups = await planStartupCountryBackfill(
    rows,
    createStartupCountryResolver(),
  );
  for (const group of groups) {
    console.log(
      `${String(group.ids.length).padStart(5)}  ${group.country ?? "--"}  ${group.region ?? "(no region)"}`,
    );
  }

  const placed = groups.filter((group) => group.country);
  const placedRows = placed.reduce((sum, group) => sum + group.ids.length, 0);
  console.log(
    `Placed ${placedRows} of ${rows.length} rows (${placed.length} of ${groups.length} places).`,
  );

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }

  for (const group of placed) {
    await db
      .update(startups)
      // Derived data, not an edit: keep updated_at (drizzle bumps it by default).
      .set({ country: group.country, updatedAt: sql`${startups.updatedAt}` })
      .where(and(inArray(startups.id, group.ids), isNull(startups.country)));
  }
  console.log(`Wrote ${placedRows} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
