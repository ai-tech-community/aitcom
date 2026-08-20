/**
 * DB-INTEGRATION test for Hub enrolment on signup (ADR-0019).
 *
 * AUTO-SKIPS unless RUN_DB_TESTS=1 and a local-looking DATABASE_URL is set.
 * See work-grid.integration.test.ts for the gate rationale.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
 *     NEON_LOCAL_PROXY=localhost:5433 \
 *     pnpm exec vitest run src/server/db/enroll-in-hub.integration.test.ts
 *
 * Soren Ravn is a human member fixture, not an agent.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("Hub enrolment [DB integration]", () => {
  let db: typeof import("@/server/db").db;
  let schema: typeof import("@/server/db/schema");
  let enrollInHub: typeof import("./enroll-in-hub").enrollInHub;
  let backfillHubEnrollment: typeof import("./enroll-in-hub").backfillHubEnrollment;
  let auth: typeof import("@/server/better-auth").auth;

  const userIds: string[] = [];
  const emails: string[] = [];
  let hubId: string | undefined;
  let createdHub = false;

  beforeAll(async () => {
    const [dbMod, schemaMod, enrollMod, authMod] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./enroll-in-hub"),
      import("@/server/better-auth"),
    ]);
    db = dbMod.db;
    schema = schemaMod;
    enrollInHub = enrollMod.enrollInHub;
    backfillHubEnrollment = enrollMod.backfillHubEnrollment;
    auth = authMod.auth;
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    if (userIds.length) {
      await db
        .delete(schema.communityMemberships)
        .where(inArray(schema.communityMemberships.userId, userIds));
      await db
        .delete(schema.memberProfiles)
        .where(inArray(schema.memberProfiles.userId, userIds));
      await db
        .delete(schema.memberBadges)
        .where(inArray(schema.memberBadges.userId, userIds));
      await db
        .delete(schema.activityEvents)
        .where(inArray(schema.activityEvents.actorId, userIds));
      await db
        .delete(schema.session)
        .where(inArray(schema.session.userId, userIds));
      await db
        .delete(schema.account)
        .where(inArray(schema.account.userId, userIds));
      await db.delete(schema.user).where(inArray(schema.user.id, userIds));
      userIds.length = 0;
    }
    if (emails.length) {
      await db
        .delete(schema.verification)
        .where(inArray(schema.verification.identifier, emails));
      emails.length = 0;
    }
    if (createdHub && hubId) {
      await db
        .delete(schema.communityMemberships)
        .where(eq(schema.communityMemberships.communityId, hubId));
      await db
        .delete(schema.communities)
        .where(eq(schema.communities.id, hubId));
      createdHub = false;
      hubId = undefined;
    }
  });

  async function ensureHub(createdBy: string): Promise<string> {
    const { and, eq, isNull } = await import("drizzle-orm");
    const existing = await db.query.communities.findFirst({
      where: and(
        eq(schema.communities.slug, "ait"),
        isNull(schema.communities.deletedAt),
      ),
      columns: { id: true },
    });
    if (existing) {
      hubId = existing.id;
      return existing.id;
    }
    const [created] = await db
      .insert(schema.communities)
      .values({
        name: `AIT Hub ${createdBy}`,
        slug: "ait",
        createdBy,
        isListedInDirectory: false,
      })
      .returning({ id: schema.communities.id });
    hubId = created!.id;
    createdHub = true;
    return created!.id;
  }

  it("a Better Auth signup receives an active ait membership", async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = `hub-owner-${sfx}`;
    userIds.push(ownerId);
    await db.insert(schema.user).values({
      id: ownerId,
      email: `${ownerId}@example.test`,
      name: "Hub Seed",
    });
    await ensureHub(ownerId);

    const email = `soren-${sfx}@example.test`;
    emails.push(email);
    await auth.api.signUpEmail({
      body: {
        email,
        password: "testpassword123",
        name: "Soren Ravn",
      },
    });

    const { and, eq } = await import("drizzle-orm");
    const [created] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    expect(created).toBeDefined();
    userIds.push(created!.id);

    const membership = await db.query.communityMemberships.findFirst({
      where: and(
        eq(schema.communityMemberships.communityId, hubId!),
        eq(schema.communityMemberships.userId, created!.id),
      ),
    });
    expect(membership).toMatchObject({
      role: "member",
      status: "active",
    });

    const agent = await db.query.agentProfiles.findFirst({
      where: eq(schema.agentProfiles.ownerId, created!.id),
    });
    expect(agent).toBeUndefined();
  });

  it("re-running the backfill is a no-op after enrolment", async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = `hub-owner-${sfx}`;
    const orphanId = `hub-orphan-${sfx}`;
    userIds.push(ownerId, orphanId);
    await db.insert(schema.user).values([
      { id: ownerId, email: `${ownerId}@example.test`, name: "Hub Seed" },
      { id: orphanId, email: `${orphanId}@example.test`, name: "Soren Ravn" },
    ]);
    await ensureHub(ownerId);

    const first = await backfillHubEnrollment(db);
    expect(first.enrolled).toBeGreaterThanOrEqual(1);

    const second = await backfillHubEnrollment(db);
    expect(second.enrolled).toBe(0);

    await enrollInHub(db, orphanId);
    const third = await backfillHubEnrollment(db);
    expect(third.enrolled).toBe(0);
  });
});
