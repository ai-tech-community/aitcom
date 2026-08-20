/**
 * Seed migration — creates the default Hub root (`ait`) and enrols all
 * existing users as plain members. The root is an **anchor, not a tenant**
 * (ADR-0019): it is unlisted and has no community organizer.
 *
 * If the community already exists, missing memberships are backfilled
 * (idempotent) instead of skipping. If it is missing, `ensureHub` inserts
 * the same unlisted row the runtime path uses on first dashboard load.
 *
 * Run with:
 *   npx tsx src/server/db/seed-ait-community.ts
 *
 * Requires DATABASE_URL in the environment (e.g. via .env.local).
 */
import { asc } from "drizzle-orm";

import { db } from "./index";
import * as schema from "./schema";
import {
  backfillHubEnrollment,
  ensureHub,
  reclassifyAitAsAnchor,
} from "./enroll-in-hub";

async function seed() {
  console.log("Checking for users (createdBy FK on the Hub root)...");

  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .orderBy(asc(schema.user.createdAt));

  if (users.length === 0) {
    console.error("ERROR: No users found in the database. Cannot seed.");
    process.exit(1);
  }

  // createdBy is required on community, but the creator is not an organizer
  // of the Hub — every user is enrolled as a plain member (ADR-0019).
  const createdBy = users[0]!;

  console.log("Ensuring AIT Hub root exists (slug: ait, unlisted)...");
  const hub = await ensureHub(db, createdBy.id);
  console.log(`  ✓ Hub id: ${hub.id}`);

  const { enrolled } = await backfillHubEnrollment(db);
  const { demoted } = await reclassifyAitAsAnchor(db);
  console.log(`  ✓ Enrolled ${enrolled} missing user(s).`);
  console.log(`  ✓ Demoted ${demoted} privileged membership(s) on ait.`);

  console.log("\nAIT Hub root seeded successfully!");
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
