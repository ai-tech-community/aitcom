// @vitest-environment node
/**
 * DB-INTEGRATION test for member cards: the link and hover preview behind
 * a member's name in feeds. A name links only to a profile the profile page
 * would show this viewer, and private details never leave the server.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/members/member-card.integration.test.ts
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

describe.skipIf(!RUN_DB)("loadMemberCards [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    cards: typeof import("./member-card");
    drizzle: typeof import("drizzle-orm");
  };
  let m: Mods;
  let fx: { pub: string; priv: string; hidden: string; bare: string };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, schema, { createCaller }, cards, drizzle] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("./member-card"),
        import("drizzle-orm"),
      ]);
    m = { db, schema, createCaller, cards, drizzle };
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    fx = {
      pub: `mc-pub-${suffix}`,
      priv: `mc-priv-${suffix}`,
      hidden: `mc-hidden-${suffix}`,
      // An account with no profile row yet.
      bare: `mc-bare-${suffix}`,
    };
    await m.db.insert(m.schema.user).values(
      Object.values(fx).map((id) => ({
        id,
        email: `${id}@aitcom.test`,
        name: id,
        image: `https://img.test/${id}.png`,
      })),
    );
    await m.db.insert(m.schema.memberProfiles).values([
      {
        userId: fx.pub,
        displayName: "Public",
        bio: "Builds agents",
        company: "Acme",
        skills: ["a", "b", "c", "d", "e", "f", "g"],
        isPublic: true,
        xp: 450,
      },
      {
        userId: fx.priv,
        displayName: "Private",
        bio: "Secret bio",
        company: "Hidden Co",
        skills: ["x"],
        isPublic: false,
        xp: 450,
      },
      {
        userId: fx.hidden,
        displayName: "Hidden",
        bio: "Staff hid me",
        isPublic: true,
        hiddenFromPublic: true,
      },
    ]);
  });

  afterEach(async () => {
    const { inArray } = m.drizzle;
    const ids = Object.values(fx);
    await m.db
      .delete(m.schema.memberProfiles)
      .where(inArray(m.schema.memberProfiles.userId, ids));
    await m.db.delete(m.schema.user).where(inArray(m.schema.user.id, ids));
  });

  function callerAs(userId: string) {
    return m.createCaller({
      db: m.db,
      session: { user: { id: userId, name: userId } } as never,
      headers: new Headers(),
    });
  }

  it("previews a public profile to anyone, with its skills capped", async () => {
    const cards = await m.cards.loadMemberCards(m.db, [fx.pub], "someone");
    expect(cards.get(fx.pub)).toEqual({
      image: `https://img.test/${fx.pub}.png`,
      card: {
        canOpenProfile: true,
        bio: "Builds agents",
        profile: {
          company: "Acme",
          skills: ["a", "b", "c", "d", "e"],
          level: 3,
          tier: "beginner",
        },
      },
    });
  });

  it("keeps a private or staff-hidden profile's details on the server", async () => {
    const cards = await m.cards.loadMemberCards(
      m.db,
      [fx.priv, fx.hidden, fx.bare],
      fx.pub,
    );
    for (const id of [fx.priv, fx.hidden, fx.bare]) {
      expect(cards.get(id)?.card).toEqual(m.cards.CLOSED_MEMBER_CARD);
      // The photo already shows next to the name; it is not a profile detail.
      expect(cards.get(id)?.image).toBe(`https://img.test/${id}.png`);
    }
  });

  it("lets owners open and preview their own private profile", async () => {
    const cards = await m.cards.loadMemberCards(m.db, [fx.priv], fx.priv);
    expect(cards.get(fx.priv)?.card).toMatchObject({
      canOpenProfile: true,
      bio: "Secret bio",
      profile: { company: "Hidden Co" },
    });
  });

  it("links a name exactly when the profile page shows that profile", async () => {
    const viewer = `mc-viewer-${Date.now()}`;
    const ids = [fx.pub, fx.priv, fx.hidden];
    const cards = await m.cards.loadMemberCards(m.db, ids, viewer);
    for (const id of ids) {
      const page = await callerAs(viewer).members.getPublicProfile({
        userId: id,
      });
      expect([id, cards.get(id)?.card.canOpenProfile]).toEqual([
        id,
        page !== null,
      ]);
    }
  });

  it("asks nothing of the database for an empty page", async () => {
    const cards = await m.cards.loadMemberCards(m.db, ["", ""], null);
    expect(cards.size).toBe(0);
  });
});
