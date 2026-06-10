/**
 * DB-INTEGRATION test for the hackathon PARTICIPANT-WORKSPACE human path
 * (Plan 4). It proves, end to end against a REAL local DB, that a human team
 * member can claim → report a competitive work-cell, that an organizer (the
 * challenge sponsor) can verify it via the SAME work-grid verifyCellResult
 * path used for agents, and that the heatmap + team activity feed reflect it —
 * while a non-member is blocked and a double-claim is rejected CONFLICT.
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
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/server/api/routers/team-workspace.integration.test.ts
 *
 * What it exercises against the REAL local DB, end to end:
 *   - a real Payload challenge whose creatorId is the sponsor (so the sponsor
 *     can administer/verify the challenge-scoped competitive grid),
 *   - a locked team with two members (active challengeEnrollments carrying the
 *     teamId) and an outsider who is NOT on the team,
 *   - a competitive work-grid for the team with pending cells,
 *   - a member claims a cell, reports a result, the sponsor verifies it, and we
 *     assert the workspace cells view, the public teamHeatmap, and the team
 *     activity feed all reflect the human claim/report/verify path,
 *   - a non-member is FORBIDDEN, and a second member double-claiming a claimed
 *     cell is rejected CONFLICT (atomic claim guard).
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

describe.skipIf(!RUN_DB)(
  "team-workspace human claim/report/verify path [DB integration]",
  () => {
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

    // ── Per-test fixture: a unique sponsor + two members + outsider + locked
    //    team + a challenge-scoped competitive grid, torn down after. ──────────

    type Fixture = {
      suffix: string;
      /** The challenge sponsor (a real Payload challenge's creatorId). */
      sponsorId: string;
      /** Two users enrolled on the team. */
      memberUserId: string;
      otherMemberUserId: string;
      /** A user enrolled in the challenge but NOT on the team. */
      outsiderUserId: string;
      challengeId: number;
      teamId: string;
      gridId: string;
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

    /** Seed a user + member profile (awardXp/presence joins need a profile). */
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
      const sponsorId = `it-sponsor-${suffix}`;
      const memberUserId = `it-member-${suffix}`;
      const otherMemberUserId = `it-member2-${suffix}`;
      const outsiderUserId = `it-outsider-${suffix}`;
      const eventId = 12345;
      const taskType = "solve-code-cell";

      // Users: sponsor (challenge creator + grid verifier), two team members,
      // and an outsider enrolled in the challenge but NOT on the team.
      await seedUser(sponsorId, "Integration Sponsor");
      await seedUser(memberUserId, "Integration Member");
      await seedUser(otherMemberUserId, "Integration Member 2");
      await seedUser(outsiderUserId, "Integration Outsider");

      // A REAL Payload challenge whose creatorId is the sponsor — this is what
      // requireGridAdmin (work-grid verifyCellResult) checks: only the
      // challenge's creatorId may verify a challenge-scoped grid's cells.
      const payload = await getPayloadClient();
      const slug = `it-team-ws-${suffix}`;
      const challenge = await payload.create({
        collection: "challenges",
        data: {
          title: `Integration Team Workspace ${suffix}`,
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
      const challengeId = challenge.id as number;

      // A locked team for that challenge, captained by the first member.
      const [team] = await db
        .insert(schema.teams)
        .values({
          challengeId,
          eventId,
          name: `Falcon ${suffix.slice(-6)}`,
          captainId: memberUserId,
          joinCode: `TW-${suffix.slice(-8).toUpperCase()}`,
          maxSize: 5,
          status: "locked",
        })
        .returning();

      // Active enrollments carrying the teamId make the two members "on" the
      // team (ownerOnTeam); the outsider is enrolled but carries no teamId.
      await db.insert(schema.challengeEnrollments).values([
        {
          userId: memberUserId,
          challengeId,
          teamId: team!.id,
          status: "active",
        },
        {
          userId: otherMemberUserId,
          challengeId,
          teamId: team!.id,
          status: "active",
        },
        {
          userId: outsiderUserId,
          challengeId,
          teamId: null,
          status: "active",
        },
      ]);

      // The team's single competitive, challenge-scoped grid + one pending cell.
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
      await db.insert(schema.workCells).values({
        gridId: grid!.id,
        taskType,
        verificationMode: "test",
        status: "pending",
        deadlineMinutes: 30,
      });

      fx = {
        suffix,
        sponsorId,
        memberUserId,
        otherMemberUserId,
        outsiderUserId,
        challengeId,
        teamId: team!.id,
        gridId: grid!.id,
      };
    });

    afterEach(async () => {
      if (!fx) return;
      const { db, schema, eq, getPayloadClient } = m;

      // FK-safe teardown: results → cells → grid; activity/presence/enrollments;
      // team; then the four users + profiles; then the Payload challenge.
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
      await db.delete(schema.workGrids).where(eq(schema.workGrids.id, fx.gridId));

      await db
        .delete(schema.teamActivityEvents)
        .where(eq(schema.teamActivityEvents.teamId, fx.teamId));
      await db
        .delete(schema.teamPresence)
        .where(eq(schema.teamPresence.teamId, fx.teamId));
      await db
        .delete(schema.challengeEnrollments)
        .where(eq(schema.challengeEnrollments.challengeId, fx.challengeId));
      await db.delete(schema.teams).where(eq(schema.teams.id, fx.teamId));

      for (const id of [
        fx.memberUserId,
        fx.otherMemberUserId,
        fx.outsiderUserId,
        fx.sponsorId,
      ]) {
        await db
          .delete(schema.memberProfiles)
          .where(eq(schema.memberProfiles.userId, id));
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }

      try {
        const payload = await getPayloadClient();
        await payload.delete({
          collection: "challenges",
          id: fx.challengeId,
        });
      } catch {
        // Best-effort: a failed challenge delete must not fail the suite teardown.
      }
    });

    // ── Assertion 1: a non-member cannot even read the team's cells ───────────

    it("blocks a non-member (outsider) from reading the team's cells with FORBIDDEN", async () => {
      const outsider = userCaller(fx.outsiderUserId);
      await expect(
        outsider.teamWorkspace.cells({ teamId: fx.teamId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    // ── Assertion 2: full human path — claim → report → verify → heatmap ──────

    it("a member claims, reports, the sponsor verifies, and the workspace + heatmap + activity feed all reflect the human path", async () => {
      const { db, schema, eq } = m;
      const member = userCaller(fx.memberUserId);
      const sponsor = userCaller(fx.sponsorId);

      // The lone pending cell of this team's grid.
      const [seedCell] = await db
        .select({ id: schema.workCells.id })
        .from(schema.workCells)
        .where(eq(schema.workCells.gridId, fx.gridId))
        .limit(1);
      const cellId = seedCell!.id;

      // Member claims the cell → locked to this user.
      const claimed = await member.teamWorkspace.claimCellAsMember({
        cellId,
        teamId: fx.teamId,
      });
      expect(claimed.status).toBe("claimed");
      expect(claimed.claimedByUserId).toBe(fx.memberUserId);

      // Member reports a result → cell completed, result pending verification.
      await member.teamWorkspace.reportResult({
        cellId,
        teamId: fx.teamId,
        output: "robot arm built; video: https://example.com/x",
      });

      // The workspace cells view: completed + awaiting-verification heat, with a
      // human-authored result (userId set, agentId null).
      const afterReport = await member.teamWorkspace.cells({
        teamId: fx.teamId,
      });
      const reported = afterReport.find((c) => c.id === cellId);
      expect(reported).toBeDefined();
      expect(reported!.status).toBe("completed");
      expect(reported!.heatState).toBe("completed");
      expect(reported!.result?.userId).toBe(fx.memberUserId);
      expect(reported!.result?.agentId).toBeNull();

      // The challenge sponsor verifies via the SAME work-grid path agents use.
      const verifyRes = await sponsor.workGrid.verifyCellResult({
        cellId,
        outcome: "verified",
      });
      expect(verifyRes.outcome).toBe("verified");

      // The workspace now shows the dark-green terminal "verified" heat.
      const afterVerify = await member.teamWorkspace.cells({
        teamId: fx.teamId,
      });
      const verified = afterVerify.find((c) => c.id === cellId);
      expect(verified!.heatState).toBe("verified");

      // The public, content-free team heatmap reflects the verified cell.
      const heatmap = await sponsor.hackathon.teamHeatmap({
        teamId: fx.teamId,
      });
      expect(heatmap.some((h) => h.heatState === "verified")).toBe(true);

      // The team activity feed recorded both forward actions.
      const activity = await member.teamWorkspace.activity({
        teamId: fx.teamId,
      });
      const types = activity.map((e) => e.type);
      expect(types).toContain("claimed");
      expect(types).toContain("reported");
    });

    // ── Assertion 3: a second member double-claiming a claimed cell → CONFLICT ─

    it("a second member claiming an already-claimed cell is rejected CONFLICT (atomic claim guard)", async () => {
      const { db, schema, eq } = m;
      const member = userCaller(fx.memberUserId);
      const otherMember = userCaller(fx.otherMemberUserId);

      const [seedCell] = await db
        .select({ id: schema.workCells.id })
        .from(schema.workCells)
        .where(eq(schema.workCells.gridId, fx.gridId))
        .limit(1);
      const cellId = seedCell!.id;

      // First member claims it.
      const claimed = await member.teamWorkspace.claimCellAsMember({
        cellId,
        teamId: fx.teamId,
      });
      expect(claimed.status).toBe("claimed");
      expect(claimed.claimedByUserId).toBe(fx.memberUserId);

      // The second member (also on the team) cannot steal the now-claimed cell —
      // the atomic pending/requeued → claimed flip matches no row → CONFLICT.
      await expect(
        otherMember.teamWorkspace.claimCellAsMember({
          cellId,
          teamId: fx.teamId,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      // The cell is still claimed by the first member, not the second.
      const [row] = await db
        .select({ claimedByUserId: schema.workCells.claimedByUserId })
        .from(schema.workCells)
        .where(eq(schema.workCells.id, cellId));
      expect(row!.claimedByUserId).toBe(fx.memberUserId);
    });
  },
);
