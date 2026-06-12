/**
 * DB-INTEGRATION test for the People's Choice vote (#169). Proves, against a
 * REAL local DB, that:
 *
 *   - one member gets exactly ONE vote per hackathon (unique
 *     (challenge_id, user_id) index) and re-voting RETARGETS that single row
 *     (UPSERT), it never adds a second one;
 *   - the window follows the lifecycle: closed while teams form, open at
 *     roster lock, closed again at finalize;
 *   - only submitted teams of the challenge are votable;
 *   - votes are NON-SCORING (ADR-0029): a team holding every community vote
 *     still loses the scored ranking, and the People's Choice team only
 *     surfaces after finalize.
 *
 * ── This suite AUTO-SKIPS unless you explicitly opt in. ──────────────────────
 * Same gate as hackathon-certificates.integration.test.ts: a plain `pnpm test`
 * SKIPS everything here and never opens a db connection. It only runs when
 * BOTH:
 *
 *   1. RUN_DB_TESTS === "1", AND
 *   2. a LOCAL-looking database is configured (NEON_LOCAL_PROXY, or a
 *      localhost/docker DATABASE_URL). Cloud Neon hosts are hard-rejected.
 *
 * Enable with:
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/server/api/routers/hackathon-peoples-choice.integration.test.ts
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

describe.skipIf(!RUN_DB)("people's choice vote [DB integration]", () => {
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
    voter1: string;
    voter2: string;
    allUserIds: string[];
    challengeId: number;
    eventId: number;
    /** Submitted first → wins the scored speed tiebreak. */
    teamAId: string;
    /** Submitted later → loses the scored ranking even with every vote. */
    teamBId: string;
    /** Never submitted → not votable. */
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

  function anonCaller() {
    return m.createCaller({
      db: m.db,
      session: null,
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

  async function setTeamStatus(status: "forming" | "locked") {
    const { db, schema, eq } = m;
    await db
      .update(schema.teams)
      .set({ status })
      .where(eq(schema.teams.challengeId, fx.challengeId));
  }

  async function voteRows() {
    const { db, schema, eq } = m;
    return db
      .select()
      .from(schema.hackathonVotes)
      .where(eq(schema.hackathonVotes.challengeId, fx.challengeId));
  }

  beforeEach(async () => {
    const { db, schema, getPayloadClient } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const sponsorId = `it-pc-sponsor-${suffix}`;
    const voter1 = `it-pc-v1-${suffix}`;
    const voter2 = `it-pc-v2-${suffix}`;

    await seedUser(sponsorId, "PC Sponsor");
    await seedUser(voter1, "PC Voter 1");
    await seedUser(voter2, "PC Voter 2");

    const payload = await getPayloadClient();
    const challenge = await payload.create({
      collection: "challenges",
      data: {
        title: `Integration Peoples Choice ${suffix}`,
        slug: `it-pc-${suffix}`,
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

    // A PUBLISHED hackathon event bound to the challenge: the vote window is
    // derived from event status + team markers (phase.ts), so without a
    // non-draft event everything reads as "draft" and voting never opens.
    const event = await payload.create({
      collection: "events",
      data: {
        title: `Integration PC Event ${suffix}`,
        slug: `it-pc-event-${suffix}`,
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
        type: "hackathon" as const,
        status: "published" as const,
        date: "2026-06-12",
        location: "Test Lab",
        challengeId: String(challengeId),
      },
      context: { skipGeocode: true },
    });

    // Three locked teams: A submitted first, B a minute later, C never.
    const t0 = new Date("2026-06-12T10:00:00Z");
    const t1 = new Date("2026-06-12T10:01:00Z");
    const mkTeam = async (
      name: string,
      submittedAt: Date | null,
      code: string,
    ) => {
      const [team] = await db
        .insert(schema.teams)
        .values({
          challengeId,
          eventId: Number(event.id),
          name,
          captainId: sponsorId,
          joinCode: `${code}-${suffix.slice(-8).toUpperCase()}`.slice(0, 20),
          maxSize: 5,
          status: "locked",
          submittedAt,
        })
        .returning();
      return team!.id;
    };
    const teamAId = await mkTeam(`A ${suffix.slice(-6)}`, t0, "PA");
    const teamBId = await mkTeam(`B ${suffix.slice(-6)}`, t1, "PB");
    const teamCId = await mkTeam(`C ${suffix.slice(-6)}`, null, "PC");

    fx = {
      sponsorId,
      voter1,
      voter2,
      allUserIds: [sponsorId, voter1, voter2],
      challengeId,
      eventId: Number(event.id),
      teamAId,
      teamBId,
      teamCId,
    };
  });

  afterEach(async () => {
    if (!fx) return;
    const { db, schema, eq, inArray, getPayloadClient } = m;

    await db
      .delete(schema.hackathonVotes)
      .where(eq(schema.hackathonVotes.challengeId, fx.challengeId));
    await db
      .delete(schema.hackathonCertificates)
      .where(eq(schema.hackathonCertificates.challengeId, fx.challengeId));
    await db
      .delete(schema.notifications)
      .where(inArray(schema.notifications.userId, fx.allUserIds));
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
    await payload.delete({ collection: "events", id: fx.eventId });
    await payload.delete({ collection: "challenges", id: fx.challengeId });
  });

  it("gives each member ONE changeable vote: re-voting retargets the single row (UPSERT on the unique index)", async () => {
    const v1 = userCaller(fx.voter1);
    const v2 = userCaller(fx.voter2);

    await v1.hackathon.castPeoplesChoiceVote({
      challengeId: fx.challengeId,
      teamId: fx.teamAId,
    });
    let rows = await voteRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe(fx.teamAId);

    // Change of heart: still exactly one row, now pointing at team B.
    await v1.hackathon.castPeoplesChoiceVote({
      challengeId: fx.challengeId,
      teamId: fx.teamBId,
    });
    rows = await voteRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe(fx.teamBId);

    // A second member's vote is a separate row.
    await v2.hackathon.castPeoplesChoiceVote({
      challengeId: fx.challengeId,
      teamId: fx.teamBId,
    });
    rows = await voteRows();
    expect(rows).toHaveLength(2);

    const state = await anonCaller().hackathon.peoplesChoiceState({
      challengeId: fx.challengeId,
    });
    expect(state.votingOpen).toBe(true);
    expect(state.counts).toEqual([{ teamId: fx.teamBId, votes: 2 }]);
    expect(state.viewerVote).toBeNull(); // anonymous viewer

    const v1State = await v1.hackathon.peoplesChoiceState({
      challengeId: fx.challengeId,
    });
    expect(v1State.viewerVote).toBe(fx.teamBId);
  });

  it("enforces the window (closed while forming, closed after finalize) and submitted-only targets", async () => {
    const v1 = userCaller(fx.voter1);

    // Teams still forming → phase "live" → window closed.
    await setTeamStatus("forming");
    await expect(
      v1.hackathon.castPeoplesChoiceVote({
        challengeId: fx.challengeId,
        teamId: fx.teamAId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Rosters locked → open, but an unsubmitted team is not votable.
    await setTeamStatus("locked");
    await expect(
      v1.hackathon.castPeoplesChoiceVote({
        challengeId: fx.challengeId,
        teamId: fx.teamCId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Finalize freezes the award: the window closes.
    await userCaller(fx.sponsorId).hackathon.finalizeHackathon({
      challengeId: fx.challengeId,
    });
    await expect(
      v1.hackathon.castPeoplesChoiceVote({
        challengeId: fx.challengeId,
        teamId: fx.teamAId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is non-scoring: every vote on team B and team A still wins the scored rank; People's Choice surfaces only after finalize", async () => {
    const { db, schema, eq } = m;

    await userCaller(fx.voter1).hackathon.castPeoplesChoiceVote({
      challengeId: fx.challengeId,
      teamId: fx.teamBId,
    });
    await userCaller(fx.voter2).hackathon.castPeoplesChoiceVote({
      challengeId: fx.challengeId,
      teamId: fx.teamBId,
    });

    // Before finalize the award does not exist yet.
    const before = await anonCaller().hackathon.peoplesChoiceState({
      challengeId: fx.challengeId,
    });
    expect(before.peoplesChoiceTeamId).toBeNull();

    // Scored result: equal (zero) scores → speed tiebreak → A wins, despite
    // team B holding 100% of the community vote.
    const result = await userCaller(fx.sponsorId).hackathon.finalizeHackathon({
      challengeId: fx.challengeId,
    });
    expect(result.winnerTeamId).toBe(fx.teamAId);

    const [teamB] = await db
      .select({ score: schema.teams.score, finalRank: schema.teams.finalRank })
      .from(schema.teams)
      .where(eq(schema.teams.id, fx.teamBId));
    expect(teamB!.score).toBe(0); // votes never feed the score
    expect(teamB!.finalRank).toBe(2);

    const after = await anonCaller().hackathon.peoplesChoiceState({
      challengeId: fx.challengeId,
    });
    expect(after.votingOpen).toBe(false);
    expect(after.peoplesChoiceTeamId).toBe(fx.teamBId);
  });
});
