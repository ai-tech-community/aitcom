/**
 * DB-INTEGRATION test for hackathon certificate issuance at finalize (#163).
 * Proves, against a REAL local DB, that finalizeHackathon issues winner
 * certificates to members of the prize-winning team and participation
 * certificates to members of every other submitted team (none to teams that
 * never submitted), that each recipient gets one notification — and that
 * RE-FINALIZING duplicates neither certificates nor notifications (the unique
 * (challenge_id, user_id) index + ON CONFLICT DO NOTHING).
 *
 * ── This suite AUTO-SKIPS unless you explicitly opt in. ──────────────────────
 * Same gate as team-workspace.integration.test.ts: a plain `pnpm test` SKIPS
 * everything here and never opens a db connection. It only runs when BOTH:
 *
 *   1. RUN_DB_TESTS === "1", AND
 *   2. a LOCAL-looking database is configured (NEON_LOCAL_PROXY, or a
 *      localhost/docker DATABASE_URL). Cloud Neon hosts are hard-rejected.
 *
 * Enable with:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
 *     NEON_LOCAL_PROXY=localhost:5433 \
 *     pnpm exec vitest run src/server/api/routers/hackathon-certificates.integration.test.ts
 *
 * (SKIP_ENV_VALIDATION is needed because vitest's jsdom environment trips
 * the t3-env server-var guard; the DATABASE_URL/NEON_LOCAL_PROXY values
 * match the repo's docker compose dev stack.)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

// ── Opt-in gate (pure, no db import) ────────────────────────────────────────

/** A Neon CLOUD host must never be hit by this suite. */
function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

/** True only for a local-looking Postgres host. */
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

// ── The integration suite (skipped wholesale unless opted in) ───────────────

describe.skipIf(!RUN_DB)(
  "hackathon certificates issued at finalize [DB integration]",
  () => {
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      createCaller: typeof import("@/server/api/root").createCaller;
      getPayloadClient: typeof import("@/server/payload").getPayloadClient;
      eq: typeof import("drizzle-orm").eq;
      and: typeof import("drizzle-orm").and;
      inArray: typeof import("drizzle-orm").inArray;
    };
    let m: Mods;

    beforeAll(async () => {
      const [{ db }, schema, { createCaller }, { getPayloadClient }, drizzle] =
        await Promise.all([
          import("@/server/db"),
          import("@/server/db/schema"),
          import("@/server/api/root"),
          import("@/server/payload"),
          import("drizzle-orm"),
        ]);
      m = {
        db,
        schema,
        createCaller,
        getPayloadClient,
        eq: drizzle.eq,
        and: drizzle.and,
        inArray: drizzle.inArray,
      };

      const url = process.env.DATABASE_URL ?? "";
      if (looksLikeCloudNeon(url)) {
        throw new Error(
          "Refusing to run DB integration tests against a cloud Neon DATABASE_URL.",
        );
      }
    });

    type Fixture = {
      sponsorId: string;
      /** Two members of team A (submitted first → rank 1 → prize). */
      winner1: string;
      winner2: string;
      /** Member of team B (submitted later → participant). */
      participant1: string;
      /** Member of team C (never submitted → no certificate). */
      ghost1: string;
      allUserIds: string[];
      challengeId: number;
      teamAId: string;
      teamBId: string;
      teamCId: string;
    };
    let fx: Fixture;

    function userCaller(userId: string) {
      return m.createCaller({
        db: m.db,
        session: { user: { id: userId } } as never,
        headers: new Headers(),
      });
    }

    async function seedUser(id: string, label: string) {
      const { db, schema } = m;
      await db.insert(schema.user).values({
        id,
        email: `${id}@example.test`,
        name: label,
      });
      await db.insert(schema.memberProfiles).values({
        userId: id,
        displayName: label,
        xp: 0,
        level: 1,
      });
    }

    beforeEach(async () => {
      const { db, schema, getPayloadClient } = m;
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const sponsorId = `it-cert-sponsor-${suffix}`;
      const winner1 = `it-cert-w1-${suffix}`;
      const winner2 = `it-cert-w2-${suffix}`;
      const participant1 = `it-cert-p1-${suffix}`;
      const ghost1 = `it-cert-g1-${suffix}`;
      const eventId = 12345;

      await seedUser(sponsorId, "Cert Sponsor");
      await seedUser(winner1, "Cert Winner 1");
      await seedUser(winner2, "Cert Winner 2");
      await seedUser(participant1, "Cert Participant 1");
      await seedUser(ghost1, "Cert Ghost 1");

      const payload = await getPayloadClient();
      const challenge = await payload.create({
        collection: "challenges",
        data: {
          title: `Integration Certificates ${suffix}`,
          slug: `it-certs-${suffix}`,
          description: {
            root: {
              type: "root",
              direction: "ltr" as const,
              format: "" as const,
              indent: 0,
              version: 1,
              children: [
                {
                  type: "paragraph",
                  version: 1,
                  children: [{ type: "text", text: "integration test" }],
                },
              ],
            },
          },
          type: "open-ended" as const,
          status: "draft" as const,
          difficulty: "beginner" as const,
          publishedBy: "member" as const,
          creatorId: sponsorId,
          startsAt: new Date().toISOString(),
          endsAt: new Date().toISOString(),
          objectives: [
            {
              description: "Build a robot arm",
              verification: "test" as const,
              targetCount: 1,
            },
          ],
          rewards: { xpReward: 0 },
          maxParticipants: 0,
          proposedBy: sponsorId,
        },
      });
      const challengeId = challenge.id;

      // Three teams: A submitted first (rank 1 on the speed tiebreak at equal
      // zero scores), B submitted a minute later, C never submitted.
      const t0 = new Date("2026-06-12T10:00:00Z");
      const t1 = new Date("2026-06-12T10:01:00Z");
      const mkTeam = async (
        name: string,
        captainId: string,
        submittedAt: Date | null,
        code: string,
      ) => {
        const [team] = await db
          .insert(schema.teams)
          .values({
            challengeId,
            eventId,
            name,
            captainId,
            joinCode: `${code}-${suffix.slice(-8).toUpperCase()}`.slice(0, 20),
            maxSize: 5,
            status: "locked",
            submittedAt,
          })
          .returning();
        return team!.id;
      };
      const teamAId = await mkTeam(`A ${suffix.slice(-6)}`, winner1, t0, "CA");
      const teamBId = await mkTeam(
        `B ${suffix.slice(-6)}`,
        participant1,
        t1,
        "CB",
      );
      const teamCId = await mkTeam(`C ${suffix.slice(-6)}`, ghost1, null, "CC");

      await db.insert(schema.challengeEnrollments).values([
        { userId: winner1, challengeId, teamId: teamAId, status: "active" },
        { userId: winner2, challengeId, teamId: teamAId, status: "active" },
        {
          userId: participant1,
          challengeId,
          teamId: teamBId,
          status: "active",
        },
        { userId: ghost1, challengeId, teamId: teamCId, status: "active" },
      ]);

      fx = {
        sponsorId,
        winner1,
        winner2,
        participant1,
        ghost1,
        allUserIds: [sponsorId, winner1, winner2, participant1, ghost1],
        challengeId,
        teamAId,
        teamBId,
        teamCId,
      };
    });

    afterEach(async () => {
      if (!fx) return;
      const { db, schema, eq, inArray, getPayloadClient } = m;

      await db
        .delete(schema.notifications)
        .where(inArray(schema.notifications.userId, fx.allUserIds));
      await db
        .delete(schema.hackathonCertificates)
        .where(eq(schema.hackathonCertificates.challengeId, fx.challengeId));
      await db
        .delete(schema.challengeEnrollments)
        .where(eq(schema.challengeEnrollments.challengeId, fx.challengeId));
      await db
        .delete(schema.teams)
        .where(eq(schema.teams.challengeId, fx.challengeId));
      for (const id of fx.allUserIds) {
        await db
          .delete(schema.memberProfiles)
          .where(eq(schema.memberProfiles.userId, id));
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
      const payload = await getPayloadClient();
      await payload.delete({ collection: "challenges", id: fx.challengeId });
    });

    it("issues winner/participant certificates + notifications once, idempotently across re-finalize", async () => {
      const { db, schema, eq, and, inArray } = m;
      const sponsor = userCaller(fx.sponsorId);

      const first = await sponsor.hackathon.finalizeHackathon({
        challengeId: fx.challengeId,
      });
      expect(first.winnerTeamId).toBe(fx.teamAId);

      const certs = await db
        .select()
        .from(schema.hackathonCertificates)
        .where(eq(schema.hackathonCertificates.challengeId, fx.challengeId));
      const byUser = new Map(certs.map((c) => [c.userId, c.kind]));
      expect(byUser.get(fx.winner1)).toBe("winner");
      expect(byUser.get(fx.winner2)).toBe("winner");
      expect(byUser.get(fx.participant1)).toBe("participant");
      expect(byUser.has(fx.ghost1)).toBe(false); // never submitted
      expect(certs).toHaveLength(3);

      const notifWhere = and(
        inArray(schema.notifications.userId, fx.allUserIds),
        eq(schema.notifications.type, "hackathon_certificate"),
      );
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(notifWhere);
      expect(notifs.map((n) => n.userId).sort()).toEqual(
        [fx.winner1, fx.winner2, fx.participant1].sort(),
      );

      // Re-finalize: ranks recompute, but no duplicate certificates and no
      // duplicate notifications appear.
      const second = await sponsor.hackathon.finalizeHackathon({
        challengeId: fx.challengeId,
      });
      expect(second.winnerTeamId).toBe(fx.teamAId);

      const certsAfter = await db
        .select()
        .from(schema.hackathonCertificates)
        .where(eq(schema.hackathonCertificates.challengeId, fx.challengeId));
      expect(certsAfter).toHaveLength(3);
      expect(
        new Map(certsAfter.map((c) => [c.userId, c.kind])).get(fx.winner1),
      ).toBe("winner");

      const notifsAfter = await db
        .select()
        .from(schema.notifications)
        .where(notifWhere);
      expect(notifsAfter).toHaveLength(3);
    });
  },
);
