/**
 * DB-INTEGRATION test for the hackathon TASK-PROGRESS path (#hub). It proves,
 * end to end against a REAL local DB, that:
 *
 *   - the cell's CLAIMANT can set a cell's manual progress status, and the team
 *     CAPTAIN can set progress on an UNCLAIMED cell;
 *   - a non-member is FORBIDDEN, and a team member who is neither the claimant
 *     nor the captain is FORBIDDEN;
 *   - setting progress is NON-SCORING (ADR-0029): it never creates a
 *     workCellResult and never changes the cell's verification `status`;
 *   - `hackathon.agentStats(challengeId)` returns per-agent
 *     claimed/reported/verified counts attributed to the right team.
 *
 * ── This suite AUTO-SKIPS unless you explicitly opt in. ──────────────────────
 * A plain `pnpm test` / `pnpm exec vitest run` SKIPS every test here and NEVER
 * opens a database connection (the gate is evaluated before any `db` import or
 * `beforeAll`, so nothing connects). It only runs when BOTH hold:
 *
 *   1. RUN_DB_TESTS === "1"  (explicit human opt-in), AND
 *   2. a LOCAL-looking database is configured — either NEON_LOCAL_PROXY is set
 *      (the Dockerised wsproxy, see src/server/db/index.ts), or DATABASE_URL
 *      points at a local host (localhost / 127.0.0.1 / a Docker service name
 *      like `db`/`postgres`). A cloud Neon host (*.neon.tech, *.aws.neon.tech)
 *      is explicitly rejected so this can never touch the production DB.
 *
 * Enable it (once Docker Postgres + wsproxy + Payload are up — see the repo's
 * docker compose dev stack) with:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
 *     NEON_LOCAL_PROXY=localhost:5433 \
 *     pnpm exec vitest run src/server/api/routers/hackathon-task-progress.integration.test.ts
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

/**
 * The single source of truth for "should this suite run?". Evaluated at module
 * load BEFORE any db connection is created, so a skipped run never connects.
 */
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;

  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";

  // A cloud DATABASE_URL is a hard stop even if a proxy is set — refuse to risk
  // the production Neon DB.
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;

  // Local wsproxy present (Dockerised dev) ⇒ local. Otherwise require a
  // local-looking DATABASE_URL.
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();

// ── The integration suite (skipped wholesale unless opted in) ───────────────

describe.skipIf(!RUN_DB)("hackathon task progress + agentStats [DB integration]", () => {
  // Lazily-resolved modules — only imported INSIDE the suite so a skipped run
  // pulls in neither the db client nor the tRPC graph nor Payload.
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

    // Fail loudly if a cloud URL somehow slipped through the gate.
    const url = process.env.DATABASE_URL ?? "";
    if (looksLikeCloudNeon(url)) {
      throw new Error(
        "Refusing to run DB integration tests against a cloud Neon DATABASE_URL.",
      );
    }
  });

  // ── Per-test fixture: a captain + two members + outsider + locked team, a
  //    competitive challenge-scoped grid, a claimed cellA, an unclaimed cellB,
  //    an unclaimed cellC (for the agent's verified result), and an agent. ────

  type Fixture = {
    suffix: string;
    /** Challenge creator (a real Payload challenge's creatorId) + agent owner. */
    sponsorId: string;
    /** Team captain (on the team). */
    captainUserId: string;
    /** Team member who CLAIMS cellA. */
    memberUserId: string;
    /** Team member who is neither claimant nor captain. */
    secondMemberUserId: string;
    /** Enrolled in the challenge but NOT on the team. */
    outsiderUserId: string;
    allUserIds: string[];
    challengeId: number;
    eventId: number;
    teamId: string;
    gridId: string;
    /** Claimed by memberUserId (status "claimed"). */
    cellAId: string;
    /** Unclaimed/pending. */
    cellBId: string;
    /** Unclaimed/pending — used for the agent's verified result. */
    cellCId: string;
    /** A commissioned agent owned by the sponsor. */
    agentId: string;
  };
  let fx: Fixture;

  /** Build a logged-in member-session tRPC caller (protected procedures). */
  function userCaller(userId: string) {
    return m.createCaller({
      db: m.db,
      session: {
        // Minimal shape protectedProcedure needs: ctx.session.user.id.
        user: { id: userId },
      } as never,
      headers: new Headers(),
    });
  }

  /** Seed a user + member profile. */
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
    const sponsorId = `it-tp-sponsor-${suffix}`;
    const captainUserId = `it-tp-captain-${suffix}`;
    const memberUserId = `it-tp-member-${suffix}`;
    const secondMemberUserId = `it-tp-member2-${suffix}`;
    const outsiderUserId = `it-tp-outsider-${suffix}`;
    const taskType = "solve-code-cell";

    await seedUser(sponsorId, "TP Sponsor");
    await seedUser(captainUserId, "TP Captain");
    await seedUser(memberUserId, "TP Member");
    await seedUser(secondMemberUserId, "TP Member 2");
    await seedUser(outsiderUserId, "TP Outsider");

    // A REAL Payload challenge whose creatorId is the sponsor.
    const payload = await getPayloadClient();
    const slug = `it-tp-${suffix}`;
    const challenge = await payload.create({
      collection: "challenges",
      data: {
        title: `Integration Task Progress ${suffix}`,
        slug,
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

    // A published hackathon event bound to the challenge.
    const event = await payload.create({
      collection: "events",
      data: {
        title: `Integration TP Event ${suffix}`,
        slug: `it-tp-event-${suffix}`,
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

    // A locked team for that challenge, captained by captainUserId.
    const [team] = await db
      .insert(schema.teams)
      .values({
        challengeId,
        eventId: Number(event.id),
        name: `TaskProg ${suffix.slice(-6)}`,
        captainId: captainUserId,
        joinCode: `TP-${suffix.slice(-8).toUpperCase()}`.slice(0, 20),
        maxSize: 5,
        status: "locked",
      })
      .returning();

    // Active enrollments carrying the teamId make captain + two members "on" the
    // team (ownerOnTeam); the outsider is enrolled but carries no teamId.
    await db.insert(schema.challengeEnrollments).values([
      { userId: captainUserId, challengeId, teamId: team!.id, status: "active" },
      { userId: memberUserId, challengeId, teamId: team!.id, status: "active" },
      {
        userId: secondMemberUserId,
        challengeId,
        teamId: team!.id,
        status: "active",
      },
      { userId: outsiderUserId, challengeId, teamId: null, status: "active" },
    ]);

    // The team's single competitive, challenge-scoped grid.
    const [grid] = await db
      .insert(schema.workGrids)
      .values({
        mode: "competitive",
        status: "active",
        challengeId,
        communityId: null,
        teamId: team!.id,
      })
      .returning();

    // cellA — claimed by memberUserId. cellB + cellC — pending/unclaimed.
    const [cellA] = await db
      .insert(schema.workCells)
      .values({
        gridId: grid!.id,
        taskType,
        verificationMode: "test",
        status: "claimed",
        claimedByUserId: memberUserId,
        deadlineMinutes: 30,
      })
      .returning();
    const [cellB] = await db
      .insert(schema.workCells)
      .values({
        gridId: grid!.id,
        taskType,
        verificationMode: "test",
        status: "pending",
        deadlineMinutes: 30,
      })
      .returning();
    const [cellC] = await db
      .insert(schema.workCells)
      .values({
        gridId: grid!.id,
        taskType,
        verificationMode: "test",
        status: "pending",
        deadlineMinutes: 30,
      })
      .returning();

    // A commissioned agent owned by the sponsor.
    const [agent] = await db
      .insert(schema.agentProfiles)
      .values({
        ownerId: sponsorId,
        name: `TP Agent ${suffix.slice(-6)}`,
        status: "active",
      })
      .returning();

    fx = {
      suffix,
      sponsorId,
      captainUserId,
      memberUserId,
      secondMemberUserId,
      outsiderUserId,
      allUserIds: [
        sponsorId,
        captainUserId,
        memberUserId,
        secondMemberUserId,
        outsiderUserId,
      ],
      challengeId,
      eventId: Number(event.id),
      teamId: team!.id,
      gridId: grid!.id,
      cellAId: cellA!.id,
      cellBId: cellB!.id,
      cellCId: cellC!.id,
      agentId: agent!.id,
    };
  });

  afterEach(async () => {
    if (!fx) return;
    const { db, schema, eq, getPayloadClient } = m;

    // FK-safe teardown: activity events first (they FK work_cell via cell_id),
    // then results → cells → grid; agent; presence/enrollments; team; then the
    // users + profiles; then the Payload event + challenge.
    await db
      .delete(schema.teamActivityEvents)
      .where(eq(schema.teamActivityEvents.teamId, fx.teamId));
    const cells = await db
      .select({ id: schema.workCells.id })
      .from(schema.workCells)
      .where(eq(schema.workCells.gridId, fx.gridId));
    for (const c of cells) {
      await db
        .delete(schema.workCellResults)
        .where(eq(schema.workCellResults.cellId, c.id));
    }
    await db
      .delete(schema.workCells)
      .where(eq(schema.workCells.gridId, fx.gridId));
    await db
      .delete(schema.workGrids)
      .where(eq(schema.workGrids.id, fx.gridId));
    await db
      .delete(schema.agentProfiles)
      .where(eq(schema.agentProfiles.id, fx.agentId));

    await db
      .delete(schema.teamPresence)
      .where(eq(schema.teamPresence.teamId, fx.teamId));
    await db
      .delete(schema.challengeEnrollments)
      .where(eq(schema.challengeEnrollments.challengeId, fx.challengeId));
    await db.delete(schema.teams).where(eq(schema.teams.id, fx.teamId));

    for (const id of fx.allUserIds) {
      await db
        .delete(schema.memberProfiles)
        .where(eq(schema.memberProfiles.userId, id));
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }

    try {
      const payload = await getPayloadClient();
      await payload.delete({ collection: "events", id: fx.eventId });
      await payload.delete({ collection: "challenges", id: fx.challengeId });
    } catch {
      // Best-effort: a failed Payload delete must not fail the suite teardown.
    }
  });

  it("lets the claimant set progress without touching verification or score", async () => {
    const updated = await userCaller(fx.memberUserId).teamWorkspace.updateCellProgress({
      cellId: fx.cellAId,
      teamId: fx.teamId,
      status: "in_progress",
      note: "started",
    });
    expect(updated!.progressStatus).toBe("in_progress");

    // verification untouched: cell.status unchanged, no result row
    const [cell] = await m.db
      .select()
      .from(m.schema.workCells)
      .where(m.eq(m.schema.workCells.id, fx.cellAId));
    expect(cell!.progressStatus).toBe("in_progress");
    expect(cell!.status).toBe("claimed"); // unchanged by the progress update
    const results = await m.db
      .select()
      .from(m.schema.workCellResults)
      .where(m.eq(m.schema.workCellResults.cellId, fx.cellAId));
    expect(results).toHaveLength(0);
  });

  it("lets the captain set progress on an unclaimed cell", async () => {
    const updated = await userCaller(fx.captainUserId).teamWorkspace.updateCellProgress({
      cellId: fx.cellBId,
      teamId: fx.teamId,
      status: "blocked",
    });
    expect(updated!.progressStatus).toBe("blocked");
  });

  it("FORBIDS a non-member from setting progress", async () => {
    await expect(
      userCaller(fx.outsiderUserId).teamWorkspace.updateCellProgress({
        cellId: fx.cellAId,
        teamId: fx.teamId,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("FORBIDS a member who is neither claimant nor captain", async () => {
    await expect(
      userCaller(fx.secondMemberUserId).teamWorkspace.updateCellProgress({
        cellId: fx.cellAId,
        teamId: fx.teamId,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("agentStats returns per-agent claimed/reported/verified for the hackathon", async () => {
    const { db, schema, eq } = m;

    // Seed the agent's contribution directly: it CLAIMS cellB in the team's
    // competitive grid (so teamId attribution works) and authors a VERIFIED
    // result on a DISTINCT cell (cellC) to avoid the per-cell unique index.
    await db
      .update(schema.workCells)
      .set({ status: "claimed", claimedBy: fx.agentId, claimedByUserId: null })
      .where(eq(schema.workCells.id, fx.cellBId));
    await db.insert(schema.workCellResults).values({
      cellId: fx.cellCId,
      agentId: fx.agentId,
      output: "agent result",
      verificationOutcome: "verified",
      verifiedAt: new Date(),
    });

    const stats = await userCaller(fx.memberUserId).hackathon.agentStats({
      challengeId: fx.challengeId,
    });
    const a = stats.find((s) => s.agentId === fx.agentId);
    expect(a).toBeDefined();
    expect(a!.teamId).toBe(fx.teamId);
    expect(a!.claimed).toBeGreaterThanOrEqual(1);
    expect(a!.verified).toBe(1);
  });
});
