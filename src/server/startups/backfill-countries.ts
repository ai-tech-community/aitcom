/**
 * Backfill `startup.country`. Idempotent. By default only rows with a null
 * country are read, so a re-run retries what is still unplaced. `--all`
 * re-resolves every row and rewrites any stored country that changed (after
 * a resolver fix); a failed lookup never clears a stored country.
 *
 * Local lists first; Nominatim (1 req/s) once per distinct unknown place.
 * Dry run by default — prints every place and the country it resolves to.
 *
 * Run with:
 *   pnpm db:backfill-startup-countries                  # dry run, no writes
 *   pnpm db:backfill-startup-countries --apply          # write
 *   pnpm db:backfill-startup-countries --all [--apply]  # re-check every row
 *
 * How to tell it worked:
 *   SELECT country, count(*) FROM app.startup
 *   WHERE status = 'approved' GROUP BY 1 ORDER BY 2 DESC;
 *   Expected: no city names (only ISO codes), and null only for remote,
 *   multi-region, or places the geocoder could not match.
 */
import { inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { startups } from "@/server/db/schema";
import {
  createStartupCountryResolver,
  planStartupCountryBackfill,
} from "@/server/startups/country";

async function main() {
  const apply = process.argv.includes("--apply");
  const all = process.argv.includes("--all");
  const rows = await db
    .select({
      id: startups.id,
      region: startups.region,
      country: startups.country,
    })
    .from(startups)
    .where(all ? undefined : isNull(startups.country));
  console.log(`Rows read${all ? "" : " (no country yet)"}: ${rows.length}`);

  const groups = await planStartupCountryBackfill(
    rows,
    createStartupCountryResolver(),
  );
  for (const group of groups) {
    console.log(
      `${String(group.ids.length).padStart(5)}  ${group.country ?? "--"}  ${group.region ?? "(no region)"}`,
    );
  }

  const stale = groups.filter((group) => group.stale.length > 0);
  const staleRows = stale.reduce((sum, group) => sum + group.stale.length, 0);
  const placedRows = groups
    .filter((group) => group.country)
    .reduce((sum, group) => sum + group.ids.length, 0);
  console.log(
    `Placed ${placedRows} of ${rows.length} rows; ${staleRows} rows to write.`,
  );

  if (!apply) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }

  for (const group of stale) {
    await db
      .update(startups)
      // Derived data, not an edit: keep updated_at (drizzle bumps it by default).
      .set({ country: group.country, updatedAt: sql`${startups.updatedAt}` })
      .where(inArray(startups.id, group.stale));
  }
  console.log(`Wrote ${staleRows} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
