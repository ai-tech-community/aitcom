/**
 * Idempotent backfill — ensure the unlisted Hub root (`ait`) exists, enrol
 * every existing user who lacks a membership, then reclassify as an
 * ownerless anchor (ADR-0019). Re-running is a no-op.
 *
 * A first dashboard load (`getMyCommunities` → `enrollInHub` → `ensureHub`)
 * is enough after deploy. This script is belt-and-suspenders for stranded
 * accounts that have not signed in yet.
 *
 * Run with:
 *   pnpm db:backfill-hub
 *   npx tsx src/server/db/backfill-hub-enrollment.ts
 *
 * Requires DATABASE_URL in the environment (e.g. via .env.local).
 *
 * How to tell it worked in production:
 *   SELECT
 *     (SELECT count(*) FROM app."user") AS users,
 *     (SELECT count(*) FROM app.community_membership cm
 *      JOIN app.community c ON c.id = cm.community_id
 *      WHERE c.slug = 'ait') AS ait_members,
 *     (SELECT count(*) FROM app.community_membership cm
 *      JOIN app.community c ON c.id = cm.community_id
 *      WHERE c.slug = 'ait' AND cm.role <> 'member') AS privileged,
 *     (SELECT is_listed_in_directory FROM app.community WHERE slug = 'ait')
 *       AS listed;
 *   Expected: users == ait_members, privileged = 0, listed = false.
 *   A second run prints "Nothing to do" / demoted 0.
 */
import { db } from "./index";
import { backfillHubEnrollment, reclassifyAitAsAnchor } from "./enroll-in-hub";

async function main() {
  const { enrolled } = await backfillHubEnrollment(db);
  if (enrolled === 0) {
    console.log("All users already enrolled in the Hub. Nothing to do.");
  } else {
    console.log(`  ✓ Enrolled ${enrolled} user(s) into the Hub.`);
  }

  const { demoted } = await reclassifyAitAsAnchor(db);
  console.log("  ✓ ait unlisted from directory.");
  console.log(`  ✓ Demoted ${demoted} privileged membership(s) on ait.`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Hub enrolment backfill failed:", err);
    process.exit(1);
  });
