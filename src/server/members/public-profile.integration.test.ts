// @vitest-environment node
/**
 * DB-INTEGRATION test: the public member profile returns only the fields the
 * profile shows, follows the viewer rule (owner sees their own profile;
 * visitors only see public ones), the agent page follows the same rule, and
 * badge counts match the badges shown.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/members/public-profile.integration.test.ts
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

const PUBLIC_PROFILE_KEYS = [
  "bio",
  "company",
  "createdAt",
  "displayName",
  "level",
  "skills",
  "userId",
  "websiteUrl",
  "xp",
];

describe.skipIf(!RUN_DB)("public member profile [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    loadAgentProfilePage: typeof import("@/server/members/agent-profile").loadAgentProfilePage;
    inArray: typeof import("drizzle-orm").inArray;
  };
  let m: Mods;
  let fx: { pub: string; priv: string; hidden: string; other: string };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { createCaller },
      { loadAgentProfilePage },
      drizzle,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/members/agent-profile"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      loadAgentProfilePage,
      inArray: drizzle.inArray,
    };
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    fx = {
      pub: `pp-pub-${suffix}`,
      priv: `pp-priv-${suffix}`,
      hidden: `pp-hidden-${suffix}`,
      other: `pp-other-${suffix}`,
    };
    await m.db.insert(m.schema.user).values(
      Object.values(fx).map((id) => ({
        id,
        email: `${id}@aitcom.test`,
        name: id,
      })),
    );
    await m.db.insert(m.schema.memberProfiles).values([
      {
        userId: fx.pub,
        displayName: `Public ${suffix}`,
        bio: "Hello",
        skills: ["ts"],
        isPublic: true,
        // High enough to land in the top-5 leaderboard of a shared test DB.
        xp: 2_000_000_000,
        onboardingIntent: "learn",
        interests: ["agents"],
        experienceLevel: "senior",
        onboardingDismissedAt: new Date(),
      },
      {
        userId: fx.priv,
        displayName: `Private ${suffix}`,
        isPublic: false,
      },
      {
        userId: fx.hidden,
        displayName: `Hidden ${suffix}`,
        isPublic: true,
        hiddenFromPublic: true,
      },
      { userId: fx.other, displayName: `Other ${suffix}`, isPublic: true },
    ]);
    await m.db.insert(m.schema.memberBadges).values([
      { userId: fx.pub, badgeSlug: "first_event" },
      { userId: fx.pub, badgeSlug: "regular" },
      // Not in the badge catalog: kept in the DB, neither shown nor counted.
      { userId: fx.pub, badgeSlug: `off_catalog_${suffix}` },
    ]);
    await m.db.insert(m.schema.agentProfiles).values([
      { ownerId: fx.pub, name: "Pub Agent" },
      { ownerId: fx.priv, name: "Priv Agent" },
    ]);
  });

  afterEach(async () => {
    const ids = Object.values(fx);
    await m.db
      .delete(m.schema.agentProfiles)
      .where(m.inArray(m.schema.agentProfiles.ownerId, ids));
    await m.db
      .delete(m.schema.memberBadges)
      .where(m.inArray(m.schema.memberBadges.userId, ids));
    await m.db
      .delete(m.schema.memberProfiles)
      .where(m.inArray(m.schema.memberProfiles.userId, ids));
    await m.db.delete(m.schema.user).where(m.inArray(m.schema.user.id, ids));
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      session: userId
        ? ({ user: { id: userId, name: userId } } as never)
        : null,
      headers: new Headers(),
    });
  }

  it("returns exactly the public profile fields", async () => {
    const data = await callerAs(null).members.getPublicProfile({
      userId: fx.pub,
    });
    expect(data).not.toBeNull();
    expect(Object.keys(data!.profile).sort()).toEqual(PUBLIC_PROFILE_KEYS);
    expect(data!.reach).toBe("public");
    expect(data!.audience).toBe("visitor");
  });

  it("returns exactly the public profile fields on the roster", async () => {
    const { items } = await callerAs(null).members.listMembers({
      search: "Public",
      limit: 50,
    });
    const mine = items.find((i) => i.profile.userId === fx.pub);
    expect(mine).toBeDefined();
    expect(Object.keys(mine!.profile).sort()).toEqual(PUBLIC_PROFILE_KEYS);
  });

  it("lets the owner see their own private or staff-hidden profile", async () => {
    const priv = await callerAs(fx.priv).members.getPublicProfile({
      userId: fx.priv,
    });
    expect(priv?.profile.userId).toBe(fx.priv);
    expect(priv?.audience).toBe("owner");
    expect(priv?.reach).toBe("owner-only");

    const hidden = await callerAs(fx.hidden).members.getPublicProfile({
      userId: fx.hidden,
    });
    expect(hidden?.reach).toBe("owner-only");
    expect(Object.keys(hidden!.profile).sort()).toEqual(PUBLIC_PROFILE_KEYS);
  });

  it("tells the owner when their profile is public", async () => {
    const own = await callerAs(fx.pub).members.getPublicProfile({
      userId: fx.pub,
    });
    expect(own?.audience).toBe("owner");
    expect(own?.reach).toBe("public");
  });

  it("hides a non-public profile from another member and from visitors", async () => {
    for (const viewer of [fx.other, null]) {
      for (const target of [fx.priv, fx.hidden]) {
        await expect(
          callerAs(viewer).members.getPublicProfile({ userId: target }),
        ).resolves.toBeNull();
      }
    }
  });

  it("applies the same rule to the agent page", async () => {
    await expect(
      m.loadAgentProfilePage(m.db, { ownerId: fx.priv, viewerId: null }),
    ).resolves.toBeNull();
    await expect(
      m.loadAgentProfilePage(m.db, { ownerId: fx.priv, viewerId: fx.other }),
    ).resolves.toBeNull();

    const own = await m.loadAgentProfilePage(m.db, {
      ownerId: fx.priv,
      viewerId: fx.priv,
    });
    expect(own?.agent.name).toBe("Priv Agent");
    expect(own?.audience).toBe("owner");

    const pub = await m.loadAgentProfilePage(m.db, {
      ownerId: fx.pub,
      viewerId: null,
    });
    expect(pub?.agent.name).toBe("Pub Agent");
    expect(pub?.owner?.displayName).toMatch(/^Public /);
  });

  it("counts only the badges the profile shows", async () => {
    const caller = callerAs(null);
    const profile = await caller.members.getPublicProfile({ userId: fx.pub });
    expect(profile?.badges.map((b) => b.slug).sort()).toEqual([
      "first_event",
      "regular",
    ]);

    const { items } = await caller.members.listMembers({
      search: "Public",
      limit: 50,
    });
    const listed = items.find((i) => i.profile.userId === fx.pub);
    expect(listed?.badgeCount).toBe(profile!.badges.length);

    const top = await caller.members.getLeaderboard();
    const ranked = top.find((t) => t.profile.userId === fx.pub);
    expect(ranked?.badgeCount).toBe(profile!.badges.length);

    // The off-catalog row is still stored.
    const stored = await m.db
      .select()
      .from(m.schema.memberBadges)
      .where(m.inArray(m.schema.memberBadges.userId, [fx.pub]));
    expect(stored).toHaveLength(3);
  });
});
