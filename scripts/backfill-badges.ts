/**
 * Badge backfill (ADR-0039) — a production action, run by the owner.
 *
 * Evaluates every badge track for every member with a profile, so members
 * get the tiers they already qualify for, and moves free-text prize rows
 * (a challenge's `rewards.badgeReward` stored in `member_badge`) into
 * `member_award`. Backfilled badges get no XP, activity event or
 * notification. Rows that match no challenge are reported and kept.
 *
 * Dry run (reads only; prints what would be written):
 *   pnpm exec tsx --env-file=.env scripts/backfill-badges.ts
 *
 * Apply (writes; both flags are required):
 *   pnpm exec tsx --env-file=.env scripts/backfill-badges.ts \
 *     --apply --i-understand-this-writes
 *
 * Options:
 *   --batch-size=<n>   members per batch (default 100)
 *
 * The env file's DATABASE_URL decides which database this touches; the
 * first line printed names its host. Idempotent: a second run writes
 * nothing.
 * Core logic and tests: src/server/badges/backfill.ts.
 */
import { db } from "@/server/db";
import {
  formatBackfillReport,
  runBadgeBackfill,
} from "@/server/badges/backfill";
import { getPayloadClient } from "@/server/payload";

const WRITE_CONFIRMATION = "--i-understand-this-writes";

function parseArgs(argv: readonly string[]) {
  const apply = argv.includes("--apply");
  const confirmed = argv.includes(WRITE_CONFIRMATION);
  const batchArg = argv.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = batchArg ? Number(batchArg.split("=")[1]) : undefined;
  if (
    batchSize !== undefined &&
    !(Number.isInteger(batchSize) && batchSize > 0)
  ) {
    throw new Error(`Invalid --batch-size: ${batchArg}`);
  }
  return { apply, confirmed, batchSize };
}

async function main() {
  const { apply, confirmed, batchSize } = parseArgs(process.argv.slice(2));
  if (apply && !confirmed) {
    console.error(
      `--apply writes to the database. Add ${WRITE_CONFIRMATION} to confirm.`,
    );
    process.exit(2);
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host || "(unset)";
    } catch {
      return "(unparseable)";
    }
  })();
  console.log(`${apply ? "APPLY" : "Dry run"} against database host ${host}`);

  const report = await runBadgeBackfill(
    { db, payload: getPayloadClient },
    { apply, batchSize, log: (line) => console.log(line) },
  );
  console.log(formatBackfillReport(report).join("\n"));
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Badge backfill failed:", err);
    process.exit(1);
  });
