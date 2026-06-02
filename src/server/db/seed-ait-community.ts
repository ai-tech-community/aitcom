/**
 * Seed migration — creates the default "AIT Community" and enrols all
 * existing users as members (first user by createdAt becomes owner).
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

async function seed() {
  console.log("Checking for existing AIT community...");

  const existing = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.slug, "ait"))
    .limit(1);

  if (existing.length > 0) {
    console.log("AIT community already exists (slug: ait). Skipping.");
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

  const owner = users[0]!;
  const members = users.slice(1);

  console.log(
    `Creating AIT community with owner ${owner.id} and ${members.length} additional member(s)...`,
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
        isListedInDirectory: true,
        createdBy: owner.id,
      })
      .returning({ id: communities.id });

    if (!community) {
      throw new Error("Failed to insert AIT community row.");
    }

    const communityId = community.id;

    // Insert owner membership
    await tx.insert(communityMemberships).values({
      communityId,
      userId: owner.id,
      role: "owner",
      status: "active",
    });

    // Insert remaining users as members
    if (members.length > 0) {
      await tx.insert(communityMemberships).values(
        members.map((u) => ({
          communityId,
          userId: u.id,
          role: "member" as const,
          status: "active" as const,
        })),
      );
    }

    console.log(`  ✓ Community created: ${communityId}`);
    console.log(`  ✓ Owner enrolled: ${owner.id}`);
    console.log(`  ✓ Members enrolled: ${members.length}`);
  });

  console.log("\nAIT community seeded successfully!");
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
