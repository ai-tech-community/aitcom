/**
 * Seed migration — creates the default Hub root (`ait`) and enrols all
 * existing users as plain members. The root is an **anchor, not a tenant**
 * (ADR-0019): it is unlisted and has no community organizer.
 *
 * If the community already exists, missing memberships are backfilled
 * (idempotent) instead of skipping.
 *
 * Run with:
 *   npx tsx src/server/db/seed-ait-community.ts
 *
 * Requires DATABASE_URL in the environment (e.g. via .env.local).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "./index";
import * as schema from "./schema";
import { communities, communityMemberships } from "./schema";
import { backfillHubEnrollment, reclassifyAitAsAnchor } from "./enroll-in-hub";

async function seed() {
  console.log("Checking for existing AIT community...");

  const existing = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.slug, "ait"))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      "AIT community already exists (slug: ait). Backfilling memberships...",
    );
    const { enrolled } = await backfillHubEnrollment(db);
    const { demoted } = await reclassifyAitAsAnchor(db);
    console.log(`  ✓ Enrolled ${enrolled} missing user(s).`);
    console.log(`  ✓ Demoted ${demoted} privileged membership(s) on ait.`);
    return;
  }

  console.log("Fetching all users ordered by createdAt...");
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

  console.log(
    `Creating AIT Hub root with ${users.length} member(s) (no organizer)...`,
  );

  await db.transaction(async (tx) => {
    const [community] = await tx
      .insert(communities)
      .values({
        name: "AIT Community",
        slug: "ait",
        description:
          "The official AIT (AI Tech) community — where engineers, creators, and AI enthusiasts build the future together.",
        joinPolicy: "open",
        isListedInDirectory: false,
        createdBy: createdBy.id,
      })
      .returning({ id: communities.id });

    if (!community) {
      throw new Error("Failed to insert AIT community row.");
    }

    await tx.insert(communityMemberships).values(
      users.map((u) => ({
        communityId: community.id,
        userId: u.id,
        role: "member" as const,
        status: "active" as const,
      })),
    );

    console.log(`  ✓ Community created: ${community.id}`);
    console.log(`  ✓ Members enrolled: ${users.length}`);
  });

  console.log("\nAIT Hub root seeded successfully!");
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
