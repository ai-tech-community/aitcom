/**
 * Add the default community spaces to communities that have none.
 *
 * UI-created communities get forum, events, classroom, ideas, and members.
 * Agent-created communities before that shared seed have an empty
 * /settings/spaces page, so the sidebar has no Forum, Classrooms, or
 * Magazine. This script inserts those default rows. A community that
 * already has a magazine also gets the Magazine tab.
 *
 * Dry run (prints the communities, writes nothing):
 *   pnpm exec tsx --env-file=.env scripts/backfill-default-spaces.ts
 *
 * Apply:
 *   pnpm exec tsx --env-file=.env scripts/backfill-default-spaces.ts --write
 *
 * Idempotent: a community that already has any space is skipped, and a
 * second --write run reports zero writes. The env file's DATABASE_URL
 * decides which database this touches. Do not point it at production
 * unless you intend to repair those communities.
 */
import { db } from "@/server/db";
import {
  backfillWrites,
  listCommunitiesWithoutSpaces,
  writeMissingDefaultSpaces,
} from "@/server/communities/backfill-default-spaces";

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(unset)";
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const write = backfillWrites(process.argv.slice(2));
  console.log(
    `${write ? "WRITE" : "Dry run"} against database host ${databaseHost()}`,
  );
  const targets = await listCommunitiesWithoutSpaces(db);
  if (targets.length === 0) {
    console.log("No communities are missing default spaces.");
    return;
  }
  for (const target of targets) {
    console.log(`${target.slug}\t${target.id}\t${target.name}`);
  }
  console.log(`${targets.length} communities have no spaces.`);
  if (!write) {
    console.log("Pass --write to insert the default spaces.");
    return;
  }
  const written = await writeMissingDefaultSpaces(db, targets);
  console.log(`Inserted default spaces for ${written} communities.`);
}

main().catch((error: unknown) => {
  console.error("Default space backfill failed:", error);
  process.exit(1);
});
