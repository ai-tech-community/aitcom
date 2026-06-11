/**
 * DB-INTEGRATION test for the organizer analytics funnel (#165). Proves,
 * against a REAL local DB, that hackathon.analytics aggregates the
 * participation funnel (enrolled → teamed → on a submitted team), the team
 * submission counts, and the cell-completion buckets across COMPETITIVE grids
 * only — and that the operator access gate rejects everyone who is not the
 * hackathon's operator (here: the sponsor of a hub-wide challenge).
 *
 * ── This suite AUTO-SKIPS unless you explicitly opt in. ──────────────────────
 * Same gate as hackathon-certificates.integration.test.ts: a plain `pnpm test`
 * SKIPS everything here and never opens a db connection. It only runs when BOTH:
 *
 *   1. RUN_DB_TESTS === "1", AND
 *   2. a LOCAL-looking database is configured (NEON_LOCAL_PROXY, or a
 *      localhost/docker DATABASE_URL). Cloud Neon hosts are hard-rejected.
 *
 * Enable with:
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/server/api/routers/hackathon-analytics.integration.test.ts
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
  "hackathon analytics aggregation + access gate [DB integration]",
  () => {
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      createCaller: typeof import("@/server/api/root").createCaller;
      getPayloadClient: typeof import("@/server/payload").getPayloadClient;
      eq: typeof import("drizzle-orm").eq;
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
      member1: string;
      member2: string;
      member3: string;
      solo1: string;
      outsider: string;
      allUserIds: string[];
      challengeId: number;
      teamAId: string;
      teamBId: string;
      gridIds: string[];
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
      const sponsorId = `it-anl-sponsor-${suffix}`;
      const member1 = `it-anl-m1-${suffix}`;
      const member2 = `it-anl-m2-${suffix}`;
      const member3 = `it-anl-m3-${suffix}`;
      const solo1 = `it-anl-solo-${suffix}`;
      const quitter = `it-anl-quit-${suffix}`;
      const outsider = `it-anl-out-${suffix}`;
      const eventId = 12345;

      await seedUser(sponsorId, "Analytics Sponsor");
      await seedUser(member1, "Analytics M1");
      await seedUser(member2, "Analytics M2");
      await seedUser(member3, "Analytics M3");
      await seedUser(solo1, "Analytics Solo");
      await seedUser(quitter, "Analytics Quitter");
      await seedUser(outsider, "Analytics Outsider");

      const payload = await getPayloadClient();
      const challenge = await payload.create({
        collection: "challenges",
        data: {
          title: `Integration Analytics ${suffix}`,
          slug: `it-analytics-${suffix}`,
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

      // Teams: A (submitted), B (not submitted), C (disbanded — must not count).
      const mkTeam = async (
        name: string,
        captainId: string,
        status: "locked" | "disbanded",
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
            status,
            submittedAt,
          })
          .returning();
        return team!.id;
      };
      const teamAId = await mkTeam(
        `A ${suffix.slice(-6)}`,
        member1,
        "locked",
        new Date("2026-06-12T10:00:00Z"),
        "NA",
      );
      const teamBId = await mkTeam(
        `B ${suffix.slice(-6)}`,
        member3,
        "locked",
        null,
        "NB",
      );
      await mkTeam(`C ${suffix.slice(-6)}`, sponsorId, "disbanded", null, "NC");

      // 4 active enrollments: 2 on submitted team A, 1 on team B, 1 still
      // solo. Plus an ABANDONED enrollment still pointing at submitted team A
      // (challenges.abandon keeps teamId) — it must be excluded from every
      // funnel stage.
      await db.insert(schema.challengeEnrollments).values([
        { userId: member1, challengeId, teamId: teamAId, status: "active" },
        { userId: member2, challengeId, teamId: teamAId, status: "active" },
        { userId: member3, challengeId, teamId: teamBId, status: "active" },
        { userId: solo1, challengeId, teamId: null, status: "active" },
        { userId: quitter, challengeId, teamId: teamAId, status: "abandoned" },
      ]);

      // Competitive grids: A → pending, claimed, completed(verified),
      // completed(pending result); B → pending, failed(failed result).
      // Plus one COLLABORATIVE grid for the same challenge whose cell must be
      // excluded from every aggregate.
      const mkGrid = async (
        mode: "competitive" | "collaborative",
        teamId: string | null,
      ) => {
        const [grid] = await db
          .insert(schema.workGrids)
          .values({
            challengeId,
            communityId: null,
            teamId,
            mode,
            status: "active",
          })
          .returning();
        return grid!.id;
      };
      const gridA = await mkGrid("competitive", teamAId);
      const gridB = await mkGrid("competitive", teamBId);
      const gridX = await mkGrid("collaborative", null);

      const mkCell = async (
        gridId: string,
        status: "pending" | "claimed" | "completed" | "failed",
      ) => {
        const [cell] = await db
          .insert(schema.workCells)
          .values({
            gridId,
            taskType: "generic",
            verificationMode: "self-report",
            status,
          })
          .returning();
        return cell!.id;
      };
      await mkCell(gridA, "pending");
      await mkCell(gridA, "claimed");
      const aVerified = await mkCell(gridA, "completed");
      const aAwaiting = await mkCell(gridA, "completed");
      await mkCell(gridB, "pending");
      const bFailed = await mkCell(gridB, "failed");
      await mkCell(gridX, "completed"); // collaborative — excluded

      await db.insert(schema.workCellResults).values([
        {
          cellId: aVerified,
          userId: member1,
          agentId: null,
          output: "done",
          verificationOutcome: "verified",
          verifiedAt: new Date(),
        },
        {
          cellId: aAwaiting,
          userId: member2,
          agentId: null,
          output: "done",
          verificationOutcome: "pending",
        },
        {
          cellId: bFailed,
          userId: member3,
          agentId: null,
          output: "nope",
          verificationOutcome: "failed",
        },
      ]);

      fx = {
        sponsorId,
        member1,
        member2,
        member3,
        solo1,
        outsider,
        allUserIds: [
          sponsorId,
          member1,
          member2,
          member3,
          solo1,
          quitter,
          outsider,
        ],
        challengeId,
        teamAId,
        teamBId,
        gridIds: [gridA, gridB, gridX],
      };
    });

    afterEach(async () => {
      if (!fx) return;
      const { db, schema, eq, inArray, getPayloadClient } = m;

      const cells = await db
        .select({ id: schema.workCells.id })
        .from(schema.workCells)
        .where(inArray(schema.workCells.gridId, fx.gridIds));
      if (cells.length > 0) {
        await db.delete(schema.workCellResults).where(
          inArray(
            schema.workCellResults.cellId,
            cells.map((c) => c.id),
          ),
        );
        await db
          .delete(schema.workCells)
          .where(inArray(schema.workCells.gridId, fx.gridIds));
      }
      await db
        .delete(schema.workGrids)
        .where(inArray(schema.workGrids.id, fx.gridIds));
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

    it("aggregates the funnel, team counts, and competitive-grid cell buckets", async () => {
      const operator = userCaller(fx.sponsorId);
      const result = await operator.hackathon.analytics({
        challengeId: fx.challengeId,
      });

      // Funnel: 4 enrolled, 3 teamed (75%), 2 on the submitted team (2/3).
      // The abandoned enrollment (quitter, still on submitted team A) is
      // excluded from every stage.
      expect(result.funnel.enrolled.count).toBe(4);
      expect(result.funnel.teamed).toEqual({ count: 3, rate: 0.75 });
      expect(result.funnel.submitted.count).toBe(2);
      expect(result.funnel.submitted.rate).toBeCloseTo(2 / 3);

      // Teams: disbanded C excluded; only A submitted.
      expect(result.teams).toEqual({ total: 2, submitted: 1 });

      // Cells (competitive only — the collaborative cell is excluded):
      // 6 total; claimed = claimed+completed+failed = 4; reported = 3;
      // verified = 1.
      expect(result.cells.total).toBe(6);
      expect(result.cells.claimed).toEqual({ count: 4, rate: 4 / 6 });
      expect(result.cells.reported).toEqual({ count: 3, rate: 3 / 6 });
      expect(result.cells.verified).toEqual({ count: 1, rate: 1 / 6 });
    });

    it("rejects callers who are not the hackathon's operator", async () => {
      // An enrolled participant is not enough.
      await expect(
        userCaller(fx.member1).hackathon.analytics({
          challengeId: fx.challengeId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      // Nor is a random signed-in user.
      await expect(
        userCaller(fx.outsider).hackathon.analytics({
          challengeId: fx.challengeId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  },
);
