// @vitest-environment node
/**
 * DB-INTEGRATION test: the public member profile and the /members roster
 * return only the fields they show, the profile follows the viewer rule
 * (owner sees their own profile; visitors only see public ones), the agent
 * page follows the same rule, and badge counts match the badges shown.
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

const sorted = (o: object) => Object.keys(o).sort();

const PUBLIC_PROFILE_RESPONSE_KEYS = [
  "audience",
  "badges",
  "certificates",
  "eventsAttended",
  "profile",
  "reach",
  "social",
  "user",
];
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
const ROSTER_ENTRY_KEYS = [
  "avatarUrl",
  "badgeCount",
  "hasAgent",
  "profile",
  "social",
];
const ROSTER_PROFILE_KEYS = [
  "company",
  "displayName",
  "level",
  "skills",
  "userId",
  "xp",
];
const AGENT_PAGE_KEYS = ["agent", "audience", "owner", "reach", "social"];
const AGENT_KEYS = [
  "avatar",
  "bio",
  "createdAt",
  "description",
  "expertiseTags",
  "name",
  "totalContributions",
];

describe.skipIf(!RUN_DB)("public member profile [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    loadAgentProfilePage: typeof import("@/server/members/agent-profile").loadAgentProfilePage;
    rosterOverrideUserId: string;
    drizzle: typeof import("drizzle-orm");
  };
  let m: Mods;
  let fx: {
    pub: string;
    priv: string;
    hidden: string;
    other: string;
    idle: string;
  };
  let suffix: string;

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { createCaller },
      { loadAgentProfilePage },
      { REAL_SOREN_RAVN_USER_ID },
      drizzle,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/api/root"),
      import("@/server/members/agent-profile"),
      import("@/lib/public-roster"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      createCaller,
      loadAgentProfilePage,
      rosterOverrideUserId: REAL_SOREN_RAVN_USER_ID,
      drizzle,
    };
  });

  beforeEach(async () => {
    suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    fx = {
      pub: `pp-pub-${suffix}`,
      priv: `pp-priv-${suffix}`,
      hidden: `pp-hidden-${suffix}`,
      other: `pp-other-${suffix}`,
      idle: `pp-idle-${suffix}`,
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
        websiteUrl: "https://example.test",
        isPublic: true,
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
      { userId: fx.idle, displayName: `Idle ${suffix}`, isPublic: true },
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
      { ownerId: fx.hidden, name: "Hidden Agent" },
      { ownerId: fx.idle, name: "Idle Agent", status: "inactive" },
    ]);
  });

  afterEach(async () => {
    const { inArray } = m.drizzle;
    const ids = Object.values(fx);
    await m.db
      .delete(m.schema.agentProfiles)
      .where(inArray(m.schema.agentProfiles.ownerId, ids));
    await m.db
      .delete(m.schema.memberBadges)
      .where(inArray(m.schema.memberBadges.userId, ids));
    await m.db
      .delete(m.schema.memberProfiles)
      .where(inArray(m.schema.memberProfiles.userId, ids));
    await m.db.delete(m.schema.user).where(inArray(m.schema.user.id, ids));
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

  describe("getPublicProfile", () => {
    it("returns exactly the public response and profile fields", async () => {
      const data = await callerAs(null).members.getPublicProfile({
        userId: fx.pub,
      });
      expect(data).not.toBeNull();
      expect(sorted(data!)).toEqual(PUBLIC_PROFILE_RESPONSE_KEYS);
      expect(sorted(data!.profile)).toEqual(PUBLIC_PROFILE_KEYS);
      expect(data!.audience).toBe("visitor");
      expect(data!.reach).toEqual({ kind: "public" });
    });

    it("lets the owner see their own private profile, pointing at Settings", async () => {
      const own = await callerAs(fx.priv).members.getPublicProfile({
        userId: fx.priv,
      });
      expect(own?.profile.userId).toBe(fx.priv);
      expect(own?.audience).toBe("owner");
      expect(own?.reach).toEqual({ kind: "ownerOnly", reason: "private" });
      expect(sorted(own!)).toEqual(PUBLIC_PROFILE_RESPONSE_KEYS);
      expect(sorted(own!.profile)).toEqual(PUBLIC_PROFILE_KEYS);
    });

    it("lets the owner see their own staff-hidden profile, with that reason", async () => {
      const own = await callerAs(fx.hidden).members.getPublicProfile({
        userId: fx.hidden,
      });
      expect(own?.reach).toEqual({
        kind: "ownerOnly",
        reason: "hiddenByStaff",
      });
    });

    it("tells the owner when their profile is public", async () => {
      const own = await callerAs(fx.pub).members.getPublicProfile({
        userId: fx.pub,
      });
      expect(own?.audience).toBe("owner");
      expect(own?.reach).toEqual({ kind: "public" });
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
  });

  describe("listMembers", () => {
    it("returns exactly the roster fields", async () => {
      const { items } = await callerAs(null).members.listMembers({
        search: suffix,
        limit: 50,
      });
      const mine = items.find((i) => i.profile.userId === fx.pub);
      expect(mine).toBeDefined();
      expect(sorted(mine!)).toEqual(ROSTER_ENTRY_KEYS);
      expect(sorted(mine!.profile)).toEqual(ROSTER_PROFILE_KEYS);
      expect(mine!.hasAgent).toBe(true);
      // Non-public members stay off the roster.
      const ids = items.map((i) => i.profile.userId);
      expect(ids).not.toContain(fx.priv);
      expect(ids).not.toContain(fx.hidden);
    });
  });

  describe("agent page", () => {
    const load = (ownerId: string, viewerId: string | null) =>
      m.loadAgentProfilePage(m.db, { ownerId, viewerId });

    it("shows a public member's active agent to visitors, with only rendered fields", async () => {
      const page = await load(fx.pub, null);
      expect(page).not.toBeNull();
      expect(sorted(page!)).toEqual(AGENT_PAGE_KEYS);
      expect(sorted(page!.agent)).toEqual(AGENT_KEYS);
      expect(page!.agent.name).toBe("Pub Agent");
      expect(page!.owner).toEqual({ displayName: `Public ${suffix}` });
      expect(page!.reach).toEqual({ kind: "public" });
    });

    it("follows a private owner profile", async () => {
      await expect(load(fx.priv, null)).resolves.toBeNull();
      await expect(load(fx.priv, fx.other)).resolves.toBeNull();
      const own = await load(fx.priv, fx.priv);
      expect(own?.agent.name).toBe("Priv Agent");
      expect(own?.reach).toEqual({ kind: "ownerOnly", reason: "private" });
    });

    it("follows a staff-hidden owner profile", async () => {
      await expect(load(fx.hidden, null)).resolves.toBeNull();
      await expect(load(fx.hidden, fx.other)).resolves.toBeNull();
      const own = await load(fx.hidden, fx.hidden);
      expect(own?.agent.name).toBe("Hidden Agent");
      expect(own?.reach).toEqual({
        kind: "ownerOnly",
        reason: "hiddenByStaff",
      });
    });

    it("shows a non-active agent only to its owner, with its status", async () => {
      await expect(load(fx.idle, null)).resolves.toBeNull();
      await expect(load(fx.idle, fx.other)).resolves.toBeNull();
      const own = await load(fx.idle, fx.idle);
      expect(own?.agent.name).toBe("Idle Agent");
      expect(own?.reach).toEqual({
        kind: "ownerOnly",
        reason: "agentNotActive",
        agentStatus: "inactive",
      });
    });

    it("applies the roster's no-agent override for visitors", async () => {
      const { eq } = m.drizzle;
      const ownerId = m.rosterOverrideUserId;
      const inserted: { user: boolean; profile: boolean; agent: boolean } = {
        user: false,
        profile: false,
        agent: false,
      };
      try {
        inserted.user =
          (
            await m.db
              .insert(m.schema.user)
              .values({
                id: ownerId,
                email: `${suffix}@aitcom.test`,
                name: "R",
              })
              .onConflictDoNothing()
              .returning({ id: m.schema.user.id })
          ).length > 0;
        inserted.profile =
          (
            await m.db
              .insert(m.schema.memberProfiles)
              .values({ userId: ownerId, displayName: `Override ${suffix}` })
              .onConflictDoNothing()
              .returning({ id: m.schema.memberProfiles.userId })
          ).length > 0;
        inserted.agent =
          (
            await m.db
              .insert(m.schema.agentProfiles)
              .values({ ownerId, name: "Override Agent" })
              .onConflictDoNothing()
              .returning({ id: m.schema.agentProfiles.id })
          ).length > 0;
        expect(inserted).toEqual({ user: true, profile: true, agent: true });

        await expect(load(ownerId, null)).resolves.toBeNull();
        const own = await load(ownerId, ownerId);
        expect(own?.reach).toEqual({
          kind: "ownerOnly",
          reason: "hiddenByStaff",
        });
      } finally {
        if (inserted.agent) {
          await m.db
            .delete(m.schema.agentProfiles)
            .where(eq(m.schema.agentProfiles.ownerId, ownerId));
        }
        if (inserted.profile) {
          await m.db
            .delete(m.schema.memberProfiles)
            .where(eq(m.schema.memberProfiles.userId, ownerId));
        }
        if (inserted.user) {
          await m.db.delete(m.schema.user).where(eq(m.schema.user.id, ownerId));
        }
      }
    });
  });

  it("counts only the badges the profile shows", async () => {
    const caller = callerAs(null);
    const profile = await caller.members.getPublicProfile({ userId: fx.pub });
    expect(profile?.badges.map((b) => b.slug).sort()).toEqual([
      "first_event",
      "regular",
    ]);

    const { items } = await caller.members.listMembers({
      search: suffix,
      limit: 50,
    });
    const listed = items.find((i) => i.profile.userId === fx.pub);
    expect(listed?.badgeCount).toBe(profile!.badges.length);

    // The off-catalog row is still stored.
    const stored = await m.db
      .select()
      .from(m.schema.memberBadges)
      .where(m.drizzle.eq(m.schema.memberBadges.userId, fx.pub));
    expect(stored).toHaveLength(3);
  });
});
